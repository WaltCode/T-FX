import { createClient } from 'redis';
import request from 'supertest';
import { inject } from 'vitest';
import { AppConfig } from '../src/config/index.js';
import { FxService } from '../src/modules/fx/fx.service.js';
import {
  balanceOf,
  createTestApp,
  createWallet,
  deposit,
  flushRedis,
  newEmail,
  postMoney,
  TEST_RATES,
  type TestApp,
} from './support/test-app.js';

describe('Caching and invalidation', () => {
  let t: TestApp;
  const redis = createClient({ url: inject('redisUrl') });

  beforeAll(async () => {
    t = await createTestApp();
    await redis.connect();
  });
  afterAll(async () => {
    await redis.quit();
    await t.app.close();
  });

  it('caches wallet reads and invalidates them when money moves', async () => {
    const id = await createWallet(t.http);
    await request(t.http).get(`/wallets/${id}`).expect(200);
    expect(await redis.exists(`wallet:${id}:v0:view`)).toBe(1);
    await deposit(t.http, id, 'USDx', '25');
    expect(await redis.get(`wallet:${id}:ver`)).toBe('1');
    expect(await balanceOf(t.http, id, 'USDx')).toBe('25.000000');
    expect(await redis.exists(`wallet:${id}:v1:view`)).toBe(1);
  });

  it("invalidates the receiver's cache on a transfer", async () => {
    const [a, b] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
    await deposit(t.http, a, 'USDx', '10');
    expect(await balanceOf(t.http, b, 'USDx')).toBe('0.000000');
    await postMoney(t.http, `/wallets/${a}/transfers`, { toWalletId: b, sourceCurrency: 'USDx', amount: '4' }).expect(201);
    expect(await balanceOf(t.http, b, 'USDx')).toBe('4.000000');
  });

  it('invalidates cached history pages', async () => {
    const id = await createWallet(t.http);
    const before = await request(t.http).get(`/wallets/${id}/transactions`).expect(200);
    expect(before.body.data).toHaveLength(0);
    await deposit(t.http, id, 'cGHS', '5');
    const after = await request(t.http).get(`/wallets/${id}/transactions`).expect(200);
    expect(after.body.data).toHaveLength(1);
  });

  it('does not invalidate on an idempotent replay', async () => {
    const id = await createWallet(t.http);
    const key = 'replay-key-0001';
    await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }, key).expect(201);
    await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }, key).expect(201);
    expect(await redis.get(`wallet:${id}:ver`)).toBe('1');
  });

  it('caches immutable transactions by id', async () => {
    const id = await createWallet(t.http);
    const res = await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }).expect(201);
    await request(t.http).get(`/transactions/${res.body.id as string}`).expect(200);
    expect(await redis.exists(`txn:${res.body.id as string}`)).toBe(1);
  });
});

describe('Rate limiting', () => {
  let t: TestApp;
  const original = { ...AppConfig.rateLimit };

  beforeAll(async () => {
    AppConfig.rateLimit.walletCreation = 3;
    AppConfig.rateLimit.money = 2;
    t = await createTestApp();
  });
  afterAll(async () => {
    Object.assign(AppConfig.rateLimit, original);
    await t.app.close();
  });

  it('limits wallet creation per client', async () => {
    for (let i = 0; i < 3; i++) await request(t.http).post('/wallets').send({ email: newEmail() }).expect(201);
    const res = await request(t.http).post('/wallets').send({ email: newEmail() }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('limits money movement per wallet', async () => {
    await flushRedis();
    const id = await createWallet(t.http);
    await deposit(t.http, id, 'USDx', '1');
    await deposit(t.http, id, 'USDx', '1');
    await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }).expect(429);
  });
});

describe('FX across instances', () => {
  let a: TestApp;
  let b: TestApp;

  beforeAll(async () => {
    a = await createTestApp();
    b = await createTestApp({ flushRedis: false });
  });
  afterAll(async () => {
    await Promise.all([a.app.close(), b.app.close()]);
  });

  it('pushes a refresh on one instance to the others', async () => {
    a.fx.rates = { ...TEST_RATES, cNGN: '1600' };
    await a.app.get(FxService).refresh();
    await vi.waitFor(async () => {
      const res = await request(b.http).get('/rates').expect(200);
      expect(res.body.usdRates.cNGN).toBe('1600');
    });
  });
});

describe('FX provider outage', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Start with no persisted live rates and the provider down from boot.
    const seed = await createTestApp();
    await seed.dataSource.query('DELETE FROM fx_rates');
    await seed.app.close();
    t = await createTestApp({ fxFailing: true });
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('falls back to the static table so swaps keep working', async () => {
    const rates = await request(t.http).get('/rates').expect(200);
    expect(rates.body).toMatchObject({ source: 'FALLBACK', stale: true, usdRates: { cNGN: '1550' } });
    const id = await createWallet(t.http);
    await deposit(t.http, id, 'USDx', '1');
    const swap = await postMoney(t.http, `/wallets/${id}/swaps`, { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }).expect(201);
    expect(swap.body).toMatchObject({ destination: { currency: 'cNGN', amount: '1550.000000' }, rateSource: 'FALLBACK' });
  });

  it('switches back to live rates once the provider recovers', async () => {
    t.fx.failing = false;
    await expect(t.app.get(FxService).refresh()).resolves.toBe(true);
    const rates = await request(t.http).get('/rates').expect(200);
    expect(rates.body).toMatchObject({ source: 'LIVE', usdRates: { cNGN: '1500' } });
  });
});

describe('Redis outage', () => {
  let t: TestApp;
  const originalUrl = AppConfig.redis.url;

  beforeAll(async () => {
    AppConfig.redis.url = 'redis://127.0.0.1:1';
    t = await createTestApp({ flushRedis: false });
  });
  afterAll(async () => {
    await t.app.close();
    AppConfig.redis.url = originalUrl;
  });

  it('keeps moving money and serving reads from Postgres', async () => {
    const id = await createWallet(t.http);
    await deposit(t.http, id, 'USDx', '10');
    await postMoney(t.http, `/wallets/${id}/swaps`, { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }).expect(201);
    expect(await balanceOf(t.http, id, 'USDx')).toBe('9.000000');
    await request(t.http).get(`/wallets/${id}/transactions`).expect(200);
    const health = await request(t.http).get('/health').expect(200);
    expect(health.body).toMatchObject({ db: 'up', redis: 'down' });
  });
});
