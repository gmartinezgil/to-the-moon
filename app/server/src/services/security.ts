import type { AppContext } from '../context';
import { ensureAddress } from './onchain';

export interface SecurityCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface SecurityReport {
  checks: SecurityCheck[];
  utxoCount: number;
  utxoTotalSats: number;
  unconfirmedSats: number;
  confirmedSats: number;
  minConfirmations: number;
  largestUtxoSats: number;
  address: string;
  provider: string;
}

export async function getSecurityReport(ctx: AppContext): Promise<SecurityReport> {
  const checks: SecurityCheck[] = [];

  let utxoCount = 0;
  let utxoTotalSats = 0;
  let unconfirmedSats = 0;
  let confirmedSats = 0;
  let minConfirmations = Infinity;
  let largestUtxoSats = 0;
  let address = '';
  let provider = ctx.onchain.name;

  try {
    const info = await ensureAddress(ctx);
    address = info.address;
    const utxos = await ctx.onchain.getUtxos(info.address);
    utxoCount = utxos.length;
    for (const u of utxos) {
      utxoTotalSats += u.valueSats;
      if (u.confirmations === 0) unconfirmedSats += u.valueSats;
      else confirmedSats += u.valueSats;
      if (u.confirmations < minConfirmations) minConfirmations = u.confirmations;
      if (u.valueSats > largestUtxoSats) largestUtxoSats = u.valueSats;
    }
    checks.push({
      label: 'On-chain wallet',
      ok: true,
      detail: `${utxoCount} UTXO${utxoCount === 1 ? '' : 's'} · ${(utxoTotalSats / 100_000_000).toFixed(8)} BTC`,
    });
    if (unconfirmedSats > 0) {
      checks.push({ label: 'Unconfirmed funds', ok: true, detail: `${unconfirmedSats} sats pending confirmation` });
    }
  } catch (err) {
    checks.push({ label: 'On-chain wallet', ok: false, detail: (err as Error).message });
  }

  const hasMnemonic = ctx.db.prepare('SELECT COUNT(*) AS n FROM wallet_keys').get() as { n: number };
  checks.push({
    label: 'Seed backup',
    ok: hasMnemonic.n > 0,
    detail: hasMnemonic.n > 0 ? 'Mnemonic stored (server-side only)' : 'No mnemonic found',
  });

  try {
    const ln = await ctx.lightning.getBalanceSats();
    checks.push({ label: 'Lightning node', ok: true, detail: `${ln} sats reachable` });
  } catch (err) {
    checks.push({ label: 'Lightning node', ok: false, detail: (err as Error).message });
  }

  try {
    const quote = await ctx.price.getQuote();
    checks.push({ label: 'Price feed', ok: true, detail: `${quote.source} live` });
  } catch (err) {
    checks.push({ label: 'Price feed', ok: false, detail: (err as Error).message });
  }

  return {
    checks,
    utxoCount,
    utxoTotalSats,
    unconfirmedSats,
    confirmedSats,
    minConfirmations: minConfirmations === Infinity ? 0 : minConfirmations,
    largestUtxoSats,
    address,
    provider,
  };
}
