import type { PricePoint, PriceProvider, PriceQuote } from './types';

export class MockPriceProvider implements PriceProvider {
  readonly name = 'mock';
  private base: number;

  constructor(seedPrice: number) {
    this.base = seedPrice;
  }

  async getQuote(): Promise<PriceQuote> {
    return {
      btcPriceMxn: this.base,
      ask: this.base * 1.0005,
      bid: this.base * 0.9995,
      change24hPct: 2.4,
      source: 'mock',
      fetchedAt: new Date().toISOString(),
    };
  }

  async getHistory(days: number): Promise<PricePoint[]> {
    const points: PricePoint[] = [];
    const now = Date.now();
    let p = this.base * 0.82;
    for (let i = days; i >= 0; i--) {
      p *= 1 + (Math.sin(i / 3) * 0.008 + (Math.random() - 0.5) * 0.012);
      points.push({ t: new Date(now - i * 86_400_000).toISOString(), p });
    }
    return points;
  }
}

export class BitsoPriceProvider implements PriceProvider {
  readonly name = 'bitso';
  private baseUrl = 'https://api.bitso.com/v3';

  async getQuote(): Promise<PriceQuote> {
    const res = await fetch(`${this.baseUrl}/ticker?book=btc_mxn`);
    if (!res.ok) throw new Error(`Bitso ticker ${res.status}`);
    const { payload } = (await res.json()) as {
      payload: { last: string; ask: string; bid: string; change_24: string };
    };
    const last = Number(payload.last);
    const prev = last - Number(payload.change_24);
    return {
      btcPriceMxn: last,
      ask: Number(payload.ask),
      bid: Number(payload.bid),
      change24hPct: prev === 0 ? 0 : (last / prev - 1) * 100,
      source: 'bitso',
      fetchedAt: new Date().toISOString(),
    };
  }

  async getHistory(days: number): Promise<PricePoint[]> {
    const trades = await fetch(`${this.baseUrl}/trades?book=btc_mxn&limit=100`);
    if (!trades.ok) throw new Error(`Bitso trades ${trades.status}`);
    const { payload } = (await trades.json()) as {
      payload: { price: string; created_at: string }[];
    };
    const points = payload
      .filter((t) => t.price !== null)
      .map((t) => ({ t: new Date(t.created_at).toISOString(), p: Number(t.price) }));
    const sampled = points.filter((_, i) => i % Math.ceil(points.length / 30) === 0);
    if (sampled.length >= 2) return sampled;
    return points;
  }
}

export class CoinGeckoPriceProvider implements PriceProvider {
  readonly name = 'coingecko';
  private baseUrl = 'https://api.coingecko.com/api/v3';

  async getQuote(): Promise<PriceQuote> {
    const res = await fetch(
      `${this.baseUrl}/simple/price?ids=bitcoin&vs_currencies=mxn&include_24hr_change=true`,
    );
    if (!res.ok) throw new Error(`CoinGecko simple/price ${res.status}`);
    const data = (await res.json()) as { bitcoin: { mxn: number; mxn_24h_change?: number } };
    return {
      btcPriceMxn: data.bitcoin.mxn,
      ask: data.bitcoin.mxn,
      bid: data.bitcoin.mxn,
      change24hPct: data.bitcoin.mxn_24h_change ?? 0,
      source: 'coingecko',
      fetchedAt: new Date().toISOString(),
    };
  }

  async getHistory(days: number): Promise<PricePoint[]> {
    const res = await fetch(
      `${this.baseUrl}/coins/bitcoin/market_chart?vs_currency=mxn&days=${days}&interval=daily`,
    );
    if (!res.ok) throw new Error(`CoinGecko market_chart ${res.status}`);
    const data = (await res.json()) as { prices: [number, number][] };
    return data.prices.map(([ts, p]) => ({ t: new Date(ts).toISOString(), p }));
  }
}

class FallbackPriceProvider implements PriceProvider {
  readonly name: string;
  private live: PriceProvider;
  private fallback: PriceProvider;

  constructor(live: PriceProvider, fallback: PriceProvider) {
    this.live = live;
    this.fallback = fallback;
    this.name = `${live.name}+fallback:${fallback.name}`;
  }

  private async tryLive<T>(fn: (p: PriceProvider) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await fn(this.live);
    } catch (err) {
      console.warn(`[price] live provider ${this.live.name} failed, using ${this.fallback.name}:`, (err as Error).message);
      return fallback();
    }
  }

  getQuote() {
    return this.tryLive((p) => p.getQuote(), () => this.fallback.getQuote());
  }

  getHistory(days: number) {
    return this.tryLive((p) => p.getHistory(days), () => this.fallback.getHistory(days));
  }
}

export function createPriceProvider(): PriceProvider {
  const mode = process.env.PRICE_PROVIDER ?? 'auto';
  const mock = new MockPriceProvider(Number(process.env.MOCK_SEED_PRICE ?? 1325400));
  if (mode === 'mock') return mock;
  if (mode === 'bitso') return new BitsoPriceProvider();
  if (mode === 'coingecko') return new CoinGeckoPriceProvider();
  return new FallbackPriceProvider(new BitsoPriceProvider(), mock);
}
