import { randomBytes, timingSafeEqual, scryptSync, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from './db';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_PEPPER = process.env.AUTH_PEPPER ?? '';

export interface User {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(`${PASSWORD_PEPPER}${password}`, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(`${PASSWORD_PEPPER}${password}`, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createUserToken(db: DatabaseSync, userId: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, nowIso(), new Date(Date.now() + SESSION_TTL_MS).toISOString());
  return token;
}

export function authenticate(db: DatabaseSync, token: string | undefined): User | null {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.id, u.email, u.display_name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(tokenHash(token), nowIso()) as User | undefined;
  return row ?? null;
}

export function getSessionUser(db: DatabaseSync, authHeader: string | undefined): User | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return authenticate(db, token);
}

export function logout(db: DatabaseSync, authHeader: string | undefined) {
  const [scheme, token] = (authHeader ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}
