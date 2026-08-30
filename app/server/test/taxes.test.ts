import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { buyBtc, sellBtc, addFiat } from '../src/services/wallet';
import { getTaxSummary } from '../src/services/taxes';

describe('taxes service', () => {
  it('returns zeros when there is no trade history', () => {
    const ctx = makeContext();
    const t = getTaxSummary(ctx);
    expect(t.buys.count).toBe(0);
    expect(t.buys.btc).toBe(0);
    expect(t.sells.count).toBe(0);
    expect(t.avgCostMxn).toBe(0);
    expect(t.realizedGainMxn).toBe(0);
    expect(t.trades).toEqual([]);
  });

  it('computes an average-cost realized gain from a buy then a sell', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();
    const price = quote.btcPriceMxn;

    // Buy 0.01 BTC worth of fiat.
    const buyFiat = 0.01 * price;
    await buyBtc(ctx, buyFiat);

    // Sell half of it (0.005 BTC).
    const sellAmount = 0.005;
    await sellBtc(ctx, sellAmount);

    const t = getTaxSummary(ctx);
    expect(t.buys.count).toBe(1);
    expect(t.buys.btc).toBeCloseTo(0.01, 10);
    expect(t.buys.investedMxn).toBeCloseTo(buyFiat, 6);
    expect(t.sells.count).toBe(1);
    expect(t.sells.btc).toBeCloseTo(sellAmount, 10);

    // avgCost = buyFiat / 0.01 BTC
    const avgCost = buyFiat / 0.01;
    expect(t.avgCostMxn).toBeCloseTo(avgCost, 6);

    // realized = proceeds − avgCost × sold
    const proceeds = sellAmount * price;
    const realized = proceeds - avgCost * sellAmount;
    expect(t.realizedGainMxn).toBeCloseTo(realized, 6);

    // trades includes both, newest first (sell was last)
    expect(t.trades).toHaveLength(2);
    expect(t.trades[0].kind).toBe('sell');
    expect(t.trades[1].kind).toBe('buy');
  });

  it('only counts buy/sell transactions (ignores add_fiat)', async () => {
    const ctx = makeContext();
    addFiat(ctx, 5000);
    await buyBtc(ctx, 100);
    const t = getTaxSummary(ctx);
    expect(t.buys.count).toBe(1);
    expect(t.sells.count).toBe(0);
  });
});
