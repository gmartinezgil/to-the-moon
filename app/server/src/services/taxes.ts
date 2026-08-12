import type { AppContext } from '../context';
import { getTransactions } from './wallet';

export interface TradeRow {
  id: number;
  kind: 'buy' | 'sell';
  amountBtc: number;
  amountFiat: number;
  priceMxn: number;
  createdAt: string;
}

export interface TaxSummary {
  buys: { count: number; btc: number; investedMxn: number };
  sells: { count: number; btc: number; proceedsMxn: number };
  avgCostMxn: number;
  realizedGainMxn: number;
  trades: TradeRow[];
}

export function getTaxSummary(ctx: AppContext): TaxSummary {
  const rows = getTransactions(ctx, 500) as unknown as {
    id: number; kind: string; amount_fiat: number; amount_btc: number; meta: string; created_at: string;
  }[];

  let buyCount = 0, buyBtc = 0, buyFiat = 0, sellCount = 0, sellBtc = 0, sellFiat = 0;
  const trades: TradeRow[] = [];

  for (const t of rows) {
    let priceMxn = 0;
    try {
      priceMxn = Number((JSON.parse(t.meta) as { source?: string }).source ?? 0);
    } catch {
      /* ignore malformed meta */
    }
    if (t.kind === 'buy' && t.amount_btc > 0) {
      buyCount += 1;
      buyBtc += t.amount_btc;
      buyFiat += t.amount_fiat;
      trades.push({ id: t.id, kind: 'buy', amountBtc: t.amount_btc, amountFiat: t.amount_fiat, priceMxn, createdAt: t.created_at });
    } else if (t.kind === 'sell' && t.amount_btc > 0) {
      sellCount += 1;
      sellBtc += t.amount_btc;
      sellFiat += t.amount_fiat;
      trades.push({ id: t.id, kind: 'sell', amountBtc: t.amount_btc, amountFiat: t.amount_fiat, priceMxn, createdAt: t.created_at });
    }
  }

  // Average-cost basis: realized gain = sell proceeds − cost basis of BTC sold.
  const avgCostMxn = buyBtc > 0 ? buyFiat / buyBtc : 0;
  const realizedGainMxn = sellFiat - sellBtc * avgCostMxn;

  return {
    buys: { count: buyCount, btc: buyBtc, investedMxn: buyFiat },
    sells: { count: sellCount, btc: sellBtc, proceedsMxn: sellFiat },
    avgCostMxn,
    realizedGainMxn,
    trades: trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  };
}
