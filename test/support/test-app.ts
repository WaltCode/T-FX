import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createClient } from 'redis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { FX_PROVIDER, type FxProvider, type UsdRates } from '../../src/common/types.js';


export const TEST_RATES: UsdRates = { USDx: '1', EURx: '0.9', cNGN: '1500', cGHS: '15', cXAF: '600' };

export class FakeFxProvider implements FxProvider {
  readonly name = 'fake';
  failing = false;
  rates: UsdRates = { ...TEST_RATES };

  fetchUsdRates(): Promise<UsdRates> {
    return this.failing ? Promise.reject(new Error('provider unavailable')) : Promise.resolve({ ...this.rates });
  }
}

export interface TestApp {
  app: NestExpressApplication;
  http: App;
  fx: FakeFxProvider;
  dataSource: DataSource;
}

export interface TestAppOptions {
  fxFailing?: boolean;
  flushRedis?: boolean;
}

export async function flushRedis(): Promise<void> {
  const client = createClient({ url: inject('redisUrl') });
  await client.connect();
  await client.flushAll();
  await client.quit();
}

export async function createTestApp({ fxFailing = false, flushRedis: flush = true }: TestAppOptions = {}): Promise<TestApp> {
  if (flush) await flushRedis();
  const fx = new FakeFxProvider();
  fx.failing = fxFailing;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FX_PROVIDER)
    .useValue(fx)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  // A listening server lets supertest fire parallel requests without each one calling listen().
  await app.listen(0);
  return { app, http: app.getHttpServer() as App, fx, dataSource: app.get(DataSource) };
}

export const newEmail = () => `user-${randomUUID()}@example.com`;

export async function createWallet(http: App): Promise<string> {
  const res = await request(http).post('/wallets').send({ email: newEmail() }).expect(201);
  return res.body.id as string;
}

export function postMoney(http: App, path: string, body: object, key: string = randomUUID()) {
  return request(http).post(path).set('Idempotency-Key', key).send(body);
}

export async function deposit(http: App, walletId: string, currency: string, amount: string): Promise<void> {
  await postMoney(http, `/wallets/${walletId}/deposits`, { currency, amount }).expect(201);
}

export async function balanceOf(http: App, walletId: string, currency: string): Promise<string> {
  const res = await request(http).get(`/wallets/${walletId}`).expect(200);
  return (res.body.balances as { currency: string; amount: string }[]).find((b) => b.currency === currency)!.amount;
}

/** Formatted amounts always have 6 dp, so dropping the dot gives exact micro-units. */
export const toMicro = (amount: string) => BigInt(amount.replace('.', ''));

export async function expectLedgerInvariants(dataSource: DataSource): Promise<void> {
  const unbalanced = await dataSource.query(
    `SELECT currency, SUM(amount)::text AS total FROM ledger_entries GROUP BY currency HAVING SUM(amount) <> 0`,
  );
  expect(unbalanced).toEqual([]);
  const drifted = await dataSource.query(`
    SELECT b.wallet_id, b.currency
    FROM balances b
    LEFT JOIN (SELECT wallet_id, currency, SUM(amount) AS total FROM ledger_entries GROUP BY wallet_id, currency) e
      ON e.wallet_id = b.wallet_id AND e.currency = b.currency
    WHERE b.amount <> COALESCE(e.total, 0)`);
  expect(drifted).toEqual([]);
}
