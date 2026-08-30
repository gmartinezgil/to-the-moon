import { createContext, type AppContext } from '../src/context';
import { resetDb } from '../src/db';

export type TestContext = AppContext;

/** Fresh context with in-memory DB + all-mock providers. */
export function makeContext(): TestContext {
  resetDb();
  return createContext();
}
