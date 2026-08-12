import type { AppContext } from '../context';
import { getTransactions } from './wallet';

export interface DcaGrowthPoint {
  t: string;
  investedMxn: number;
  valueMxn: number;
}

export interface DcaGrowth {
  buys: number;
  investedMxn: number;
  stackedBtc: number;
  valueMxn: number;
  growthMxn: number;
  growthPct: number;
  points: DcaGrowthPoint[];
}

export async function getDcaGrowth(ctx: AppContext, btcPriceMxn: number): Promise<DcaGrowth> {
  const rows = getTransactions(ctx, 500) as unknown as {
    id: number; kind: string; amount_fiat: number; amount_btc: number; meta: string; created_at: string;
  }[];
  const buys = rows
    .filter((t) => t.kind === 'buy' && t.amount_btc > 0)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let investedMxn = 0;
  let stackedBtc = 0;
  const points: DcaGrowthPoint[] = [];
  for (const b of buys) {
    investedMxn += b.amount_fiat;
    stackedBtc += b.amount_btc;
    points.push({ t: b.created_at, investedMxn, valueMxn: stackedBtc * btcPriceMxn });
  }

  const valueMxn = stackedBtc * btcPriceMxn;
  const growthMxn = valueMxn - investedMxn;
  return {
    buys: buys.length,
    investedMxn,
    stackedBtc,
    valueMxn,
    growthMxn,
    growthPct: investedMxn > 0 ? (growthMxn / investedMxn) * 100 : 0,
    points,
  };
}
