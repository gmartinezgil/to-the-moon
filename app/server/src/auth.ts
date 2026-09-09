import { randomBytes, timingSafeEqual, scryptSync, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { nowIso } from './db';
import { config } from './config';

export const SESSION_COOKIE = 'ttm_session';
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const PASSWORD_PEPPER = process.env.AUTH_PEPPER ?? '';

export interface User {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

// ---- Password hashing -------------------------------------------------------

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

// Precomputed target so "user not found" takes the same time as a real verification.
const DUMMY_HASH = hashPassword('this-is-not-a-real-password');

function verifyDummy(): boolean {
  return verifyPassword('this-is-not-a-real-password', DUMMY_HASH);
}

// ---- Password policy --------------------------------------------------------

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '1234567890', 'qwerty123',
  'letmein', 'welcome1', 'iloveyou', 'monkey1', 'dragon123', 'abcdefgh',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message when the password does not meet policy, else null. */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < config.authMinPasswordLength) {
    return `password must be at least ${config.authMinPasswordLength} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'password is too common';
  if (!/[a-z]/.test(password)) return 'password must contain a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'password must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'password must contain a number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'password must contain a symbol';
  return null;
}

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// ---- Session management -----------------------------------------------------

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createUserToken(db: DatabaseSync, userId: number): string {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash(token), userId, nowIso(), new Date(Date.now() + config.authSessionTtlMs).toISOString());
  enforceSessionCap(db, userId);
  return token;
}

/** Keep the session table bounded: drop the oldest sessions beyond the per-user cap. */
export function enforceSessionCap(db: DatabaseSync, userId: number) {
  const stale = db.prepare(
    `SELECT id FROM sessions WHERE user_id = ?
       ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  ).all(userId, config.authMaxSessionsPerUser) as Array<{ id: number }>;
  for (const row of stale) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
  }
}

export function revokeAllSessions(db: DatabaseSync, userId: number) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function cleanupExpiredSessions(db: DatabaseSync) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
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

export function getUserFromRequest(db: DatabaseSync, input: {
  authHeader?: string | null;
  cookieValue?: string | null;
}): User | null {
  // Prefer the HttpOnly cookie (browser clients).
  if (input.cookieValue) {
    const user = authenticate(db, input.cookieValue);
    if (user) return user;
  }
  if (input.authHeader) {
    const [scheme, token] = input.authHeader.split(' ');
    if (scheme === 'Bearer' && token) return authenticate(db, token);
  }
  return null;
}

export function logout(db: DatabaseSync, authHeader: string | undefined, cookieValue?: string | undefined) {
  const [scheme, token] = (authHeader ?? '').split(' ');
  const raw = scheme === 'Bearer' && token ? token : cookieValue ?? '';
  if (raw) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(raw));
}

// ---- Registration -----------------------------------------------------------

export function registerUser(db: DatabaseSync, email: string, password: string, displayName: string):
  | { ok: true; user: User; token: string }
  | { ok: false; error: string } {
  const normalized = email.toLowerCase();
  if (!isValidEmail(normalized)) return { ok: false, error: 'enter a valid email address' };
  const policyError = validatePasswordPolicy(password);
  if (policyError) return { ok: false, error: policyError };

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (existing) return { ok: false, error: 'email is already registered' };

  const info = db.prepare(
    'INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)',
  ).run(normalized, hashPassword(password), displayName, nowIso());
  const id = Number(info.lastInsertRowid);
  const user: User = { id, email: normalized, display_name: displayName, created_at: nowIso() };
  return { ok: true, user, token: createUserToken(db, id) };
}

// ---- Login + lockout --------------------------------------------------------

export function isLockedOut(db: DatabaseSync, email: string, ip: string): number {
  const row = db.prepare(
    'SELECT locked_until FROM login_failures WHERE email = ? AND ip = ?',
  ).get(email.toLowerCase(), ip) as { locked_until: string | null } | undefined;
  if (!row?.locked_until) return 0;
  const until = new Date(row.locked_until).getTime();
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

function recordLoginFailure(db: DatabaseSync, email: string, ip: string) {
  const now = Date.now();
  const row = db.prepare(
    'SELECT count, window_start, locked_until FROM login_failures WHERE email = ? AND ip = ?',
  ).get(email.toLowerCase(), ip) as { count: number; window_start: string; locked_until: string | null } | undefined;

  const inWindow = row && now - new Date(row.window_start).getTime() < config.authFailureWindowMs;
  const count = inWindow ? row!.count + 1 : 1;
  const windowStart = inWindow ? row!.window_start : new Date(now).toISOString();
  const reachedLimit = count >= config.authMaxLoginAttempts;
  const lockedUntil = reachedLimit ? new Date(now + config.authLockoutMs).toISOString() : null;

  if (row) {
    db.prepare('UPDATE login_failures SET count = ?, window_start = ?, locked_until = ? WHERE email = ? AND ip = ?')
      .run(count, windowStart, lockedUntil, email.toLowerCase(), ip);
  } else {
    db.prepare('INSERT INTO login_failures (email, ip, count, window_start, locked_until) VALUES (?, ?, ?, ?, ?)')
      .run(email.toLowerCase(), ip, count, windowStart, lockedUntil);
  }
}

function clearLoginFailures(db: DatabaseSync, email: string, ip: string) {
  db.prepare('DELETE FROM login_failures WHERE email = ? AND ip = ?').run(email.toLowerCase(), ip);
}

export function loginUser(db: DatabaseSync, email: string, password: string, ip: string):
  | { ok: true; user: User; token: string }
  | { ok: false; error: string; statusCode: number; retryAfterMs?: number } {
  const normalized = email.toLowerCase();
  const lockedRemaining = isLockedOut(db, normalized, ip);
  if (lockedRemaining > 0) {
    return { ok: false, error: 'too many failed attempts — try again later', statusCode: 429, retryAfterMs: lockedRemaining };
  }

  const row = db.prepare(
    'SELECT id, email, password_hash, display_name, created_at FROM users WHERE email = ?',
  ).get(normalized) as User & { password_hash: string } | undefined;

  // Uniform timing whether or not the account exists.
  const passwordOk = row ? verifyPassword(password, row.password_hash) : (verifyDummy(), false);
  const user = row && passwordOk ? {
    id: row.id, email: row.email, display_name: row.display_name, created_at: row.created_at,
  } as User : undefined;

  if (!user) {
    recordLoginFailure(db, normalized, ip);
    const locked = isLockedOut(db, normalized, ip);
    if (locked > 0) {
      return { ok: false, error: 'too many failed attempts — try again later', statusCode: 429, retryAfterMs: locked };
    }
    return { ok: false, error: 'invalid email or password', statusCode: 400 };
  }

  clearLoginFailures(db, normalized, ip);
  return { ok: true, user, token: createUserToken(db, user.id) };
}

// ---- Password reset ---------------------------------------------------------

export function issuePasswordReset(db: DatabaseSync, email: string): { issued: boolean; token?: string } {
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as { id: number } | undefined;
  if (!user) return { issued: false }; // Never reveal whether the address is registered.
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .run(user.id, tokenHash(token), new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString());
  return { issued: true, token };
}

export function resetPasswordWithToken(db: DatabaseSync, token: string, newPassword: string):
  | { ok: true }
  | { ok: false; error: string } {
  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) return { ok: false, error: policyError };

  const row = db.prepare(
    'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?',
  ).get(tokenHash(token)) as { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'reset token is invalid or has expired' };
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), row.user_id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  revokeAllSessions(db, row.user_id);
  return { ok: true };
}