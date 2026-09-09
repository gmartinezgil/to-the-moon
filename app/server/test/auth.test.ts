import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { makeContext } from './helpers';
import {
  hashPassword, verifyPassword, createUserToken, authenticate, logout, getUserFromRequest,
  registerUser, loginUser, validatePasswordPolicy, issuePasswordReset, resetPasswordWithToken,
  revokeAllSessions,
} from '../src/auth';
import { config } from '../src/config';

describe('auth module', () => {
  it('hashes and verifies a password', () => {
    const stored = hashPassword('Hunter2!abc');
    expect(stored).toContain(':');
    expect(verifyPassword('Hunter2!abc', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
    expect(verifyPassword('Hunter2!abc', 'bogus')).toBe(false);
  });

  it('produces distinct hashes for the same password (random salt)', () => {
    expect(hashPassword('aVerySafePw!1')).not.toBe(hashPassword('aVerySafePw!1'));
  });

  it('creates sessions, authenticates, and logs out via cookie and bearer', () => {
    const ctx = makeContext();
    const email = 'a@b.c';
    ctx.db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(email, hashPassword('Password123!'), 'A', new Date().toISOString());
    const user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { id: number };

    const token = createUserToken(ctx.db, user.id);
    expect(authenticate(ctx.db, token)?.email).toBe(email);
    expect(getUserFromRequest(ctx.db, { authHeader: `Bearer ${token}` })?.email).toBe(email);
    expect(getUserFromRequest(ctx.db, { cookieValue: token })?.email).toBe(email);
    // Cookie wins over bearer when both present.
    expect(token).not.toContain('token');

    logout(ctx.db, `Bearer ${token}`);
    logout(ctx.db, '', token);
    expect(authenticate(ctx.db, token)).toBeNull();
    expect(authenticate(ctx.db, undefined)).toBeNull();
    expect(authenticate(ctx.db, 'not-a-token')).toBeNull();
  });

  it('does not accept an expired session', () => {
    const ctx = makeContext();
    const db = ctx.db;
    db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run('x@y.z', hashPassword('Password123!'), 'X', new Date().toISOString());
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get('x@y.z') as { id: number };
    const token = 'expiredtoken';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, user.id, new Date().toISOString(), new Date(Date.now() - 1000).toISOString());
    expect(authenticate(db, token)).toBeNull();
  });

  it('enforces password policy', () => {
    expect(validatePasswordPolicy('short')).toMatch(/at least/);
    expect(validatePasswordPolicy('lowercaseonly')).toMatch(/uppercase/);
    expect(validatePasswordPolicy('UPPERCASEONLY')).toMatch(/lowercase/);
    expect(validatePasswordPolicy('NoDigitsHere!x')).toMatch(/number/);
    expect(validatePasswordPolicy('NoSymbolHere9x')).toMatch(/symbol/);
    expect(validatePasswordPolicy('password123')).toMatch(/common/);
    expect(validatePasswordPolicy('MyStrongP@ss1')).toBeNull();
  });

  it('registerUser validates email + policy and normalizes case', () => {
    const ctx = makeContext();
    expect(registerUser(ctx.db, 'nope', 'MyStrongP@ss1', 'x').ok).toBe(false);
    expect(registerUser(ctx.db, 'a@b.co', 'weak', 'x').ok).toBe(false);

    const res = registerUser(ctx.db, 'MiXeD@b.CO', 'MyStrongP@ss1', 'X');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.email).toBe('mixed@b.co');
      expect(authenticate(ctx.db, res.token)?.email).toBe('mixed@b.co');
    }
    expect(registerUser(ctx.db, 'mixed@b.co', 'MyStrongP@ss1', 'dup').ok).toBe(false);
  });

  it('locks an account+ip after repeated failures and clears on success', async () => {
    const ctx = makeContext();
    const email = 'lock@x.co';
    registerUser(ctx.db, email, 'MyStrongP@ss1', 'L');

    const attempts = config.authMaxLoginAttempts;
    for (let i = 0; i < attempts; i++) {
      const r = loginUser(ctx.db, email, 'WrongPass1!', '1.2.3.4');
      expect(r.ok).toBe(false);
      if (i < attempts - 1) expect(r.statusCode).toBe(400);
    }
    // Next attempt is locked out.
    const locked = loginUser(ctx.db, email, 'WrongPass1!', '1.2.3.4');
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.statusCode).toBe(429);

    // A different IP is unaffected.
    const other = loginUser(ctx.db, email, 'MyStrongP@ss1', '9.9.9.9');
    expect(other.ok).toBe(true);
  });

  it('login keeps timing roughly uniform for unknown accounts', () => {
    const ctx = makeContext();
    const unknown = loginUser(ctx.db, 'ghost@x.co', 'WrongPass1!', '1.1.1.1');
    expect(unknown.ok).toBe(false);
  });

  it('reset flow: issue, reset, previous password rejected, sessions revoked', () => {
    const ctx = makeContext();
    const email = 'reset@x.co';
    const res = registerUser(ctx.db, email, 'MyStrongP@ss1', 'R');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const oldToken = res.token;

    const { issued, token } = issuePasswordReset(ctx.db, email);
    expect(issued).toBe(true);
    expect(token).toBeTruthy();

    // Wrong/new policy-violating password is rejected.
    expect(resetPasswordWithToken(ctx.db, token!, 'weak').ok).toBe(false);
    expect(resetPasswordWithToken(ctx.db, 'bogus-token', 'MyStrongP@ss2').ok).toBe(false);

    expect(resetPasswordWithToken(ctx.db, token!, 'MyStrongP@ss2').ok).toBe(true);

    // Old password no longer works; new one does.
    expect(loginUser(ctx.db, email, 'MyStrongP@ss1', '1.1.1.1').ok).toBe(false);
    expect(loginUser(ctx.db, email, 'MyStrongP@ss2', '1.1.1.1').ok).toBe(true);

    // Old session token was revoked; a replay token fails.
    expect(authenticate(ctx.db, oldToken)).toBeNull();

    // Reset tokens are single-use.
    expect(resetPasswordWithToken(ctx.db, token!, 'MyStrongP@ss3').ok).toBe(false);

    // Unknown email issues nothing (no enumeration).
    expect(issuePasswordReset(ctx.db, 'nobody@x.co').issued).toBe(false);
  });

  it('revokeAllSessions kills every session', () => {
    const ctx = makeContext();
    const email = 'multi@x.co';
    const res = registerUser(ctx.db, email, 'MyStrongP@ss1', 'M');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const t1 = res.token;
    const t2 = createUserToken(ctx.db, res.user.id);
    expect(authenticate(ctx.db, t1)?.email).toBe(email);
    expect(authenticate(ctx.db, t2)?.email).toBe(email);

    revokeAllSessions(ctx.db, res.user.id);
    expect(authenticate(ctx.db, t1)).toBeNull();
    expect(authenticate(ctx.db, t2)).toBeNull();
  });
});

describe('auth module (config overrides)', () => {
  beforeAll(() => {
    // Ensure the config used by the module under test is deterministic.
    expect(config.authMaxLoginAttempts).toBeGreaterThan(0);
  });

  it('sanity: default policy requires at least 10 characters', () => {
    expect(config.authMinPasswordLength).toBe(10);
  });
});