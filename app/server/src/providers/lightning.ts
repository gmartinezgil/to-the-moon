import { config } from '../config';
import type { LightningActivity, LightningInvoice, LightningPayment, LightningProvider } from './types';

interface MockInvoice extends LightningInvoice {
  paid: boolean;
}

export class MockLightningProvider implements LightningProvider {
  readonly name = 'mock';
  private balanceSats = 125000;
  private invoices = new Map<string, MockInvoice>();
  private activity: LightningActivity[] = [
    { direction: 'in', amountSats: 50000, memo: 'Received via LN', createdAt: new Date(Date.now() - 86_400_000).toISOString() },
    { direction: 'out', amountSats: 12500, memo: 'Starbucks', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  ];

  async getBalanceSats() {
    return this.balanceSats;
  }

  async createInvoice(amountSats: number, memo: string): Promise<LightningInvoice> {
    const paymentHash = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const inv: MockInvoice = {
      invoice: `lnbc${Math.round(amountSats / 1000)}1p${paymentHash.slice(0, 8)}... (simulated LN invoice)`,
      paymentHash,
      amountSats,
      memo,
      paid: false,
      isPaid: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    this.invoices.set(paymentHash, inv);
    setTimeout(() => {
      inv.paid = true;
      inv.isPaid = true;
      this.balanceSats += inv.amountSats;
      this.activity = [{ direction: 'in', amountSats: inv.amountSats, memo: inv.memo || 'Received via LN', createdAt: new Date().toISOString() }, ...this.activity];
    }, 8000);
    return inv;
  }

  async payInvoice(bolt11: string, amountSats?: number): Promise<LightningPayment> {
    if (amountSats && amountSats > this.balanceSats) {
      throw new Error('Insufficient Lightning balance');
    }
    const sats = amountSats ?? 1000;
    this.balanceSats -= sats;
    this.activity = [{ direction: 'out', amountSats: sats, memo: bolt11.slice(0, 24), createdAt: new Date().toISOString() }, ...this.activity];
    return { preimage: '0'.repeat(64), feeSats: Math.max(1, Math.round(sats * 0.003)) };
  }

  async getActivity() {
    return this.activity;
  }

  async getInvoiceStatus(paymentHash: string) {
    return this.invoices.get(paymentHash)?.isPaid ?? false;
  }

  async markPaid(paymentHash: string) {
    const inv = this.invoices.get(paymentHash);
    if (!inv || inv.paid) return;
    inv.paid = true;
    inv.isPaid = true;
    this.balanceSats += inv.amountSats;
    this.activity = [{ direction: 'in', amountSats: inv.amountSats, memo: inv.memo || 'Received via LN', createdAt: new Date().toISOString() }, ...this.activity];
  }
}

export class LnbitsProvider implements LightningProvider {
  readonly name = 'lnbits';

  constructor(private host: string, private apiKey: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.host}${path}`, {
      ...init,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`LNBits ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getBalanceSats() {
    const res = await this.call<{ balance: number }>('/api/v1/wallet');
    return Math.floor(res.balance / 1000); // msats -> sats
  }

  async createInvoice(amountSats: number, memo: string): Promise<LightningInvoice> {
    const res = await this.call<{ payment_request: string; payment_hash: string; expiry: number }>(
      '/api/v1/payments',
      { method: 'POST', body: JSON.stringify({ out: false, amount: amountSats, memo, unit: 'sat' }) },
    );
    const createdAt = new Date();
    return {
      invoice: res.payment_request,
      paymentHash: res.payment_hash,
      amountSats,
      memo,
      isPaid: false,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + (res.expiry ?? 900) * 1000).toISOString(),
    };
  }

  async getInvoiceStatus(paymentHash: string) {
    const res = await this.call<{ paid: boolean }>(`/api/v1/payments/${paymentHash}`);
    return !!res.paid;
  }

  async markPaid() {
    // LNBits settles invoices and updates wallet balance itself; the webhook
    // scaffold exists so callers can trigger follow-ups (ledger, notifications).
  }

  async payInvoice(bolt11: string, amountSats?: number): Promise<LightningPayment> {
    const res = await this.call<{ payment_hash: string; preimage: string; fee: number }>('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({ out: true, bolt11, ...(amountSats ? { amount: amountSats, unit: 'sat' } : {}) }),
    });
    return { preimage: res.preimage, feeSats: Math.floor((res.fee ?? 0) / 1000) };
  }

  async getActivity() {
    const res = await this.call<{ payment_hash: string; memo: string; amount: number; fee: number; created_at: number }[]>(
      '/api/v1/payments?limit=50',
    );
    return res.map((t) => ({
      direction: (t.amount ?? 0) >= 0 ? 'in' : 'out',
      amountSats: Math.floor(Math.abs(t.amount ?? 0) / 1000),
      memo: t.memo ?? '',
      createdAt: new Date((t.created_at ?? 0) * 1000).toISOString(),
    })) as LightningActivity[];
  }
}

export function createLightningProvider(): LightningProvider {
  if (config.lnHost && config.lnApiKey) return new LnbitsProvider(config.lnHost, config.lnApiKey);
  return new MockLightningProvider();
}
