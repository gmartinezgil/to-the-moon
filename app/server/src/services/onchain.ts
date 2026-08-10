import * as bitcoin from 'bitcoinjs-lib';
import type { AppContext } from '../context';
import { nowIso } from '../db';
import type { AddressInfo } from '../onchain/wallet';

export interface OnChainState {
  address: string;
  index: number;
  outputScript: string;
  balanceSats: number;
  provider: string;
  syncedAt: string;
}

interface WalletStateRow {
  address: string;
  address_index: number;
  balance_sats: number;
  last_sync_at: string | null;
}

export function getWalletState(ctx: AppContext): WalletStateRow {
  return ctx.db.prepare('SELECT address, address_index, balance_sats, last_sync_at FROM wallet_state WHERE id = 1')
    .get() as unknown as WalletStateRow;
}

export function getCachedOnChainSats(ctx: AppContext): number {
  return getWalletState(ctx).balance_sats;
}

export async function ensureAddress(ctx: AppContext): Promise<AddressInfo> {
  const state = getWalletState(ctx);
  const index = state.address === '' ? 0 : state.address_index;
  const info = ctx.wallet.getReceiveAddress(index);
  if (state.address === '') {
    ctx.db.prepare('UPDATE wallet_state SET address = ?, address_index = ? WHERE id = 1')
      .run(info.address, info.index);
  }
  return info;
}

export async function syncOnchain(ctx: AppContext): Promise<OnChainState> {
  const info = await ensureAddress(ctx);
  const [balance, utxos, transactions] = await Promise.all([
    ctx.onchain.getBalanceSats(info.address),
    ctx.onchain.getUtxos(info.address),
    ctx.onchain.getTransactions(info.address),
  ]);
  ctx.db.prepare('UPDATE wallet_state SET balance_sats = ?, last_sync_at = ? WHERE id = 1')
    .run(balance, nowIso());
  return {
    ...info,
    outputScript: Buffer.from(info.outputScript).toString('hex'),
    balanceSats: balance,
    provider: ctx.onchain.name,
    syncedAt: nowIso(),
  };
}

export async function simulateDeposit(ctx: AppContext, amountSats: number) {
  if (!ctx.onchain.simulateDeposit) throw new Error('Simulation requires the mock on-chain provider');
  const info = await ensureAddress(ctx);
  await ctx.onchain.simulateDeposit(info.address, amountSats);
  return syncOnchain(ctx);
}

// Approx P2WPKH sizes: 110 vB/input + 31 vB/output + 10 vB overhead.
const VB_INPUT = 110;
const VB_OUTPUT = 31;
const VB_OVERHEAD = 10;

export async function sendOnchain(ctx: AppContext, to: string, amountSats: number) {
  if (amountSats <= 0) throw new Error('Amount must be positive');
  if (!/^bc1[a-z0-9]{20,80}$/.test(to)) throw new Error('Invalid bitcoin address');

  const info = await ensureAddress(ctx);
  const utxos = await ctx.onchain.getUtxos(info.address);
  if (utxos.length === 0) throw new Error('No on-chain funds available');

  const feeRate = await ctx.onchain.estimateFeeSatPerVb();
  const feeSats = Math.round((VB_OVERHEAD + utxos.length * VB_INPUT + 2 * VB_OUTPUT) * feeRate);

  // Greedy coin selection.
  let selected: typeof utxos = [];
  let sum = 0;
  for (const u of utxos) {
    selected.push(u);
    sum += u.valueSats;
    if (sum >= amountSats + feeSats) break;
  }
  if (sum < amountSats + feeSats) throw new Error('Insufficient on-chain balance (incl. fee)');

  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  selected.forEach((u) => {
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: { script: info.outputScript, value: BigInt(u.valueSats) },
    });
  });
  psbt.addOutput({ address: to, value: BigInt(amountSats) });
  const change = sum - amountSats - feeSats;
  if (change >= 546) psbt.addOutput({ address: info.address, value: BigInt(change) });
  const signer = ctx.wallet.getSigner(info.index);
  selected.forEach((_, i) => {
    psbt.signInput(i, signer);
  });
  psbt.finalizeAllInputs();

  const rawTxHex = psbt.extractTransaction().toHex();
  const txid = await ctx.onchain.broadcast(rawTxHex);
  const state = await syncOnchain(ctx);
  return { txid, feeSats, ...state };
}
