import { beforeEach, afterEach } from 'vitest';
import { createContext, type AppContext } from '../src/context';
import { resetDb } from '../src/db';

/**
 * Builds a fresh AppContext with an in-memory SQLite DB and all-mock providers.
 * Call within `beforeEach` so each test starts from a clean, deterministic state.
 */
export function makeContext(): AppContext {
  resetDb();
  const ctx = createContext();
  resetDb();
  return ctx;
}

export function setupContextCleanup() {
  beforeEach(() => {
    resetDb();
  });
  afterEach(() => {
    resetDb();
  });
}
