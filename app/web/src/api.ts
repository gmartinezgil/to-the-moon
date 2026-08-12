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

export interface Balances {
  fiatMxn: number;
  btc: number;
  sats: number;
  onchainSats: number;
  totalMxn: number;
}

export interface Transaction {
  id: number;
  kind: string;
  amount_fiat: number;
  amount_btc: number;
  amount_sats: number;
  meta: string;
  created_at: string;
}

export interface WalletData {
  balances: Balances;
  transactions: Transaction[];
  quote: PriceQuote;
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

export interface LightningActivity {
  direction: 'in' | 'out';
  amountSats: number;
  memo: string;
  createdAt: string;
}

export interface LightningData {
  balanceSats: number;
  fiatEquivalentMxn: number;
  activity: LightningActivity[];
  btcPriceMxn: number;
}

export type LedgerSource = 'lightning' | 'exchange' | 'onchain' | 'market';

export interface LedgerItem {
  id: string;
  source: LedgerSource;
  direction: 'in' | 'out';
  amountSats?: number;
  amountBtc?: number;
  amountFiat?: number;
  memo: string;
  createdAt: string;
}

export interface InflationData {
  annualRatePct: number;
  asOf: string;
  source: string;
  btcPriceMxn: number;
  btcChange24hPct: number;
}

export interface RetirementEstimate {
  fireGoalMxn: number;
  targetBtc: number;
  currentBtc: number;
  progressPct: number;
  yearsToExit: number;
  status: 'ACCUMULATING' | 'FINANCIALLY FREE';
  btcPriceMxn: number;
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

export interface LoanQuote {
  ltvPct: number;
  availableMxn: number;
  terms: string;
}

export interface OnChainData {
  address: string;
  addressIndex: number;
  outputScript: string;
  balanceSats: number;
  provider: string;
  syncedAt: string;
  btcPriceMxn: number;
  fiatValueMxn: number;
}

export type DcaFrequency = 'daily' | 'weekly' | 'monthly';

export interface DcaSchedule {
  id: number;
  amount_fiat: number;
  frequency: DcaFrequency;
  enabled: number;
  last_run_at: string | null;
  created_at: string;
}

export interface TaxSummary {
  buys: { count: number; btc: number; investedMxn: number };
  sells: { count: number; btc: number; proceedsMxn: number };
  avgCostMxn: number;
  realizedGainMxn: number;
  trades: { id: number; kind: 'buy' | 'sell'; amountBtc: number; amountFiat: number; priceMxn: number; createdAt: string }[];
}

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

export interface DcaGrowthPoint {
  t: string;
  investedMxn: number;
  valueMxn: number;
}

export interface DcaGrowth {
  buys: number;
  investedMxn: number;
  stackedBtc: number;
  valueMxn: number;
  growthMxn: number;
  growthPct: number;
  points: DcaGrowthPoint[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),
  ledger: () => request<{ items: LedgerItem[] }>('/ledger'),
  price: () => request<{ quote: PriceQuote; history: PricePoint[] }>('/price'),
  wallet: () => request<WalletData>('/wallet'),
  addFiat: (amountMxn: number) => request<{ ok: boolean }>('/wallet/add', { method: 'POST', body: JSON.stringify({ amountMxn }) }),
  buy: (amountMxn: number) => request<{ ok: boolean; btc: number; price: number }>('/wallet/buy', { method: 'POST', body: JSON.stringify({ amountMxn }) }),
  sell: (amountBtc: number) => request<{ ok: boolean; fiat: number; price: number }>('/wallet/sell', { method: 'POST', body: JSON.stringify({ amountBtc }) }),
  deposit: () => request<{ clabe: string; institution: string }>('/wallet/deposit'),
  onchain: () => request<OnChainData>('/wallet/onchain'),
  simulateOnchainDeposit: (amountSats: number) =>
    request<{ ok: boolean; state: OnChainData }>('/onchain/simulate-deposit', { method: 'POST', body: JSON.stringify({ amountSats }) }),
  sendOnchain: (to: string, amountSats: number) =>
    request<{ ok: boolean; txid: string; feeSats: number }>('/onchain/send', { method: 'POST', body: JSON.stringify({ to, amountSats }) }),
  lightning: () => request<LightningData>('/lightning'),
  createInvoice: (amountSats: number, memo: string) =>
    request<{ ok: boolean; invoice: LightningInvoice }>('/lightning/invoices', { method: 'POST', body: JSON.stringify({ amountSats, memo }) }),
  invoiceStatus: (paymentHash: string) => request<{ ok: boolean; isPaid: boolean }>(`/lightning/invoices/${paymentHash}`),
  payInvoice: (bolt11: string, amountSats?: number) =>
    request<{ ok: boolean; preimage: string; feeSats: number }>('/lightning/pay', { method: 'POST', body: JSON.stringify({ bolt11, amountSats }) }),
  inflation: () => request<InflationData>('/inflation'),
  retirement: (monthlyExpMxn: number, extraBtc: number) =>
    request<{ ok: boolean; estimate: RetirementEstimate }>('/retirement/estimate', { method: 'POST', body: JSON.stringify({ monthlyExpMxn, extraBtc }) }),
  marketProducts: () => request<{ products: MarketProduct[] }>('/market/products'),
  marketPurchase: (productId: string, amountFiat: number) =>
    request<{ ok: boolean; order: MarketOrder }>('/market/purchase', { method: 'POST', body: JSON.stringify({ productId, amountFiat }) }),
  loanQuote: (collateralBtc: number) => request<{ ok: boolean; loan: LoanQuote; btcPriceMxn: number }>(`/loan/quote?collateralBtc=${collateralBtc}`),
  dca: () => request<{ schedules: DcaSchedule[] }>('/dca'),
  createDca: (amountFiat: number, frequency?: DcaFrequency) =>
    request<{ schedules: DcaSchedule[] }>('/dca', { method: 'POST', body: JSON.stringify({ amountFiat, frequency }) }),
  deleteDca: (id: number) => request<{ ok: boolean }>(`/dca/${id}`, { method: 'DELETE' }),
  dcaGrowth: () => request<{ growth: DcaGrowth; btcPriceMxn: number }>('/dca/growth'),
  taxes: () => request<TaxSummary>('/taxes'),
  security: () => request<SecurityReport>('/security'),
};
