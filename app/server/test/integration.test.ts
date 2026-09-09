import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from '../src/routes';
import { makeContext, type TestContext } from './helpers-integration';

// An integration test that boots a real Fastify instance with mock providers
// and exercises the HTTP surface end-to-end, authenticated via HttpOnly cookies.

async function cookieFrom(res: Awaited<ReturnType<Fastify['inject']>>): Promise<string> {
  const setCookie = res.headers['set-cookie'];
  const parts = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
  const match = parts.match(/ttm_session=([^;]+)/);
  if (!match) throw new Error('expected a ttm_session cookie, got: ' + parts);
  return `ttm_session=${match[1]}`;
}

describe('API integration (mock providers)', () => {
  let ctx: TestContext;
  let app: Awaited<ReturnType<typeof Fastify>>;
  let auth: Record<string, string>;

  beforeAll(async () => {
    ctx = makeContext();
    app = Fastify();
    await registerRoutes(app, ctx);

    // Register a user and capture the session cookie for protected endpoints.
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'test@example.com', password: 'Supersecret1!', displayName: 'Test' },
    });
    expect(reg.statusCode).toBe(200);
    auth = { cookie: await cookieFrom(reg) };

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

  it('register sets an HttpOnly SameSite cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'r2@example.com', password: 'Supersecret1!' },
    });
    expect(res.statusCode).toBe(200);
    const h = String(res.headers['set-cookie'] ?? '');
    expect(h).toMatch(/ttm_session=/);
    expect(h).toMatch(/HttpOnly/i);
    expect(h).toMatch(/SameSite=Strict/i);
  });

  it('GET /api/auth/me returns the authenticated user via cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('test@example.com');
  });

  it('rejects a login with the wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'Wrongpass1!' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid email or password/);
  });

  it('logs in with credentials and out cancels the cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'Supersecret1!' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = await cookieFrom(login);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('password reset flow works end-to-end over HTTP', async () => {
    const fresh = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'reset@example.com', password: 'Supersecret1!', displayName: 'Reset' },
    });
    expect(fresh.statusCode).toBe(200);
    await cookieFrom(fresh);

    const forgot = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      payload: { email: 'reset@example.com' },
    });
    expect(forgot.statusCode).toBe(200);
    const resetToken = forgot.json().resetToken;
    expect(typeof resetToken).toBe('string');

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      payload: { token: resetToken, password: 'BrandNewP@ss1' },
    });
    expect(reset.statusCode).toBe(200);

    // Old password rejected, new one accepted.
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'reset@example.com', password: 'Supersecret1!' },
    });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'reset@example.com', password: 'BrandNewP@ss1' },
    });
    expect(good.statusCode).toBe(200);
  });

  it('does not leak whether a forgot email is registered', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'test@example.com' } });
    const b = await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'ghost@example.com' } });
    // Both respond 200; only the real one returns a token in dev mode.
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(typeof a.json().resetToken).toBe('string');
    expect(b.json().resetToken).toBeUndefined();
  });

  it('blocks cookie-authenticated cross-site mutations via a foreign Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/add',
      headers: { ...auth, origin: 'https://evil.example.com' },
      payload: { amountMxn: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/Cross-site/);
  });

  it('allows same-site cookie mutations', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wallet/add',
      headers: { ...auth, 'sec-fetch-site': 'same-origin' },
      payload: { amountMxn: 5 },
    });
    expect(res.statusCode).toBe(200);
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
    expect(res.json().balances.fiatMxn).toBeCloseTo(25000 + 5 + 2000, 6);
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