import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  db = openDb(config.dbPath);
  return db;
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const instance = new DatabaseSync(path);
  if (path !== ':memory:') instance.exec('PRAGMA journal_mode = WAL;');
  migrate(instance);
  return instance;
}

/** Test-only: drop the cached singleton so a fresh DB is created on next getDb(). */
export function resetDb() {
  db = null;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS balances (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      fiat_mxn REAL NOT NULL DEFAULT 0,
      btc REAL NOT NULL DEFAULT 0,
      sats INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      amount_fiat REAL NOT NULL DEFAULT 0,
      amount_btc REAL NOT NULL DEFAULT 0,
      amount_sats INTEGER NOT NULL DEFAULT 0,
      meta TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dca_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_fiat REAL NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      amount_fiat REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      redemption_code TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_keys (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mnemonic TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      address TEXT NOT NULL DEFAULT '',
      address_index INTEGER NOT NULL DEFAULT 0,
      balance_sats INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '{}',
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      token_hash TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL DEFAULT '',
      auth TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  // Migration for DBs created before idempotency_keys gained a `response` column.
  try {
    db.exec("ALTER TABLE idempotency_keys ADD COLUMN response TEXT NOT NULL DEFAULT '{}'");
  } catch {
    // Column already exists.
  }
  seed(db);
}

function seed(db: DatabaseSync) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM balances').get() as { n: number };
  if (row.n === 0) {
    db.prepare('INSERT INTO balances (id, fiat_mxn, btc, sats) VALUES (1, ?, ?, ?)').run(
      25000, 0.015, 125000,
    );
  }
  const state = db.prepare('SELECT COUNT(*) AS n FROM wallet_state').get() as { n: number };
  if (state.n === 0) {
    db.prepare('INSERT INTO wallet_state (id, address, address_index, balance_sats) VALUES (1, ?, 0, 0)')
      .run('');
  }
}

export function nowIso() {
  return new Date().toISOString();
}
