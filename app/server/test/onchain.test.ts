import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { ensureAddress, syncOnchain, simulateDeposit, sendOnchain, getCachedOnChainSats } from '../src/services/onchain';

function validBech32() {
  return 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
}

describe('onchain service', () => {
  it('derives and persists a receive address', async () => {
    const ctx = makeContext();
    const info = await ensureAddress(ctx);
    expect(info.address).toMatch(/^bc1/);
    expect(info.index).toBe(0);
    // Second call returns same address (persisted).
    const again = await ensureAddress(ctx);
    expect(again.address).toBe(info.address);
  });

  it('syncOnchain returns a state with the mock balance', async () => {
    const ctx = makeContext();
    const state = await syncOnchain(ctx);
    expect(state.address).toMatch(/^bc1/);
    expect(state.provider).toBe('mock');
    // Mock seeds a 1,000,000 sat deposit when the address first appears.
    expect(state.balanceSats).toBeGreaterThanOrEqual(1_000_000);
  });

  it('simulateDeposit increases the balance and persists cached sats', async () => {
    const ctx = makeContext();
    const before = await syncOnchain(ctx);
    const after = await simulateDeposit(ctx, 250_000);
    expect(after.balanceSats - before.balanceSats).toBe(250_000);
    expect(getCachedOnChainSats(ctx)).toBe(after.balanceSats);
  });

  it('sendOnchain spends sats and returns a txid', async () => {
    const ctx = makeContext();
    await simulateDeposit(ctx, 500_000); // top up to ensure a spendable UTXO is available
    const before = await syncOnchain(ctx);
    const result = await sendOnchain(ctx, validBech32(), 100_000);
    expect(result.txid).toMatch(/^[a-f0-9]{64}$/);
    expect(result.feeSats).toBeGreaterThan(0);
    const after = await syncOnchain(ctx);
    // send should have reduced total balance by (amount + fee)
    const expectedDrop = 100_000 + result.feeSats;
    expect(after.balanceSats).toBeLessThanOrEqual(before.balanceSats - expectedDrop + 1);
  });

  it('rejects an invalid destination address', async () => {
    const ctx = makeContext();
    await simulateDeposit(ctx, 1_000_000);
    await expect(sendOnchain(ctx, 'not-an-address', 1000)).rejects.toThrow('Invalid bitcoin address');
  });

  it('rejects sends exceeding the balance', async () => {
    const ctx = makeContext();
    await simulateDeposit(ctx, 10_000);
    // 1 vB fee * (large amount) -> not enough
    await expect(sendOnchain(ctx, validBech32(), 10_000_000)).rejects.toThrow(/Insufficient|No on-chain/);
  });
});
