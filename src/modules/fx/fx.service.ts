import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CURRENCIES, type Currency, USD } from '../../common/money/currency.js';
import { convertAmount, crossRate, Dec } from '../../common/money/money.js';
import {
  FX_PROVIDER,
  type FxProvider,
  type FxQuote,
  type FxSnapshot,
  parseSnapshot,
  type RateSource,
  STATIC_SNAPSHOT,
  type UsdRates,
} from '../../common/types.js';
import { AppConfig } from '../../config/index.js';
import { describeError } from '../../redis/failOpen.js';
import { RedisService } from '../../redis/redis.service.js';
import { cacheKeys } from '../../redis/redisKey.js';
import type { RateDto, RatesDto } from './dto/rates.dto.js';
import { FxRateRepository } from './repository/rate.repository.js';

@Injectable()
export class FxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FxService.name);
  private readonly config = AppConfig;
  private readonly instanceId = randomUUID();
  private live: FxSnapshot | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(FX_PROVIDER) private readonly provider: FxProvider,
    private readonly fxRateRepository: FxRateRepository,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.redisService.subscribe(cacheKeys.fxUpdatedChannel, (message) => this.adopt(message));
    await this.loadPersisted();
    await this.tick();
    this.timer = setInterval(() => void this.tick(), this.config.fx.refreshMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const leader = await this.redisService.acquireLock(cacheKeys.fxRefreshLock, this.instanceId, this.config.fx.refreshMs);
    if (leader === false) {
      await this.pullShared();
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<boolean> {
    let perUsd: UsdRates;
    try {
      perUsd = await this.fetchWithRetry();
    } catch (err) {
      this.logger.warn(`FX provider ${this.provider.name} failed (${describeError(err)}); serving ${this.current().source} rates`);
      return false;
    }
    const snapshot: FxSnapshot = { perUsd, fetchedAt: new Date().toISOString() };
    this.live = snapshot;
    try {
      await this.fxRateRepository.saveSnapshot(snapshot);
    } catch (err) {
      this.logger.warn(`Could not persist FX rates: ${describeError(err)}`);
    }
    const payload = JSON.stringify(snapshot);
    await this.redisService.setValue(cacheKeys.fxSnapshot, payload, this.config.fx.maxStalenessMs);
    await this.redisService.publish(cacheKeys.fxUpdatedChannel, payload);
    return true;
  }

  /** Fresh live rates, else the last good live rates within FX_MAX_STALENESS_MS, else the static table. */
  current(): { snapshot: FxSnapshot; source: RateSource } {
    if (this.live) {
      const age = Date.now() - Date.parse(this.live.fetchedAt);
      if (age <= 2 * this.config.fx.refreshMs) return { snapshot: this.live, source: 'LIVE' };
      if (age <= this.config.fx.maxStalenessMs) return { snapshot: this.live, source: 'CACHED' };
    }
    return { snapshot: STATIC_SNAPSHOT, source: 'FALLBACK' };
  }

  quote(from: Currency, to: Currency): FxQuote {
    const { snapshot, source } = this.current();
    const fromPerUsd = snapshot.perUsd[from];
    const toPerUsd = snapshot.perUsd[to];
    return {
      from,
      to,
      rate: crossRate(fromPerUsd, toPerUsd),
      source,
      asOf: new Date(snapshot.fetchedAt),
      convert: (minor) => convertAmount(minor, fromPerUsd, toPerUsd),
    };
  }

  totalInUsd(balances: Record<Currency, bigint>): { amount: bigint; source: RateSource; asOf: Date } {
    const { snapshot, source } = this.current();
    let amount = 0n;
    for (const currency of CURRENCIES) {
      amount += convertAmount(balances[currency], snapshot.perUsd[currency], snapshot.perUsd[USD]);
    }
    return { amount, source, asOf: new Date(snapshot.fetchedAt) };
  }

  allRates(): RatesDto {
    const { snapshot, source } = this.current();
    const rates: RateDto[] = [];
    for (const from of CURRENCIES) {
      for (const to of CURRENCIES) {
        if (from === to) continue;
        rates.push({ from, to, rate: crossRate(snapshot.perUsd[from], snapshot.perUsd[to]), source, fetchedAt: snapshot.fetchedAt });
      }
    }
    return { base: USD, source, fetchedAt: snapshot.fetchedAt, stale: source !== 'LIVE', usdRates: { ...snapshot.perUsd }, rates };
  }

  private async fetchWithRetry(): Promise<UsdRates> {
    try {
      return await this.provider.fetchUsdRates();
    } catch {
      await delay(250);
      return this.provider.fetchUsdRates();
    }
  }

  private async loadPersisted(): Promise<void> {
    try {
      const rows = await this.fxRateRepository.find();
      if (rows.length !== CURRENCIES.length) return;
      const perUsd = {} as UsdRates;
      for (const row of rows) perUsd[row.currency] = new Dec(row.perUsd).toFixed();
      const oldest = Math.min(...rows.map((row) => row.fetchedAt.getTime()));
      this.adoptSnapshot({ perUsd, fetchedAt: new Date(oldest).toISOString() });
    } catch (err) {
      this.logger.warn(`Could not load persisted FX rates: ${describeError(err)}`);
    }
  }

  private async pullShared(): Promise<void> {
    const raw = await this.redisService.getValue(cacheKeys.fxSnapshot);
    if (typeof raw === 'string') this.adopt(raw);
  }

  private adopt(raw: string): void {
    try {
      this.adoptSnapshot(parseSnapshot(raw));
    } catch (err) {
      this.logger.warn(`Ignoring FX snapshot: ${describeError(err)}`);
    }
  }

  private adoptSnapshot(snapshot: FxSnapshot): void {
    if (!this.live || snapshot.fetchedAt > this.live.fetchedAt) this.live = snapshot;
  }
}
