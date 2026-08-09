export interface PricePoint {
  t: string;
  p: number;
}

export interface PriceQuote {
  btcPriceMxn: number;
  ask: number;
  bid: number;
  change24hPct: number;
  source: string;
  fetchedAt: string;
}

export interface PriceProvider {
  readonly name: string;
  getQuote(): Promise<PriceQuote>;
  getHistory(days: number): Promise<PricePoint[]>;
}

export interface InflationSnapshot {
  annualRatePct: number;
  asOf: string;
  source: string;
}

export interface InflationProvider {
  readonly name: string;
  getSnapshot(): Promise<InflationSnapshot>;
}

export interface TradeExecution {
  orderId: string;
  btcPriceMxn: number;
  feeBtc: number;
}

export interface ExchangeProvider {
  readonly name: string;
  buy(amountMxn: number, priceMxn: number): Promise<TradeExecution>;
  sell(amountBtc: number, priceMxn: number): Promise<TradeExecution>;
  getDepositInstructions(): Promise<{ clabe: string; institution: string }>;
}

export interface LightningInvoice {
  invoice: string;
  paymentHash: string;
  amountSats: number;
  memo: string;
  isPaid: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface LightningPayment {
  preimage: string;
  feeSats: number;
}

export interface LightningActivity {
  direction: 'in' | 'out';
  amountSats: number;
  memo: string;
  createdAt: string;
}

export interface LightningProvider {
  readonly name: string;
  getBalanceSats(): Promise<number>;
  createInvoice(amountSats: number, memo: string): Promise<LightningInvoice>;
  payInvoice(bolt11: string, amountSats?: number): Promise<LightningPayment>;
  getActivity(): Promise<LightningActivity[]>;
}

export interface MarketProduct {
  id: string;
  name: string;
  icon: string;
  cashbackPct: number;
}

export interface MarketOrder {
  id: string;
  status: 'pending' | 'complete';
  redemptionCode: string;
}

export interface MarketplaceProvider {
  readonly name: string;
  getProducts(): Promise<MarketProduct[]>;
  purchase(productId: string, amountFiat: number): Promise<MarketOrder>;
}

export interface LoanQuote {
  ltvPct: number;
  availableMxn: number;
  terms: string;
}

export interface LoanProvider {
  readonly name: string;
  quote(collateralBtc: number, priceMxn: number): Promise<LoanQuote>;
}
