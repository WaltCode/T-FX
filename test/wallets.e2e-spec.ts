import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, createWallet, deposit, newEmail, type TestApp } from './support/test-app.js';

const newPhone = () => `+2348${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`;

describe('Wallets', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('creates a wallet by email with a zero balance in every stablecoin', async () => {
    const email = newEmail();
    const res = await request(t.http).post('/wallets').send({ email: email.toUpperCase() }).expect(201);
    expect(res.body).toMatchObject({ email, phone: null, totalUsd: { currency: 'USDx', amount: '0.000000' } });
    expect(res.body.balances).toEqual(
      ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'].map((currency) => ({ currency, amount: '0.000000' })),
    );
  });

  it('creates a wallet by phone number', async () => {
    const phone = newPhone();
    const res = await request(t.http).post('/wallets').send({ phone }).expect(201);
    expect(res.body).toMatchObject({ email: null, phone });
  });

  it('rejects a second wallet for the same email, ignoring case', async () => {
    const email = newEmail();
    await request(t.http).post('/wallets').send({ email }).expect(201);
    const res = await request(t.http).post('/wallets').send({ email: email.toUpperCase() }).expect(409);
    expect(res.body.error.code).toBe('WALLET_ALREADY_EXISTS');
  });

  it('rejects a second wallet for the same phone number', async () => {
    const phone = newPhone();
    await request(t.http).post('/wallets').send({ phone }).expect(201);
    await request(t.http).post('/wallets').send({ phone }).expect(409);
  });

  it('requires an email or a phone number', async () => {
    const res = await request(t.http).post('/wallets').send({}).expect(400);
    expect(res.body.error.code).toBe('IDENTIFIER_REQUIRED');
  });

  it('validates input and rejects unknown fields', async () => {
    const bad = await request(t.http).post('/wallets').send({ phone: '08012345678' }).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await request(t.http).post('/wallets').send({ email: newEmail(), admin: true }).expect(400);
  });

  it('returns 404 for an unknown wallet and 400 for a malformed id', async () => {
    const missing = await request(t.http).get(`/wallets/${randomUUID()}`).expect(404);
    expect(missing.body.error.code).toBe('WALLET_NOT_FOUND');
    await request(t.http).get('/wallets/not-a-uuid').expect(400);
  });

  it('totals every balance in USD at current rates', async () => {
    const id = await createWallet(t.http);
    await deposit(t.http, id, 'cNGN', '1500');
    await deposit(t.http, id, 'cGHS', '15');
    await deposit(t.http, id, 'cXAF', '600');
    await deposit(t.http, id, 'EURx', '0.9');
    await deposit(t.http, id, 'USDx', '10');
    const wallet = await request(t.http).get(`/wallets/${id}`).expect(200);
    expect(wallet.body.totalUsd).toMatchObject({ currency: 'USDx', amount: '14.000000', rateSource: 'LIVE' });
  });
});
