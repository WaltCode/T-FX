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
  toMicro,
} from './support/test-app.js';

describe('Money movement', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await expectLedgerInvariants(t.dataSource);
    await t.app.close();
  });

  describe('deposits', () => {
    it('credits the wallet immediately and records the transaction', async () => {
      const id = await createWallet(t.http);
      const res = await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'cNGN', amount: '50000.5' }).expect(201);
      expect(res.body).toMatchObject({
        type: 'DEPOSIT',
        status: 'COMPLETED',
        walletId: id,
        direction: 'IN',
        source: { currency: 'cNGN', amount: '50000.500000' },
        destination: { currency: 'cNGN', amount: '50000.500000' },
        rate: null,
      });
      expect(res.body.entries).toHaveLength(2);
      expect(await balanceOf(t.http, id, 'cNGN')).toBe('50000.500000');
    });

    it.each([['0'], ['-5'], ['1.1234567'], ['abc'], [100]])('rejects amount %j', async (amount) => {
      const id = await createWallet(t.http);
      await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'cNGN', amount }).expect(400);
    });

    it('rejects unsupported currencies and unknown wallets', async () => {
      const id = await createWallet(t.http);
      await postMoney(t.http, `/wallets/${id}/deposits`, { currency: 'BTC', amount: '1' }).expect(400);
      const res = await postMoney(t.http, `/wallets/${randomUUID()}/deposits`, { currency: 'USDx', amount: '1' }).expect(404);
      expect(res.body.error.code).toBe('WALLET_NOT_FOUND');
    });
  });

  describe('swaps', () => {
    it('converts at the current rate and rounds down to 6 dp', async () => {
      const id = await createWallet(t.http);
      await deposit(t.http, id, 'cNGN', '10000');
      const res = await postMoney(t.http, `/wallets/${id}/swaps`, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '1000',
      }).expect(201);
      expect(res.body).toMatchObject({
        type: 'SWAP',
        direction: 'INTERNAL',
        source: { currency: 'cNGN', amount: '1000.000000' },
        destination: { currency: 'USDx', amount: '0.666666' },
        rate: '0.000666666666666666',
        rateSource: 'LIVE',
      });
      expect(await balanceOf(t.http, id, 'cNGN')).toBe('9000.000000');
      expect(await balanceOf(t.http, id, 'USDx')).toBe('0.666666');
    });

    it('rejects a swap larger than the balance and leaves balances unchanged', async () => {
      const id = await createWallet(t.http);
      await deposit(t.http, id, 'USDx', '5');
      const res = await postMoney(t.http, `/wallets/${id}/swaps`, {
        fromCurrency: 'USDx',
        toCurrency: 'cNGN',
        amount: '5.000001',
      }).expect(422);
      expect(res.body.error).toMatchObject({
        code: 'INSUFFICIENT_FUNDS',
        details: { currency: 'USDx', available: '5.000000', required: '5.000001' },
      });
      expect(await balanceOf(t.http, id, 'USDx')).toBe('5.000000');
      expect(await balanceOf(t.http, id, 'cNGN')).toBe('0.000000');
    });

    it('rejects swapping a currency into itself', async () => {
      const id = await createWallet(t.http);
      const res = await postMoney(t.http, `/wallets/${id}/swaps`, { fromCurrency: 'USDx', toCurrency: 'USDx', amount: '1' }).expect(422);
      expect(res.body.error.code).toBe('SAME_CURRENCY_SWAP');
    });

    it('rejects amounts that convert to zero', async () => {
      const id = await createWallet(t.http);
      await deposit(t.http, id, 'cNGN', '1');
      const res = await postMoney(t.http, `/wallets/${id}/swaps`, {
        fromCurrency: 'cNGN',
        toCurrency: 'USDx',
        amount: '0.000001',
      }).expect(422);
      expect(res.body.error.code).toBe('AMOUNT_TOO_SMALL');
    });
  });

  describe('transfers', () => {
    it('moves funds in the same currency', async () => {
      const [a, b] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
      await deposit(t.http, a, 'USDx', '100');
      const res = await postMoney(t.http, `/wallets/${a}/transfers`, { toWalletId: b, sourceCurrency: 'USDx', amount: '40' }).expect(201);
      expect(res.body).toMatchObject({
        type: 'TRANSFER',
        walletId: a,
        counterpartyWalletId: b,
        direction: 'OUT',
        source: { currency: 'USDx', amount: '40.000000' },
        destination: { currency: 'USDx', amount: '40.000000' },
        rate: '1',
      });
      expect(await balanceOf(t.http, a, 'USDx')).toBe('60.000000');
      expect(await balanceOf(t.http, b, 'USDx')).toBe('40.000000');
    });

    it('converts automatically when currencies differ and records the full audit trail', async () => {
      const [a, b] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
      await deposit(t.http, a, 'USDx', '100');
      const res = await postMoney(t.http, `/wallets/${a}/transfers`, {
        toWalletId: b,
        sourceCurrency: 'USDx',
        destinationCurrency: 'cGHS',
        amount: '10',
      }).expect(201);
      expect(res.body).toMatchObject({
        walletId: a,
        counterpartyWalletId: b,
        source: { currency: 'USDx', amount: '10.000000' },
        destination: { currency: 'cGHS', amount: '150.000000' },
        rate: '15',
        rateSource: 'LIVE',
      });
      expect(res.body.rateAsOf).toEqual(expect.any(String));
      expect(res.body.createdAt).toEqual(expect.any(String));
      expect(await balanceOf(t.http, a, 'USDx')).toBe('90.000000');
      expect(await balanceOf(t.http, b, 'cGHS')).toBe('150.000000');
    });

    it('rejects transfers to self and to unknown wallets', async () => {
      const a = await createWallet(t.http);
      await deposit(t.http, a, 'USDx', '10');
      const self = await postMoney(t.http, `/wallets/${a}/transfers`, { toWalletId: a, sourceCurrency: 'USDx', amount: '1' }).expect(422);
      expect(self.body.error.code).toBe('SELF_TRANSFER');
      const unknown = await postMoney(t.http, `/wallets/${a}/transfers`, {
        toWalletId: randomUUID(),
        sourceCurrency: 'USDx',
        amount: '1',
      }).expect(404);
      expect(unknown.body.error.code).toBe('RECIPIENT_NOT_FOUND');
      expect(await balanceOf(t.http, a, 'USDx')).toBe('10.000000');
    });
  });

  describe('history', () => {
    let wallet: string;
    let other: string;

    beforeAll(async () => {
      [wallet, other] = await Promise.all([createWallet(t.http), createWallet(t.http)]);
      await deposit(t.http, wallet, 'cNGN', '30000');
      await postMoney(t.http, `/wallets/${wallet}/swaps`, { fromCurrency: 'cNGN', toCurrency: 'USDx', amount: '15000' }).expect(201);
      await postMoney(t.http, `/wallets/${wallet}/transfers`, { toWalletId: other, sourceCurrency: 'USDx', amount: '4' }).expect(201);
      await deposit(t.http, other, 'cGHS', '30');
      await postMoney(t.http, `/wallets/${other}/transfers`, {
        toWalletId: wallet,
        sourceCurrency: 'cGHS',
        destinationCurrency: 'cNGN',
        amount: '15',
      }).expect(201);
    });

    const list = (query = '') => request(t.http).get(`/wallets/${wallet}/transactions${query}`).expect(200);
    const kinds = (body: { data: { type: string; direction: string }[] }) => body.data.map((x) => `${x.type}:${x.direction}`);

    it('lists everything newest first, including transfers received', async () => {
      const res = await list();
      expect(kinds(res.body)).toEqual(['TRANSFER:IN', 'TRANSFER:OUT', 'SWAP:INTERNAL', 'DEPOSIT:IN']);
      expect(res.body.data[0].destination).toEqual({ currency: 'cNGN', amount: '1500.000000' });
      expect(res.body.nextCursor).toBeNull();
    });

    it('filters by type', async () => {
      expect(kinds((await list('?type=TRANSFER')).body)).toEqual(['TRANSFER:IN', 'TRANSFER:OUT']);
    });

    it("filters by currency from the wallet's point of view", async () => {
      expect(kinds((await list('?currency=cNGN')).body)).toEqual(['TRANSFER:IN', 'SWAP:INTERNAL', 'DEPOSIT:IN']);
      expect(kinds((await list('?currency=USDx')).body)).toEqual(['TRANSFER:OUT', 'SWAP:INTERNAL']);
      expect(kinds((await list('?currency=cGHS')).body)).toEqual([]);
    });

    it('paginates with a cursor', async () => {
      const first = await list('?limit=3');
      expect(first.body.data).toHaveLength(3);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await list(`?limit=3&cursor=${first.body.nextCursor as string}`);
      expect(kinds(second.body)).toEqual(['DEPOSIT:IN']);
      expect(second.body.nextCursor).toBeNull();
    });

    it('rejects invalid filters', async () => {
      await request(t.http).get(`/wallets/${wallet}/transactions?type=REFUND`).expect(400);
      await request(t.http).get(`/wallets/${wallet}/transactions?limit=0`).expect(400);
      await request(t.http).get(`/wallets/${wallet}/transactions?cursor=abc`).expect(400);
    });

    it('fetches a single transaction with ledger entries that net to zero per currency', async () => {
      const swap = (await list('?type=SWAP')).body.data[0];
      const res = await request(t.http).get(`/transactions/${swap.id as string}`).expect(200);
      expect(res.body.entries).toHaveLength(4);
      const totals = new Map<string, bigint>();
      for (const e of res.body.entries as { currency: string; amount: string }[]) {
        totals.set(e.currency, (totals.get(e.currency) ?? 0n) + toMicro(e.amount));
      }
      expect([...totals.values()]).toEqual([0n, 0n]);
      const missing = await request(t.http).get(`/transactions/${randomUUID()}`).expect(404);
      expect(missing.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });
  });

  describe('rates', () => {
    it('returns every pair with the time it was refreshed', async () => {
      const res = await request(t.http).get('/rates').expect(200);
      expect(res.body).toMatchObject({ base: 'USDx', source: 'LIVE', stale: false, usdRates: { cNGN: '1500' } });
      expect(res.body.rates).toHaveLength(20);
      const pair = (from: string, to: string) =>
        (res.body.rates as { from: string; to: string; rate: string; fetchedAt: string }[]).find((r) => r.from === from && r.to === to);
      expect(pair('USDx', 'cNGN')?.rate).toBe('1500');
      expect(pair('cNGN', 'USDx')?.rate).toBe('0.000666666666666666');
      expect(pair('cGHS', 'cXAF')).toMatchObject({ rate: '40', fetchedAt: expect.any(String) });
    });
  });
});
