import { getDb } from './db';
import { createPriceProvider } from './providers/price';
import { createInflationProvider } from './providers/inflation';
import { createExchangeProvider } from './providers/exchange';
import { createLightningProvider } from './providers/lightning';
import { createMarketplaceProvider } from './providers/market';
import { createLoanProvider } from './providers/loan';

export function createContext() {
  return {
    db: getDb(),
    price: createPriceProvider(),
    inflation: createInflationProvider(),
    exchange: createExchangeProvider(),
    lightning: createLightningProvider(),
    market: createMarketplaceProvider(),
    loan: createLoanProvider(),
  };
}

export type AppContext = ReturnType<typeof createContext>;
