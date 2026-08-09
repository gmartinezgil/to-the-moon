import { getBalances } from './wallet';
import type { AppContext } from '../context';

export interface RetirementEstimateInput {
  monthlyExpMxn: number;
  extraBtc: number;
}

export interface RetirementEstimate {
  fireGoalMxn: number;
  targetBtc: number;
  currentBtc: number;
  progressPct: number;
  yearsToExit: number;
  status: 'ACCUMULATING' | 'FINANCIALLY FREE';
  btcPriceMxn: number;
}

// 4% rule: goal is 25x annual expenses. Assumes ~0.5 BTC/yr accumulation.
const BTC_PER_YEAR = 0.5;

export async function estimateRetirement(ctx: AppContext, input: RetirementEstimateInput): Promise<RetirementEstimate> {
  const quote = await ctx.price.getQuote();
  const balances = await getBalances(ctx, quote.btcPriceMxn);

  const fireGoalMxn = input.monthlyExpMxn * 12 * 25;
  const targetBtc = fireGoalMxn / quote.btcPriceMxn;
  const currentBtc = balances.btc + Math.max(0, input.extraBtc);
  const progressPct = Math.min(100, (currentBtc / targetBtc) * 100);
  const yearsToExit = progressPct >= 100 ? 0 : Math.max(0, (targetBtc - currentBtc) / BTC_PER_YEAR);

  return {
    fireGoalMxn,
    targetBtc,
    currentBtc,
    progressPct,
    yearsToExit: Number(yearsToExit.toFixed(1)),
    status: progressPct >= 100 ? 'FINANCIALLY FREE' : 'ACCUMULATING',
    btcPriceMxn: quote.btcPriceMxn,
  };
}
