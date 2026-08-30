import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { listSchedules, createSchedule, deleteSchedule, runDue, isDcaFrequency } from '../src/services/dca';
import { getDcaGrowth } from '../src/services/dcaGrowth';
import { getBalances } from '../src/services/wallet';

describe('dca service', () => {
  it('isDcaFrequency validates allowed values', () => {
    expect(isDcaFrequency('daily')).toBe(true);
    expect(isDcaFrequency('weekly')).toBe(true);
    expect(isDcaFrequency('monthly')).toBe(true);
    expect(isDcaFrequency('yearly')).toBe(false);
    expect(isDcaFrequency(42)).toBe(false);
  });

  it('createSchedule default is daily and listSchedules returns it', () => {
    const ctx = makeContext();
    createSchedule(ctx, 100);
    createSchedule(ctx, 200, 'weekly');
    const s = listSchedules(ctx);
    expect(s).toHaveLength(2);
    expect(s[0].frequency).toBe('weekly'); // newest first
    expect(s[0].amount_fiat).toBe(200);
    expect(s[1].frequency).toBe('daily');
    expect(s[1].amount_fiat).toBe(100);
  });

  it('rejects non-positive amounts', () => {
    const ctx = makeContext();
    expect(() => createSchedule(ctx, 0)).toThrow('positive');
  });

  it('deleteSchedule removes a schedule', () => {
    const ctx = makeContext();
    const s = createSchedule(ctx, 100);
    const id = s[0].id;
    deleteSchedule(ctx, id);
    expect(listSchedules(ctx).some((x) => x.id === id)).toBe(false);
  });

  it('runDue executes a schedule that has never run and buys btc', async () => {
    const ctx = makeContext();
    createSchedule(ctx, 500, 'daily');
    const before = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    const results = await runDue(ctx);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('ok');
    const after = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    expect(after.btc).toBeGreaterThan(before.btc);
    expect(after.fiatMxn).toBeLessThan(before.fiatMxn);
  });

  it('runDue does not re-run a schedule already run within its frequency window', async () => {
    const ctx = makeContext();
    createSchedule(ctx, 500, 'daily');
    await runDue(ctx);
    const results = await runDue(ctx);
    expect(results).toHaveLength(0);
  });
});

describe('dca growth service', () => {
  it('returns zeros with no buys', async () => {
    const ctx = makeContext();
    const g = await getDcaGrowth(ctx, 1_000_000);
    expect(g.buys).toBe(0);
    expect(g.investedMxn).toBe(0);
    expect(g.stackedBtc).toBe(0);
    expect(g.points).toEqual([]);
  });

  it('builds a cumulative point series from real buys', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();
    const price = quote.btcPriceMxn;
    await buyBtcFor(ctx, price, 500);
    await buyBtcFor(ctx, price, 300);
    const g = await getDcaGrowth(ctx, price);
    expect(g.buys).toBe(2);
    expect(g.investedMxn).toBe(800);
    expect(g.stackedBtc).toBeCloseTo(800 / price, 10);
    expect(g.points).toHaveLength(2);
    // value = stackedBtc * price
    expect(g.valueMxn).toBeCloseTo(g.stackedBtc * price, 6);
  });
});

async function buyBtcFor(ctx: ReturnType<typeof makeContext>, price: number, fiat: number) {
  const { buyBtc } = await import('../src/services/wallet');
  // Use the mock's own price to keep math consistent; just place a buy.
  return buyBtc(ctx, fiat);
}
