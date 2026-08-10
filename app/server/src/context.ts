import { getDb } from './db';
import { HdWallet } from './onchain/wallet';
import { createPriceProvider } from './providers/price';
import { createInflationProvider } from './providers/inflation';
import { createExchangeProvider } from './providers/exchange';
import { createLightningProvider } from './providers/lightning';
import { createMarketplaceProvider } from './providers/market';
import { createLoanProvider } from './providers/loan';
import { createOnChainProvider } from './providers/onchain';

export function createContext() {
  const db = getDb();
  return {
    db,
    wallet: new HdWallet(db),
    price: createPriceProvider(),
    inflation: createInflationProvider(),
    exchange: createExchangeProvider(),
    lightning: createLightningProvider(),
    market: createMarketplaceProvider(),
    loan: createLoanProvider(),
    onchain: createOnChainProvider(),
  };
}

export type AppContext = ReturnType<typeof createContext>;
