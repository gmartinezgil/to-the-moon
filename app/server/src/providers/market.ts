import { config } from '../config';
import type { MarketOrder, MarketplaceProvider, MarketProduct } from './types';

export class MockMarketplaceProvider implements MarketplaceProvider {
  readonly name = 'mock';
  private products: MarketProduct[] = [
    { id: 'amazon', name: 'Amazon', icon: 'cart-shopping', cashbackPct: 10 },
    { id: 'uber', name: 'Uber', icon: 'car', cashbackPct: 10 },
    { id: 'netflix', name: 'Netflix', icon: 'film', cashbackPct: 10 },
    { id: 'steam', name: 'Steam', icon: 'gamepad', cashbackPct: 10 },
    { id: 'spotify', name: 'Spotify', icon: 'music', cashbackPct: 10 },
    { id: 'starbucks', name: 'Starbucks', icon: 'mug-hot', cashbackPct: 10 },
  ];

  async getProducts() {
    return this.products;
  }

  async purchase(productId: string, amountFiat: number): Promise<MarketOrder> {
    const product = this.products.find((p) => p.id === productId);
    if (!product) throw new Error('Unknown product');
    return {
      id: `bfill-${Date.now()}`,
      status: 'complete',
      redemptionCode: `MOCK-${product.name.toUpperCase()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    };
  }
}

export class BitrefillMarketplaceProvider implements MarketplaceProvider {
  readonly name = 'bitrefill';
  private baseUrl = 'https://api.bitrefill.com/v2';

  constructor(private apiKey: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Bitrefill ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  async getProducts() {
    const res = await this.call<{ data: { id: string; name: string }[] }>('/products?country=MX&type=gift_card');
    return res.data.slice(0, 12).map((p) => ({ id: p.id, name: p.name, icon: 'gift', cashbackPct: 10 }));
  }

  async purchase(productId: string, amountFiat: number): Promise<MarketOrder> {
    const res = await this.call<{ data: { id: string; status: string; orders: { id: string }[] } }>('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        products: [{ product_id: productId, value: amountFiat, quantity: 1 }],
        payment_method: 'balance',
        auto_pay: true,
      }),
    });
    const orderId = res.data.orders?.[0]?.id;
    const order = await this.call<{ data: { status: string; redemption_info?: { code: string } } }>(`/orders/${orderId}`);
    return {
      id: res.data.id,
      status: order.data.status === 'complete' ? 'complete' : 'pending',
      redemptionCode: order.data.redemption_info?.code ?? '',
    };
  }
}

export function createMarketplaceProvider(): MarketplaceProvider {
  if (config.bitrefillApiKey) return new BitrefillMarketplaceProvider(config.bitrefillApiKey);
  return new MockMarketplaceProvider();
}
