import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
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
  `);
  seed(db);
}

function seed(db: DatabaseSync) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM balances').get() as { n: number };
  if (row.n === 0) {
    db.prepare('INSERT INTO balances (id, fiat_mxn, btc, sats) VALUES (1, ?, ?, ?)').run(
      25000, 0.015, 125000,
    );
  }
}

export function nowIso() {
  return new Date().toISOString();
}
