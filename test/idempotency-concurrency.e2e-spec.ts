import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  balanceOf,
  createTestApp,
  createWallet,
  deposit,
  expectLedgerInvariants,
  postMoney,
  type TestApp,
} from './support/test-app.js';

describe('Idempotency and concurrency', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('idempotency', () => {
    it('requires a well-formed Idempotency-Key', async () => {
      const id = await createWallet(t.http);
      const missing = await request(t.http).post(`/wallets/${id}/deposits`).send({ currency: 'USDx', amount: '1' }).expect(400);
      expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const invalid = await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }, 'short').expect(400);
      expect(invalid.body.error.code).toBe('IDEMPOTENCY_KEY_INVALID');
    });

    it('replays the original response for a retry without moving money twice', async () => {
      const id = await createWallet(t.http);
      const key = randomUUID();
      const body = { currency: 'USDx', amount: '100' };
      const first = await postMoney(t.http, `/wallets/${id}/deposits`, body, key).expect(201);
      const retry = await postMoney(t.http, `/wallets/${id}/deposits`, body, key).expect(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body).toEqual(first.body);
      expect(await balanceOf(t.http, id, 'USDx')).toBe('100.000000');
    });

    it('rejects reusing a key with a different request', async () => {
      const id = await createWallet(t.http);
      const key = randomUUID();
      await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '1' }, key).expect(201);
      const res = await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'USDx', amount: '2' }, key).expect(422);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('scopes keys per wallet', async () => {
      const [a, b] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
      const key = randomUUID();
      const body = { currency: 'USDx', amount: '1' };
      await postMoney(t.http, `/wallets/${a}/deposits`, body, key).expect(201);
      const res = await postMoney(t.http, `/wallets/${b}/deposits`, body, key).expect(201);
      expect(res.headers['idempotent-replayed']).toBeUndefined();
    });

    it('processes concurrent duplicates exactly once', async () => {
      const id = await createWallet(t.http);
      await deposit(t.http, id, 'USDx', '10');
      const key = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          postMoney(t.http, `/wallets/${id}/swaps`, { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }, key),
        ),
      );
      expect(responses.map((r) => r.status)).toEqual(Array(10).fill(201));
      expect(new Set(responses.map((r) => r.body.id as string)).size).toBe(1);
      expect(responses.filter((r) => r.headers['idempotent-replayed'] === undefined)).toHaveLength(1);
      const [{ n }] = await t.dataSource.query(
        'SELECT count(*)::int AS n FROM transactions WHERE wallet_id = $1 AND idempotency_key = $2',
        [id, key],
      );
      expect(n).toBe(1);
      expect(await balanceOf(t.http, id, 'USDx')).toBe('9.000000');
    });
  });

  describe('concurrency', () => {
    it('never overdraws under 50 parallel swaps', async () => {
      const id = await createWallet(t.http);
      await deposit(t.http, id, 'USDx', '20');
      const responses = await Promise.all(
        Array.from({ length: 50 }, () =>
          postMoney(t.http, `/wallets/${id}/swaps`, { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' }),
        ),
      );
      expect(responses.filter((r) => r.status === 201)).toHaveLength(20);
      expect(responses.filter((r) => r.status === 422)).toHaveLength(30);
      expect(await balanceOf(t.http, id, 'USDx')).toBe('0.000000');
      expect(await balanceOf(t.http, id, 'cNGN')).toBe('30000.000000');
    });

    it('does not deadlock when two wallets pay each other at the same time', async () => {
      const [a, b] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
      await deposit(t.http, a, 'USDx', '100');
      await deposit(t.http, b, 'USDx', '100');
      const transfer = (from: string, to: string) =>
        postMoney(t.http, `/wallets/${from}/transfers`, { toWalletId: to, sourceCurrency: 'USDx', amount: '1' });
      const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? transfer(a, b) : transfer(b, a))));
      expect(responses.every((r) => r.status === 201)).toBe(true);
      expect(await balanceOf(t.http, a, 'USDx')).toBe('100.000000');
      expect(await balanceOf(t.http, b, 'USDx')).toBe('100.000000');
    });

    it('keeps the ledger balanced and in sync with balances', async () => {
      await expectLedgerInvariants(t.dataSource);
    });
  });
});
