import { config } from '../config';
import type { ExchangeProvider, TradeExecution } from './types';

export class MockExchangeProvider implements ExchangeProvider {
  readonly name = 'mock';

  async buy(amountMxn: number, priceMxn: number): Promise<TradeExecution> {
    return { orderId: `mock-buy-${Date.now()}`, btcPriceMxn: priceMxn, feeBtc: 0 };
  }

  async sell(amountBtc: number, priceMxn: number): Promise<TradeExecution> {
    return { orderId: `mock-sell-${Date.now()}`, btcPriceMxn: priceMxn, feeBtc: 0 };
  }

  async getDepositInstructions() {
    return { clabe: '646 180 1234567890 1', institution: 'Aureo Bitcoin (mock)' };
  }
}

export class BitsoExchangeProvider implements ExchangeProvider {
  readonly name = 'bitso';

  constructor(private apiKey: string, private apiSecret: string) {}

  private async signed(path: string, body?: unknown): Promise<unknown> {
    const method = body ? 'POST' : 'GET';
    const { createHmac } = await import('node:crypto');
    const nonce = Date.now();
    const msg = `${nonce}${method}${path}${body ? JSON.stringify(body) : ''}`;
    const signature = createHmac('sha256', this.apiSecret).update(msg).digest('hex');
    const res = await fetch(`https://api.bitso.com/v3${path}`, {
      method,
      headers: {
        Authorization: `Bitso ${this.apiKey}:${nonce}:${signature}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Bitso private ${path} -> ${res.status}`);
    return res.json();
  }

  async buy(amountMxn: number, priceMxn: number): Promise<TradeExecution> {
    const btc = amountMxn / priceMxn;
    const res = await this.signed('/orders', {
      book: 'btc_mxn',
      side: 'buy',
      type: 'market',
      major: String(btc),
    }) as { payload?: { oid: string; major?: string } };
    if (!res.payload) throw new Error('Bitso buy failed');
    return { orderId: res.payload.oid, btcPriceMxn: priceMxn, feeBtc: 0 };
  }

  async sell(amountBtc: number, priceMxn: number): Promise<TradeExecution> {
    const res = await this.signed('/orders', {
      book: 'btc_mxn',
      side: 'sell',
      type: 'market',
      major: String(amountBtc),
    }) as { payload?: { oid: string; major?: string } };
    if (!res.payload) throw new Error('Bitso sell failed');
    return { orderId: res.payload.oid, btcPriceMxn: priceMxn, feeBtc: 0 };
  }

  async getDepositInstructions() {
    return { clabe: 'SPEI via Bitso (requires funding to Bitso account)', institution: 'Bitso' };
  }
}

export function createExchangeProvider(): ExchangeProvider {
  if (config.bitsoApiKey && config.bitsoApiSecret) {
    return new BitsoExchangeProvider(config.bitsoApiKey, config.bitsoApiSecret);
  }
  return new MockExchangeProvider();
}
