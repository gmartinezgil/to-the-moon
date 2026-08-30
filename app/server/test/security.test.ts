import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { getSecurityReport } from '../src/services/security';
import { simulateDeposit } from '../src/services/onchain';

describe('security service', () => {
  it('reports UTXO audit with a fresh mock wallet', async () => {
    const ctx = makeContext();
    const report = await getSecurityReport(ctx);
    expect(report.address).toMatch(/^bc1/);
    expect(report.utxoCount).toBeGreaterThanOrEqual(1);
    expect(report.utxoTotalSats).toBeGreaterThanOrEqual(1_000_000);
    expect(report.confirmedSats).toBeGreaterThan(0);
    // health checks present
    const labels = report.checks.map((c) => c.label);
    expect(labels).toContain('On-chain wallet');
    expect(labels).toContain('Seed backup');
    expect(labels).toContain('Lightning node');
    expect(labels).toContain('Price feed');
  });

  it('flags unconfirmed funds when a fresh deposit exists', async () => {
    const ctx = makeContext();
    await simulateDeposit(ctx, 1_000_000); // simulated deposit has 0 confirmations
    const report = await getSecurityReport(ctx);
    expect(report.unconfirmedSats).toBeGreaterThan(0);
    expect(report.checks.some((c) => c.label === 'Unconfirmed funds')).toBe(true);
  });
});
