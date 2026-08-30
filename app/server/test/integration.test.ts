import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../src/routes';
import { makeContext, type TestContext } from './helpers-integration';

// An integration test that boots a real Fastify instance with mock providers
// and exercises the HTTP surface end-to-end. Requires auth like production.

describe('API integration (mock providers)', () => {
  let ctx: TestContext;
  let app: Awaited<ReturnType<typeof Fastify>>;
  let auth: Record<string, string>;

  beforeAll(async () => {
    ctx = makeContext();
    app = Fastify();
    registerRoutes(app, ctx);

    // Register a user so we can authenticate for the protected endpoints.
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'test@example.com', password: 'supersecret1', displayName: 'Test' },
    });
    expect(reg.statusCode).toBe(200);
    auth = { authorization: `Bearer ${reg.json().token}` };

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('gate keeps /api/wallet behind auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wallet' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/health is public and returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('GET /api/auth/me returns the authenticated user', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('test@example.com');
  });

  it('rejects a login with the wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid email or password/);
  });

  it('logs in and out with valid credentials', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'supersecret1' },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().token;
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${token}` } });
    expect(out.statusCode).toBe(200);
    const after = await app.inject({ method: 'GET', url: '/api/wallet', headers: { authorization: `Bearer ${token}` } });
    expect(after.statusCode).toBe(401);
  });

  it('GET /api/wallet returns balances, transactions and quote', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wallet', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balances.fiatMxn).toBeGreaterThan(0);
    expect(body.balances.btc).toBeGreaterThan(0);
    expect(body.quote.btcPriceMxn).toBeGreaterThan(0);
  });

  it('POST /api/wallet/add then GET /api/wallet reflects the increase', async () => {
    await app.inject({ method: 'POST', url: '/api/wallet/add', payload: { amountMxn: 2000 }, headers: auth });
    const res = await app.inject({ method: 'GET', url: '/api/wallet', headers: auth });
    expect(res.json().balances.fiatMxn).toBeCloseTo(25000 + 2000, 6);
  });

  it('POST /api/wallet/buy converts fiat to btc', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/wallet/buy', payload: { amountMxn: 500 }, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().btc).toBeGreaterThan(0);
  });

  it('POST /api/wallet/buy rejects insufficient fiat with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/wallet/buy', payload: { amountMxn: 999_999_999 }, headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Insufficient/);
  });

  it('GET /api/ledger returns combined activity', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ledger', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });

  it('GET /api/taxes returns a summary object', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/taxes', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.buys.count).toBe('number');
    expect(Array.isArray(body.trades)).toBe(true);
  });

  it('GET /api/security returns a report', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/security', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().checks)).toBe(true);
  });

  it('GET /api/dca and POST /api/dca manage schedules', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dca', payload: { amountFiat: 300, frequency: 'weekly' }, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().schedules[0].frequency).toBe('weekly');
  });

  it('POST /api/dca rejects an invalid frequency', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dca', payload: { amountFiat: 300, frequency: 'yearly' }, headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/frequency/);
  });

  it('POST /api/onchain/simulate-deposit and GET /api/wallet/onchain reveal the balance', async () => {
    await app.inject({ method: 'POST', url: '/api/onchain/simulate-deposit', payload: { amountSats: 100_000 }, headers: auth });
    const res = await app.inject({ method: 'GET', url: '/api/wallet/onchain', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceSats).toBeGreaterThanOrEqual(100_000);
  });

  it('POST /api/lightning/invoices then status transitions false->true (mock auto-pays at 8s)', async () => {
    const inv = await app.inject({ method: 'POST', url: '/api/lightning/invoices', payload: { amountSats: 500, memo: 'test' }, headers: auth });
    expect(inv.statusCode).toBe(200);
    const paymentHash = inv.json().invoice.paymentHash;
    const before = await app.inject({ method: 'GET', url: `/api/lightning/invoices/${paymentHash}`, headers: auth });
    expect(before.json().isPaid).toBe(false);
    let paid = false;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2100));
      const st = await app.inject({ method: 'GET', url: `/api/lightning/invoices/${paymentHash}`, headers: auth });
      if (st.json().isPaid) { paid = true; break; }
    }
    expect(paid).toBe(true);
  }, 20000);
});
