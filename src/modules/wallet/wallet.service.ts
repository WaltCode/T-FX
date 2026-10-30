import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { type DomainError, errors } from '../../common/errors/domain.error.js';
import { CURRENCIES, type Currency, USD } from '../../common/money/currency.js';
import { formatAmount } from '../../common/money/money.js';
import { AppConfig } from '../../config/index.js';
import { PgError, pgErrorCode } from '../../database/pg-errors.js';
import { RedisService } from '../../redis/redis.service.js';
import { cacheKeys } from '../../redis/redisKey.js';
import { FxService } from '../fx/fx.service.js';
import type { CreateWalletDto } from './dto/create-wallet.dto.js';
import type { WalletDto } from './dto/wallet.dto.js';
import { BalanceRepository } from './repository/balance.repository.js';
import { WalletRepository } from './repository/wallet.repository.js';


interface WalletSnapshot {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  balances: Record<Currency, string>;
}

const zeroBalances = () => Object.fromEntries(CURRENCIES.map((c) => [c, '0'])) as Record<Currency, string>;

@Injectable()
export class WalletService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly walletRepository: WalletRepository,
    private readonly balanceRepository: BalanceRepository,
    private readonly fxService: FxService,
    private readonly redisService: RedisService,
  ) {}

  async create(dto: CreateWalletDto): Promise<WalletDto> {
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone ?? null;
    if (!email && !phone) throw errors.identifierRequired();

    try {
      const wallet = await this.dataSource.transaction(async (manager) => {
        const wallets = this.walletRepository.withManager(manager);
        const saved = await wallets.save(wallets.create({ id: randomUUID(), email, phone }));
        await this.balanceRepository.withManager(manager).createZeroBalances(saved.id);
        return saved;
      });
      return this.toDto({
        id: wallet.id,
        email,
        phone,
        createdAt: wallet.createdAt.toISOString(),
        balances: zeroBalances(),
      });
    } catch (err) {
      if (pgErrorCode(err) === PgError.UNIQUE_VIOLATION) throw errors.walletExists();
      throw err;
    }
  }

  async get(walletId: string): Promise<WalletDto> {
    const snapshot = await this.redisService.getOrSetForWallet(
      walletId,
      (version) => cacheKeys.wallet(walletId, version),
      AppConfig.cache.walletTTL,
      () => this.load(walletId),
    );
    return this.toDto(snapshot);
  }

  async assertExists(
    manager: EntityManager,
    walletId: string,
    onMissing: () => DomainError = () => errors.walletNotFound(walletId),
  ): Promise<void> {
    if (!(await this.walletRepository.withManager(manager).existsBy({ id: walletId }))) throw onMissing();
  }

  private async load(walletId: string): Promise<WalletSnapshot> {
    const wallet = await this.walletRepository.findOneBy({ id: walletId });
    if (!wallet) throw errors.walletNotFound(walletId);
    const balances = zeroBalances();
    for (const row of await this.balanceRepository.findBy({ walletId })) {
      balances[row.currency] = row.amount.toString();
    }
    return { id: wallet.id, email: wallet.email, phone: wallet.phone, createdAt: wallet.createdAt.toISOString(), balances };
  }

  private toDto(snapshot: WalletSnapshot): WalletDto {
    const minor = Object.fromEntries(CURRENCIES.map((c) => [c, BigInt(snapshot.balances[c])])) as Record<Currency, bigint>;
    const total = this.fxService.totalInUsd(minor);
    return {
      id: snapshot.id,
      email: snapshot.email,
      phone: snapshot.phone,
      balances: CURRENCIES.map((currency) => ({ currency, amount: formatAmount(minor[currency]) })),
      totalUsd: {
        currency: USD,
        amount: formatAmount(total.amount),
        rateSource: total.source,
        ratesAsOf: total.asOf.toISOString(),
      },
      createdAt: snapshot.createdAt,
    };
  }
}
