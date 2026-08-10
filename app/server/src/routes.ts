import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppContext } from './context';
import { getBalances, getTransactions, addFiat, buyBtc, sellBtc, getDepositInstructions } from './services/wallet';
import { estimateRetirement } from './services/retirement';
import { listSchedules, createSchedule, deleteSchedule } from './services/dca';
import { syncOnchain, simulateDeposit, sendOnchain } from './services/onchain';

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

export function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  const fail = (reply: FastifyReply, err: Error) => reply.code(400).send({ error: err.message });
  const handle = (fn: () => Promise<unknown>) => async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn();
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  };

  app.get('/api/health', () => ({ ok: true, time: new Date().toISOString() }));

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
      addFiat(ctx, amountMxn);
      return { ok: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/wallet/buy', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountMxn = reqNum(req, 'amountMxn');
      const result = await buyBtc(ctx, amountMxn);
      return { ok: true, ...result };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });

  app.post('/api/wallet/sell', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const amountBtc = reqNum(req, 'amountBtc');
      const result = await sellBtc(ctx, amountBtc);
      return { ok: true, ...result };
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
      const result = await sendOnchain(ctx, body.to, amountSats);
      return { ok: true, ...result };
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
      const payment = await ctx.lightning.payInvoice(body.bolt11, amountSats);
      return { ok: true, ...payment };
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
      return { schedules: createSchedule(ctx, amountFiat) };
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
      return { ok: true };
    } catch (err) {
      fail(reply, err as Error);
      return undefined;
    }
  });
}
