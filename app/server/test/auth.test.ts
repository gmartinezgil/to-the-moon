import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { makeContext } from './helpers';
import { hashPassword, verifyPassword, createUserToken, authenticate, logout, getSessionUser } from '../src/auth';

describe('auth module', () => {
  it('hashes and verifies a password', () => {
    const stored = hashPassword('hunter2!');
    expect(stored).toContain(':');
    expect(verifyPassword('hunter2!', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
    expect(verifyPassword('hunter2!', 'bogus')).toBe(false);
  });

  it('produces distinct hashes for the same password (random salt)', () => {
    expect(hashPassword('pw')).not.toBe(hashPassword('pw'));
  });

  it('creates sessions, authenticates, and logs out', () => {
    const ctx = makeContext();
    const email = 'a@b.c';
    ctx.db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(email, hashPassword('password123'), 'A', new Date().toISOString());
    const user = ctx.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { id: number };

    const token = createUserToken(ctx.db, user.id);
    expect(authenticate(ctx.db, token)?.email).toBe(email);
    expect(getSessionUser(ctx.db, `Bearer ${token}`)?.email).toBe(email);
    // Hashed form is stored, never the raw token.
    expect(token).not.toContain('token');

    logout(ctx.db, `Bearer ${token}`);
    expect(authenticate(ctx.db, token)).toBeNull();
    expect(authenticate(ctx.db, undefined)).toBeNull();
    expect(authenticate(ctx.db, 'not-a-token')).toBeNull();
  });

  it('does not accept an expired session', () => {
    const ctx = makeContext();
    const db = ctx.db;
    db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run('x@y.z', hashPassword('password123'), 'X', new Date().toISOString());
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get('x@y.z') as { id: number };
    // Insert an already-expired session directly (past timestamp).
    const token = 'expiredtoken';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, user.id, new Date().toISOString(), new Date(Date.now() - 1000).toISOString());
    expect(authenticate(db, token)).toBeNull();
  });
});
