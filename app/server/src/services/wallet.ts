import type { AppContext } from '../context';
import { nowIso } from '../db';

export interface Balances {
  fiatMxn: number;
  btc: number;
  sats: number;
  totalMxn: number;
}

export async function getBalances(ctx: AppContext, btcPriceMxn: number): Promise<Balances> {
  const row = ctx.db.prepare('SELECT fiat_mxn, btc, sats FROM balances WHERE id = 1').get() as {
    fiat_mxn: number; btc: number; sats: number;
  };
  return {
    fiatMxn: row.fiat_mxn,
    btc: row.btc,
    sats: row.sats,
    totalMxn: row.fiat_mxn + row.btc * btcPriceMxn,
  };
}

export function getTransactions(ctx: AppContext, limit = 50) {
  return ctx.db.prepare(
    'SELECT id, kind, amount_fiat, amount_btc, amount_sats, meta, created_at FROM transactions ORDER BY id DESC LIMIT ?',
  ).all(limit);
}

function record(
  ctx: AppContext,
  kind: string,
  amounts: { fiat?: number; btc?: number; sats?: number },
  meta: Record<string, unknown> = {},
) {
  ctx.db.prepare(
    'INSERT INTO transactions (kind, amount_fiat, amount_btc, amount_sats, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(kind, amounts.fiat ?? 0, amounts.btc ?? 0, amounts.sats ?? 0, JSON.stringify(meta), nowIso());
}

export function addFiat(ctx: AppContext, amountMxn: number) {
  if (amountMxn <= 0) throw new Error('Amount must be positive');
  ctx.db.prepare('UPDATE balances SET fiat_mxn = fiat_mxn + ? WHERE id = 1').run(amountMxn);
  record(ctx, 'add_fiat', { fiat: amountMxn });
}

export async function buyBtc(ctx: AppContext, amountMxn: number) {
  if (amountMxn <= 0) throw new Error('Amount must be positive');
  const row = ctx.db.prepare('SELECT fiat_mxn FROM balances WHERE id = 1').get() as { fiat_mxn: number };
  if (amountMxn > row.fiat_mxn) throw new Error('Insufficient fiat balance');
  const quote = await ctx.price.getQuote();
  const execution = await ctx.exchange.buy(amountMxn, quote.btcPriceMxn);
  const btc = amountMxn / quote.btcPriceMxn;
  ctx.db.prepare('UPDATE balances SET fiat_mxn = fiat_mxn - ?, btc = btc + ? WHERE id = 1')
    .run(amountMxn, btc - execution.feeBtc);
  record(ctx, 'buy', { fiat: amountMxn, btc }, { orderId: execution.orderId, source: execution.btcPriceMxn, provider: ctx.exchange.name });
  return { btc, price: quote.btcPriceMxn };
}

export async function sellBtc(ctx: AppContext, amountBtc: number) {
  if (amountBtc <= 0) throw new Error('Amount must be positive');
  const row = ctx.db.prepare('SELECT btc FROM balances WHERE id = 1').get() as { btc: number };
  if (amountBtc > row.btc) throw new Error('Insufficient BTC balance');
  const quote = await ctx.price.getQuote();
  const execution = await ctx.exchange.sell(amountBtc, quote.btcPriceMxn);
  const fiat = amountBtc * quote.btcPriceMxn;
  ctx.db.prepare('UPDATE balances SET btc = btc - ?, fiat_mxn = fiat_mxn + ? WHERE id = 1')
    .run(amountBtc, fiat);
  record(ctx, 'sell', { fiat, btc: amountBtc }, { orderId: execution.orderId, price: quote.btcPriceMxn, provider: ctx.exchange.name });
  return { fiat, price: quote.btcPriceMxn };
}

export function getDepositInstructions(ctx: AppContext) {
  return ctx.exchange.getDepositInstructions();
}
