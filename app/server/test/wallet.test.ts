import { describe, it, expect, beforeEach } from 'vitest';
import { makeContext } from './helpers';
import { getBalances, addFiat, buyBtc, sellBtc, getTransactions } from '../src/services/wallet';

describe('wallet service', () => {
  beforeEach(() => {});

  it('getBalances returns seeded balance and computes total wealth from price', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();
    const b = await getBalances(ctx, quote.btcPriceMxn);
    expect(b.fiatMxn).toBeGreaterThan(0);
    expect(b.btc).toBeGreaterThan(0);
    expect(b.sats).toBeGreaterThan(0);
    expect(b.onchainSats).toBe(0); // fresh mock on-chain has not been synced yet
    // totalMxn = fiat + (btc + onchain/1e8) * price
    const btcTotal = b.btc + b.onchainSats / 100_000_000;
    expect(b.totalMxn).toBeCloseTo(b.fiatMxn + btcTotal * quote.btcPriceMxn, 6);
  });

  it('rejects non-positive addFiat', () => {
    const ctx = makeContext();
    expect(() => addFiat(ctx, 0)).toThrow('positive');
    expect(() => addFiat(ctx, -5)).toThrow('positive');
  });

  it('addFiat increases fiat and records a transaction', async () => {
    const ctx = makeContext();
    const before = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    addFiat(ctx, 1000);
    const after = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    expect(after.fiatMxn - before.fiatMxn).toBe(1000);
    expect(getTransactions(ctx)).toHaveLength(1);
  });

  it('buyBtc spends fiat and increases btc', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();
    const before = await getBalances(ctx, quote.btcPriceMxn);
    const result = await buyBtc(ctx, 500);
    expect(result.btc).toBeCloseTo(500 / quote.btcPriceMxn, 10);
    const after = await getBalances(ctx, quote.btcPriceMxn);
    expect(after.fiatMxn).toBeCloseTo(before.fiatMxn - 500, 6);
    expect(after.btc).toBeCloseTo(before.btc + result.btc, 10);
  });

  it('buyBtc rejects when fiat is insufficient', async () => {
    const ctx = makeContext();
    const before = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    await expect(buyBtc(ctx, before.fiatMxn + 1)).rejects.toThrow('Insufficient fiat');
  });

  it('sellBtc converts btc to fiat', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();
    const before = await getBalances(ctx, quote.btcPriceMxn);
    const amount = Math.min(0.001, before.btc);
    const result = await sellBtc(ctx, amount);
    expect(result.fiat).toBeCloseTo(amount * quote.btcPriceMxn, 6);
    const after = await getBalances(ctx, quote.btcPriceMxn);
    expect(after.btc).toBeCloseTo(before.btc - amount, 10);
  });

  it('sellBtc rejects when btc is insufficient', async () => {
    const ctx = makeContext();
    const before = await getBalances(ctx, (await ctx.price.getQuote()).btcPriceMxn);
    await expect(sellBtc(ctx, before.btc + 1)).rejects.toThrow('Insufficient BTC');
  });
});
