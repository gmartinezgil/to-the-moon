import { describe, it, expect } from 'vitest';
import { makeContext } from './helpers';
import { auditLog, idempotent } from '../src/audit';

describe('audit & idempotency', () => {
  it('records audit log rows with actor context', () => {
    const ctx = makeContext();
    ctx.db.prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run('u@x.com', 'hash', 'U', new Date().toISOString());
    const user = { id: 1 };
    auditLog(ctx.db, { user, ip: '1.2.3.4', ua: 'test-agent' }, 'wallet.buy', { amountMxn: 100 });
    auditLog(ctx.db, { user: null, ip: '9.9.9.9' }, 'auth.login_attempt', { ok: false });

    const rows = ctx.db.prepare('SELECT * FROM audit_log ORDER BY id').all() as Array<{
      user_id: number | null; action: string; ip: string; detail: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].action).toBe('wallet.buy');
    expect(rows[0].user_id).toBe(1);
    expect(rows[0].ip).toBe('1.2.3.4');
    expect(rows[1].user_id).toBeNull();
    expect(JSON.parse(rows[1].detail)).toEqual({ ok: false });
  });

  it('auditLog never throws, even with a bad DB', () => {
    const fake = { prepare: () => ({ run: () => { throw new Error('boom'); } }) } as never;
    expect(() => auditLog(fake, {}, 'x')).not.toThrow();
  });

  it('runs a mutation once and replays the cached result for the same key', async () => {
    const ctx = makeContext();
    let calls = 0;
    const run = async () => { calls += 1; return { ok: true, n: calls }; };

    const first = await idempotent(ctx.db, {
      key: 'k1', method: 'POST', path: '/api/wallet/buy', userId: 1, run,
    });
    const second = await idempotent(ctx.db, {
      key: 'k1', method: 'POST', path: '/api/wallet/buy', userId: 1, run,
    });
    expect(first).toEqual({ ok: true, n: 1 });
    expect(second).toMatchObject({ replay: true, value: { ok: true, n: 1 } });
    expect(calls).toBe(1);
  });

  it('treats different keys, methods or users independently', async () => {
    const ctx = makeContext();
    let calls = 0;
    const run = async () => { calls += 1; return { ok: true }; };

    await idempotent(ctx.db, { key: 'a', method: 'POST', path: '/p', userId: 1, run });
    await idempotent(ctx.db, { key: 'b', method: 'POST', path: '/p', userId: 1, run });
    await idempotent(ctx.db, { key: 'a', method: 'GET', path: '/p', userId: 1, run });
    await idempotent(ctx.db, { key: 'a', method: 'POST', path: '/p', userId: 2, run });
    expect(calls).toBe(4);

    const replay = await idempotent(ctx.db, { key: 'a', method: 'POST', path: '/p', userId: 1, run });
    expect(replay).toMatchObject({ replay: true });
    expect(calls).toBe(4);
  });

  it('returns the plain result when no key is supplied', async () => {
    const ctx = makeContext();
    let calls = 0;
    const run = async () => { calls += 1; return 42; };
    expect(await idempotent(ctx.db, { key: undefined, method: 'POST', path: '/p', userId: 1, run })).toBe(42);
    expect(calls).toBe(1);
  });
});
