import type { UsdRates } from '../../common/types.js';
import { AppConfig } from '../../config/index.js';
import type { RedisService } from '../../redis/redis.service.js';
import { FxService } from './fx.service.js';
import type { FxRateRepository } from './repository/rate.repository.js';

const LIVE_RATES: UsdRates = { USDx: '1', EURx: '0.9', cNGN: '1500', cGHS: '15', cXAF: '600' };

function setup() {
  const provider = { name: 'fake', fetchUsdRates: vi.fn<() => Promise<UsdRates>>().mockResolvedValue(LIVE_RATES) };
  const repository = { find: vi.fn().mockResolvedValue([]), saveSnapshot: vi.fn().mockResolvedValue(undefined) };
  const redis = {
    acquireLock: vi.fn().mockResolvedValue(true),
    getValue: vi.fn().mockResolvedValue(null),
    setValue: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
  };
  const service = new FxService(
    provider,
    repository as unknown as FxRateRepository,
    redis as unknown as RedisService,
  );
  return { service, provider, repository, redis };
}

describe('FxService', () => {
  const original = { ...AppConfig.fx };

  beforeEach(() => {
    AppConfig.fx.refreshMs = 60_000;
    AppConfig.fx.maxStalenessMs = 3_600_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  });
  afterEach(() => {
    Object.assign(AppConfig.fx, original);
    vi.useRealTimers();
  });

  it('serves the static table before any live rate exists', () => {
    const { service } = setup();
    expect(service.current().source).toBe('FALLBACK');
    expect(service.quote('USDx', 'cNGN').rate).toBe('1550');
  });

  it('uses fresh live rates, then persists and broadcasts them', async () => {
    const { service, repository, redis } = setup();
    await expect(service.refresh()).resolves.toBe(true);
    const quote = service.quote('cNGN', 'USDx');
    expect(quote).toMatchObject({ source: 'LIVE', rate: '0.000666666666666666' });
    expect(quote.convert(1_500_000_000n)).toBe(1_000_000n);
    expect(repository.saveSnapshot).toHaveBeenCalledOnce();
    expect(redis.publish).toHaveBeenCalledOnce();
  });

  it('retries the provider once before giving up', async () => {
    const { service, provider } = setup();
    provider.fetchUsdRates.mockRejectedValueOnce(new Error('timeout'));
    await expect(service.refresh()).resolves.toBe(true);
    expect(provider.fetchUsdRates).toHaveBeenCalledTimes(2);
  });

  it('serves last good rates as CACHED during an outage, then falls back once they are too old', async () => {
    const { service, provider } = setup();
    await service.refresh();
    provider.fetchUsdRates.mockRejectedValue(new Error('provider down'));

    vi.setSystemTime(new Date('2026-10-29T12:05:00Z'));
    await expect(service.refresh()).resolves.toBe(false);
    expect(service.current().source).toBe('CACHED');
    expect(service.quote('USDx', 'cNGN').rate).toBe('1500');

    vi.setSystemTime(new Date('2026-10-29T13:01:00Z'));
    expect(service.current().source).toBe('FALLBACK');
    expect(service.quote('USDx', 'cNGN').rate).toBe('1550');
  });

  it('returns to LIVE when the provider recovers', async () => {
    const { service, provider } = setup();
    provider.fetchUsdRates.mockRejectedValue(new Error('provider down'));
    await service.refresh();
    expect(service.current().source).toBe('FALLBACK');
    provider.fetchUsdRates.mockResolvedValue(LIVE_RATES);
    await service.refresh();
    expect(service.current().source).toBe('LIVE');
  });

  it('follows the leader when another instance holds the refresh lock', async () => {
    const { service, provider, redis } = setup();
    redis.acquireLock.mockResolvedValue(false);
    redis.getValue.mockResolvedValue(JSON.stringify({ perUsd: LIVE_RATES, fetchedAt: '2026-10-29T11:59:00.000Z' }));
    await service.tick();
    expect(provider.fetchUsdRates).not.toHaveBeenCalled();
    expect(service.current()).toMatchObject({ source: 'LIVE', snapshot: { perUsd: LIVE_RATES } });
  });

  it('refreshes locally when Redis is down', async () => {
    const { service, provider, redis } = setup();
    redis.acquireLock.mockResolvedValue(undefined);
    await service.tick();
    expect(provider.fetchUsdRates).toHaveBeenCalledOnce();
    expect(service.current().source).toBe('LIVE');
  });

  it('lists all 20 currency pairs', async () => {
    const { service } = setup();
    await service.refresh();
    const rates = service.allRates();
    expect(rates.rates).toHaveLength(20);
    expect(rates).toMatchObject({ source: 'LIVE', stale: false, usdRates: LIVE_RATES });
  });
});
