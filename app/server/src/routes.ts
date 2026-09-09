import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from './context';
import { getBalances, getTransactions, addFiat, buyBtc, sellBtc, getDepositInstructions } from './services/wallet';
import { getLedger } from './services/ledger';
import { getTaxSummary } from './services/taxes';
import { getSecurityReport } from './services/security';
import { getDcaGrowth } from './services/dcaGrowth';
import { estimateRetirement } from './services/retirement';
import { listSchedules, createSchedule, deleteSchedule, isDcaFrequency } from './services/dca';
import { syncOnchain, simulateDeposit, sendOnchain } from './services/onchain';
import {
  SESSION_COOKIE,
  getUserFromRequest,
  registerUser,
  loginUser,
  logout,
  revokeAllSessions,
  issuePasswordReset,
  resetPasswordWithToken,
} from './auth';
import { config } from './config';
import { auditLog, idempotent, type AuditActor } from './audit';
import { getVapidKeys, saveSubscription, type PushSubscription, sendPush } from './push';

type AuthedRequest = FastifyRequest & { user?: { id: number; email: string } };

function cookieValue(req: FastifyRequest): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const match = raw.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : undefined;
}

function actorFor(req: FastifyRequest): AuditActor {
  const authed = req as AuthedRequest;
  return {
    user: authed.user ? { id: authed.user.id } : null,
    ip: req.ip,
    ua: req.headers['user-agent'],
  };
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function reqNum(req: FastifyRequest, key: string): number {
  const body = (req.body ?? req.query) as Record<string, unknown>;
  const n = num(body?.[key]);
  if (n === undefined) throw new Error(`${key} must be a number`);
  return n;
}

function asBody(req: FastifyRequest): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  await app.register(cookie);

  const fail = (reply: FastifyReply, err: Error, code = 400) =>
    reply.code(code).send({ error: err.message });
  const handle = (fn: () => Promise<unknown>) => async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn();
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  };

  const PUBLIC_PATHS = new Set([
    '/api/health',
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/forgot',
    '/api/auth/reset',
    '/api/push/vapid',
  ]);

  // SameSite=Strict already stops cross-site cookie sends; Origin/Sec-Fetch-Site
  // validation is defense-in-depth for cookie-authenticated mutations.
  function isSameOrigin(req: FastifyRequest): boolean {
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'same-origin' || fetchSite === 'none') return true;
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || origin === '') return true; // non-browser client
    return config.corsOrigins.includes(origin) || origin === `${req.protocol}://${req.hostname}`;
  }

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const publicRoute = PUBLIC_PATHS.has(req.url.split('?')[0]) || req.url.startsWith('/api/lightning/webhook');
    if (publicRoute) return;

    const user = getUserFromRequest(ctx.db, {
      authHeader: req.headers.authorization,
      cookieValue: cookieValue(req),
    });
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    // CSRF: every state-changing request that rides on the session cookie must
    // originate from our own site.
    if (cookieValue(req) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isSameOrigin(req)) {
      reply.code(403).send({ error: 'Cross-site request blocked' });
      return;
    }

    (req as FastifyRequest & { user?: typeof user }).user = user;
  });

  app.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));

  // Authentication
  function setSessionCookie(reply: FastifyReply, token: string) {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: config.authSessionTtlMs / 1000,
    });
  }

  function clearSessionCookie(reply: FastifyReply) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  const authSchemas = {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        password: { type: 'string', minLength: 1, maxLength: 1024 },
      },
    },
  };

  app.post('/api/auth/register', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 1, maxLength: 1024 },
          displayName: { type: 'string', maxLength: 80 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = asBody(req);
    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? '').trim();
    const result = registerUser(ctx.db, email, password, displayName);
    if (!result.ok) return fail(reply, new Error(result.error));
    setSessionCookie(reply, result.token);
    auditLog(ctx.db, actorFor(req), 'auth.register', { email: result.user.email });
    return { user: { email: result.user.email, displayName: result.user.display_name } };
  });

  app.post('/api/auth/login', { schema: authSchemas }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = asBody(req);
    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
    const result = loginUser(ctx.db, email, password, req.ip);
    if (!result.ok) {
      auditLog(ctx.db, actorFor(req), 'auth.login.failed', { email: email.toLowerCase(), statusCode: result.statusCode });
      return fail(reply, new Error(result.error), result.statusCode === 429 ? 429 : 400);
    }
    setSessionCookie(reply, result.token);
    auditLog(ctx.db, actorFor(req), 'auth.login', { email: result.user.email });
    return { user: { email: result.user.email, displayName: result.user.display_name } };
  });

  app.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const authed = req as AuthedRequest;
    logout(ctx.db, req.headers.authorization, cookieValue(req));
    clearSessionCookie(reply);
    auditLog(ctx.db, actorFor(req), 'auth.logout', authed.user ? { email: authed.user.email } : {});
    return { ok: true };
  });

  app.post('/api/auth/logout-all', async (req: FastifyRequest, reply: FastifyReply) => {
    const authed = req as AuthedRequest;
    if (authed.user?.id == null) return reply.code(401).send({ error: 'Unauthorized' });
    revokeAllSessions(ctx.db, authed.user.id);
    clearSessionCookie(reply);
    auditLog(ctx.db, actorFor(req), 'auth.logout_all', { userId: authed.user.id });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req: FastifyRequest & { user?: unknown }, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Unauthorized' });
    return { user: req.user };
  });

  app.post('/api/auth/forgot', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = asBody(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) return fail(reply, new Error('email is required'));
    const { issued, token } = issuePasswordReset(ctx.db, email);
    auditLog(ctx.db, actorFor(req), 'auth.forgot', { email, issued });
    // Respond identically whether or not the account exists (no enumeration).
    if (config.authExposeResetToken && token) {
      // Pre-email-provider mode: surface the token so the flow is testable end-to-end.
      return { ok: true, resetToken: token };
    }
    return { ok: true };
  });

  app.post('/api/auth/reset', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 20, maxLength: 128 },
          password: { type: 'string', minLength: 1, maxLength: 1024 },
        },
      },
    },
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = asBody(req);
    const token = String(body.token ?? '');
    const password = String(body.password ?? '');
    const result = resetPasswordWithToken(ctx.db, token, password);
    if (!result.ok) return fail(reply, new Error(result.error));
    auditLog(ctx.db, actorFor(req), 'auth.reset');
    return { ok: true };
  });

  // Push notifications
  app.get('/api/push/vapid', async () => {
    return { publicKey: getVapidKeys().publicKey };
  });

  app.post('/api/push/subscribe', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = asBody(req);
      const sub = body.subscription as PushSubscription | undefined;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.keys?.p256dh || !sub.keys?.auth) {
        return fail(reply, new Error('A valid push subscription is required'));
      }
      const userId = (req as AuthedRequest).user?.id;
      if (userId == null) return reply.code(401).send({ error: 'Unauthorized' });
      saveSubscription(ctx.db, userId, sub);
      return { ok: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  // Unified activity ledger
  app.get('/api/ledger', handle(async () => {
    return { items: await getLedger(ctx) };
  }));

  app.get('/api/price', handle(async () => {
    const [quote, history] = await Promise.all([ctx.price.getQuote(), ctx.price.getHistory(30)]);
    return { quote, history };
  }));

  // Wallet
  app.get('/api/wallet', handle(async () => {
    const quote = await ctx.price.getQuote();
    const [balances, transactions] = await Promise.all([getBalances(ctx, quote.btcPriceMxn), Promise.resolve(getTransactions(ctx))]);
    return { balances, transactions, quote };
  }));

  app.post('/api/wallet/add', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountMxn = reqNum(req, 'amountMxn');
      await idempotent(ctx.db, {
        key: req.headers['idempotency-key'] as string | undefined,
        method: 'POST', path: '/api/wallet/add', userId: (req as AuthedRequest).user?.id ?? null,
        run: () => {
          addFiat(ctx, amountMxn);
          auditLog(ctx.db, actorFor(req), 'wallet.add_fiat', { amountMxn });
          return { ok: true };
        },
      });
      return { ok: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/wallet/buy', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountMxn = reqNum(req, 'amountMxn');
      const result = await idempotent(ctx.db, {
        key: req.headers['idempotency-key'] as string | undefined,
        method: 'POST', path: '/api/wallet/buy', userId: (req as AuthedRequest).user?.id ?? null,
        run: async () => {
          const r = await buyBtc(ctx, amountMxn);
          auditLog(ctx.db, actorFor(req), 'wallet.buy', { amountMxn, btc: r.btc, price: r.price });
          return { ok: true, ...r };
        },
      });
      if (result && 'replay' in result) {
        return reply.code(200).send(result.value ?? { ok: true });
      }
      return result;
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/wallet/sell', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountBtc = reqNum(req, 'amountBtc');
      const result = await idempotent(ctx.db, {
        key: req.headers['idempotency-key'] as string | undefined,
        method: 'POST', path: '/api/wallet/sell', userId: (req as AuthedRequest).user?.id ?? null,
        run: async () => {
          const r = await sellBtc(ctx, amountBtc);
          auditLog(ctx.db, actorFor(req), 'wallet.sell', { amountBtc, fiat: r.fiat, price: r.price });
          return { ok: true, ...r };
        },
      });
      if (result && 'replay' in result) {
        return reply.code(200).send(result.value ?? { ok: true });
      }
      return result;
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.get('/api/wallet/deposit', handle(async () => {
    return await getDepositInstructions(ctx);
  }));

  // On-chain wallet
  app.get('/api/wallet/onchain', handle(async () => {
    const [state, quote] = await Promise.all([syncOnchain(ctx), ctx.price.getQuote()]);
    return { ...state, btcPriceMxn: quote.btcPriceMxn, fiatValueMxn: (state.balanceSats / 100_000_000) * quote.btcPriceMxn };
  }));

  app.post('/api/onchain/simulate-deposit', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountSats = reqNum(req, 'amountSats');
      const state = await simulateDeposit(ctx, amountSats);
      return { ok: true, state };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/onchain/send', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = asBody(req);
      if (typeof body.to !== 'string') throw new Error('to address required');
      const amountSats = reqNum(req, 'amountSats');
      const result = await idempotent(ctx.db, {
        key: req.headers['idempotency-key'] as string | undefined,
        method: 'POST', path: '/api/onchain/send', userId: (req as AuthedRequest).user?.id ?? null,
        run: async () => {
          const r = await sendOnchain(ctx, body.to as string, amountSats);
          auditLog(ctx.db, actorFor(req), 'onchain.send', { to: body.to, amountSats, txid: r.txid, feeSats: r.feeSats });
          return { ok: true, ...r };
        },
      });
      if (result && 'replay' in result) {
        return reply.code(200).send(result.value ?? { ok: true });
      }
      return result;
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  // Lightning
  app.get('/api/lightning', handle(async () => {
    const [balance, activity, quote] = await Promise.all([
      ctx.lightning.getBalanceSats(),
      ctx.lightning.getActivity(),
      ctx.price.getQuote(),
    ]);
    return {
      balanceSats: balance,
      fiatEquivalentMxn: (balance / 100_000_000) * quote.btcPriceMxn,
      activity,
      btcPriceMxn: quote.btcPriceMxn,
    };
  }));

  app.post('/api/lightning/invoices', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountSats = reqNum(req, 'amountSats');
      const body = asBody(req);
      const memo = typeof body.memo === 'string' ? body.memo : '';
      const invoice = await ctx.lightning.createInvoice(amountSats, memo);
      auditLog(ctx.db, actorFor(req), 'lightning.invoice_created', { amountSats, memo, paymentHash: invoice.paymentHash });
      return { ok: true, invoice };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/lightning/pay', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = asBody(req);
      if (typeof body.bolt11 !== 'string' || body.bolt11.length < 20) {
        throw new Error('A valid bolt11 invoice is required');
      }
      const amountSats = num(body.amountSats);
      const result = await idempotent(ctx.db, {
        key: req.headers['idempotency-key'] as string | undefined,
        method: 'POST', path: '/api/lightning/pay', userId: (req as AuthedRequest).user?.id ?? null,
        run: async () => {
          const payment = await ctx.lightning.payInvoice(body.bolt11 as string, amountSats);
          auditLog(ctx.db, actorFor(req), 'lightning.pay', { bolt11: body.bolt11, amountSats, preimage: payment.preimage, feeSats: payment.feeSats });
          return { ok: true, ...payment };
        },
      });
      if (result && 'replay' in result) {
        return reply.code(200).send(result.value ?? { ok: true });
      }
      return result;
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.get('/api/lightning/invoices/:paymentHash', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const paymentHash = (req.params as { paymentHash?: string }).paymentHash ?? '';
      if (!paymentHash) throw new Error('paymentHash required');
      const isPaid = ctx.lightning.getInvoiceStatus
        ? await ctx.lightning.getInvoiceStatus(paymentHash)
        : false;
      return { ok: true, isPaid };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/lightning/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = asBody(req);
      const nested = body.body && typeof body.body === 'object' ? body.body as Record<string, unknown> : {};
      const fromQuery = (req.query as Record<string, unknown>).payment_hash;
      const paymentHash =
        (typeof body.payment_hash === 'string' ? body.payment_hash : '') ||
        (typeof nested.payment_hash === 'string' ? nested.payment_hash : '') ||
        (typeof fromQuery === 'string' ? fromQuery : '');
      if (!paymentHash) throw new Error('payment_hash required in webhook body');
      if (ctx.lightning.markPaid) {
        await ctx.lightning.markPaid(paymentHash);
        sendPush(ctx.db, 'Lightning payment received', 'Your sats just arrived.');
      }
      return { ok: true, received: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  // Inflation
  app.get('/api/inflation', handle(async () => {
    const snapshot = await ctx.inflation.getSnapshot();
    const quote = await ctx.price.getQuote();
    return { ...snapshot, btcPriceMxn: quote.btcPriceMxn, btcChange24hPct: quote.change24hPct };
  }));

  // Retirement
  app.post('/api/retirement/estimate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const monthlyExpMxn = reqNum(req, 'monthlyExpMxn');
      const extraBtc = num(asBody(req).extraBtc) ?? 0;
      const estimate = await estimateRetirement(ctx, { monthlyExpMxn, extraBtc });
      return { ok: true, estimate };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  // Marketplace
  app.get('/api/market/products', handle(async () => {
    return { products: await ctx.market.getProducts() };
  }));

  app.post('/api/market/purchase', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = asBody(req);
      if (typeof body.productId !== 'string') throw new Error('productId required');
      const amountFiat = reqNum(req, 'amountFiat');
      const order = await ctx.market.purchase(body.productId, amountFiat);
      ctx.db.prepare(
        'INSERT INTO market_orders (product_id, product_name, amount_fiat, status, redemption_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(body.productId, body.productId, amountFiat, order.status, order.redemptionCode, new Date().toISOString());
      return { ok: true, order };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.get('/api/market/orders', handle(async () => {
    return { orders: ctx.db.prepare('SELECT * FROM market_orders ORDER BY id DESC').all() };
  }));

  // Loan
  app.get('/api/loan/quote', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const collateralBtc = reqNum(req, 'collateralBtc');
      const quote = await ctx.price.getQuote();
      const loan = await ctx.loan.quote(collateralBtc, quote.btcPriceMxn);
      return { ok: true, loan, btcPriceMxn: quote.btcPriceMxn };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  // DCA
  app.get('/api/dca', handle(async () => {
    return { schedules: listSchedules(ctx) };
  }));

  app.post('/api/dca', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountFiat = reqNum(req, 'amountFiat');
      const body = asBody(req);
      if (body.frequency !== undefined && !isDcaFrequency(body.frequency)) {
        throw new Error('frequency must be daily, weekly or monthly');
      }
      const schedules = createSchedule(ctx, amountFiat, body.frequency);
      auditLog(ctx.db, actorFor(req), 'dca.create', { amountFiat, frequency: body.frequency });
      return { schedules };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.delete('/api/dca/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const id = Number((req.params as { id?: string }).id);
      if (!Number.isFinite(id)) throw new Error('Invalid id');
      deleteSchedule(ctx, id);
      auditLog(ctx.db, actorFor(req), 'dca.delete', { id });
      return { ok: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.get('/api/dca/growth', handle(async () => {
    const quote = await ctx.price.getQuote();
    return { growth: await getDcaGrowth(ctx, quote.btcPriceMxn), btcPriceMxn: quote.btcPriceMxn };
  }));

  // Taxes
  app.get('/api/taxes', handle(async () => {
    return getTaxSummary(ctx);
  }));

  // Security audit
  app.get('/api/security', handle(async () => {
    return await getSecurityReport(ctx);
  }));
}
