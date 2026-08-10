import * as bitcoin from 'bitcoinjs-lib';
import { config } from '../config';
import type { OnChainProvider, OnChainTx, OnChainUtxo } from './types';

interface MockState {
  utxos: OnChainUtxo[];
  txns: OnChainTx[];
  outputScript: Uint8Array;
}

function reverseHash(buf: Uint8Array): string {
  return Buffer.from(buf).reverse().toString('hex');
}

export class MockOnChainProvider implements OnChainProvider {
  readonly name = 'mock';
  private states = new Map<string, MockState>();

  private state(address: string): MockState {
    let s = this.states.get(address);
    if (!s) {
      // Seed a realistic demo deposit so the wallet has something to show.
      const now = Math.floor(Date.now() / 1000);
      const txid = '0'.repeat(63) + 'a';
      s = {
        utxos: [{ txid, vout: 0, valueSats: 1_000_000, confirmations: 6 }],
        txns: [{ txid, direction: 'in', valueSats: 1_000_000, confirmations: 6, blocktime: now - 3600 }],
        outputScript: bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin),
      };
      this.states.set(address, s);
    }
    return s;
  }

  async getBalanceSats(address: string) {
    return this.state(address).utxos.reduce((sum, u) => sum + u.valueSats, 0);
  }

  async getUtxos(address: string) {
    return this.state(address).utxos;
  }

  async getTransactions(address: string) {
    return this.state(address).txns;
  }

  async estimateFeeSatPerVb() {
    return 1;
  }

  async broadcast(rawTxHex: string) {
    const tx = bitcoin.Transaction.fromHex(rawTxHex);
    const state = this.state(this.addressOf(tx));
    const txid = tx.getId();
    const spentIns = tx.ins.map((inp) => ({ txid: reverseHash(inp.hash), vout: inp.index }));
    state.utxos = state.utxos.filter(
      (u) => !spentIns.some((s) => s.txid === u.txid && s.vout === u.vout),
    );
    const now = Math.floor(Date.now() / 1000);
    let sentSats = 0;
    tx.outs.forEach((o, i) => {
      const value = Number(o.value);
      if (Buffer.from(o.script).equals(Buffer.from(state.outputScript))) {
        state.utxos.unshift({ txid, vout: i, valueSats: value, confirmations: 0 });
      } else {
        sentSats += value;
      }
    });
    state.txns.unshift({
      txid,
      direction: 'out',
      valueSats: sentSats,
      confirmations: 0,
      blocktime: now,
    });
    return txid;
  }

  private addressOf(tx: bitcoin.Transaction): string {
    // Best-effort: the address whose utxo was spent is recovered from the first input.
    if (tx.ins.length > 0) {
      const txid = reverseHash(tx.ins[0].hash);
      for (const [addr, s] of this.states) {
        if (s.utxos.some((u) => u.txid === txid && u.vout === tx.ins[0].index)) return addr;
      }
    }
    // Fall back to the only known address.
    return this.states.keys().next().value as string;
  }

  async simulateDeposit(address: string, amountSats: number) {
    const s = this.state(address);
    const txid = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    s.utxos.unshift({ txid, vout: 0, valueSats: amountSats, confirmations: 0 });
    s.txns.unshift({
      txid,
      direction: 'in',
      valueSats: amountSats,
      confirmations: 0,
      blocktime: Math.floor(Date.now() / 1000),
    });
  }
}

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: { prevout: { value: number; scriptpubkey_address?: string } }[];
  vout: { value: number; scriptpubkey_address?: string }[];
}

export class MempoolOnChainProvider implements OnChainProvider {
  readonly name = 'mempool';
  private baseUrl = 'https://mempool.space/api';

  constructor(baseUrl = 'https://mempool.space/api') {
    this.baseUrl = baseUrl;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`Mempool ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getBalanceSats(address: string) {
    const data = await this.get<{
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
    }>(`/address/${address}`);
    return (
      data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum +
      data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum
    );
  }

  async getUtxos(address: string) {
    const [data, tipHeight] = await Promise.all([
      this.get<
        { txid: string; vout: number; value: number; status: { confirmed: boolean; block_height: number } }[]
      >(`/address/${address}/utxo`),
      this.get<number>('/blocks/tip/height'),
    ]);
    return data.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      valueSats: u.value,
      confirmations: u.status.confirmed ? Math.max(1, tipHeight - (u.status.block_height ?? 0)) : 0,
    }));
  }

  private async getBlocks() {
    const blocks = await this.get<number>('/blocks/tip/height');
    return blocks;
  }

  async getTransactions(address: string): Promise<OnChainTx[]> {
    const data = await this.get<MempoolTx[]>(`/address/${address}/txs`);
    return data.map((t) => {
      let value = 0;
      for (const v of t.vin) if (v.prevout?.scriptpubkey_address === address) value -= v.prevout.value;
      for (const v of t.vout) if (v.scriptpubkey_address === address) value += v.value;
      const direction: 'in' | 'out' = value >= 0 ? 'in' : 'out';
      return {
        txid: t.txid,
        direction,
        valueSats: Math.abs(value),
        confirmations: t.status.confirmed ? 1 : 0,
        blocktime: t.status.block_time ?? Math.floor(Date.now() / 1000),
      };
    });
  }

  async estimateFeeSatPerVb() {
    try {
      const fees = await this.get<{ economyFee: number }>('/v1/fees/recommended');
      return Math.max(1, fees.economyFee);
    } catch {
      return 5;
    }
  }

  async broadcast(rawTxHex: string) {
    const res = await fetch(`${this.baseUrl}/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawTxHex,
    });
    if (!res.ok) throw new Error(`Mempool broadcast -> ${res.status}`);
    return (await res.text()).trim();
  }
}

export class FallbackOnChainProvider implements OnChainProvider {
  readonly name: string;
  constructor(private live: OnChainProvider, private fallback: OnChainProvider) {
    this.name = `${live.name}+fallback:${fallback.name}`;
  }

  private async tryLive<T>(fn: (p: OnChainProvider) => Promise<T>, fb: () => Promise<T>): Promise<T> {
    try {
      return await fn(this.live);
    } catch (err) {
      console.warn(`[onchain] live provider ${this.live.name} failed, using ${this.fallback.name}:`, (err as Error).message);
      return fb();
    }
  }

  getBalanceSats(addr: string) {
    return this.tryLive((p) => p.getBalanceSats(addr), () => this.fallback.getBalanceSats(addr));
  }
  getUtxos(addr: string) {
    return this.tryLive((p) => p.getUtxos(addr), () => this.fallback.getUtxos(addr));
  }
  getTransactions(addr: string) {
    return this.tryLive((p) => p.getTransactions(addr), () => this.fallback.getTransactions(addr));
  }
  estimateFeeSatPerVb() {
    return this.tryLive((p) => p.estimateFeeSatPerVb(), () => this.fallback.estimateFeeSatPerVb());
  }
  broadcast(hex: string) {
    return this.tryLive((p) => p.broadcast(hex), () => this.fallback.broadcast(hex));
  }
  simulateDeposit(addr: string, amountSats: number): Promise<void> {
    if (!this.fallback.simulateDeposit) {
      return Promise.reject(new Error('Simulation requires the mock on-chain provider'));
    }
    return this.fallback.simulateDeposit(addr, amountSats);
  }
}

export function createOnChainProvider(): OnChainProvider {
  const mode = config.onchainProvider;
  const mock = new MockOnChainProvider();
  const live = new MempoolOnChainProvider();
  if (mode === 'mock') return mock;
  if (mode === 'mempool') return live;
  return new FallbackOnChainProvider(live, mock);
}
