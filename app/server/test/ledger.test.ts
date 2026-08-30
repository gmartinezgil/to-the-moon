import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { getLedger } from '../src/services/ledger';
import { addFiat, buyBtc } from '../src/services/wallet';
import { simulateDeposit } from '../src/services/onchain';

describe('ledger service', () => {
  it('combines lightning, exchange, onchain and market activity sorted newest-first', async () => {
    const ctx = makeContext();
    const quote = await ctx.price.getQuote();

    addFiat(ctx, 1000);
    await buyBtc(ctx, 500);
    await simulateDeposit(ctx, 1_000_000);

    const items = await getLedger(ctx);
    expect(items.length).toBeGreaterThanOrEqual(4);

    const sources = new Set(items.map((i) => i.source));
    expect(sources.has('exchange')).toBe(true);
    expect(sources.has('onchain')).toBe(true);
    expect(sources.has('lightning')).toBe(true);

    // Sorted newest -> oldest.
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1].createdAt).getTime() >= new Date(items[i].createdAt).getTime()).toBe(true);
    }
  });

  it('includes fiat-add and buy transactions as exchange entries', async () => {
    const ctx = makeContext();
    addFiat(ctx, 1000);
    await buyBtc(ctx, 500);
    const items = await getLedger(ctx);
    const exchange = items.filter((i) => i.source === 'exchange');
    const fiat = exchange.find((i) => i.memo.startsWith('SPEI'));
    const buy = exchange.find((i) => i.memo.startsWith('Buy BTC'));
    expect(fiat).toBeTruthy();
    expect(buy).toBeTruthy();
    expect(buy!.direction).toBe('out');
  });
});
