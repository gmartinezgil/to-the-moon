import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';

export interface AuditActor {
  user?: { id: number } | null;
  ip?: string;
  ua?: string;
}

export function auditLog(db: DatabaseSync, actor: AuditActor, action: string, detail: Record<string, unknown> = {}) {
  try {
    db.prepare(
      'INSERT INTO audit_log (user_id, action, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      actor.user?.id ?? null,
      action,
      JSON.stringify(detail),
      actor.ip ?? null,
      actor.ua ?? null,
      new Date().toISOString(),
    );
  } catch {
    // Auditing must never break a request.
  }
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface IdempotencyReplay<T> {
  replay: boolean;
  value?: T;
}

/**
 * Checks for (and records) an idempotency key. When a client replays a request
 * with the same key+method+path+user, the cached earlier response is returned
 * so money operations are never double-executed on network retries.
 */
export function idempotent<T>(db: DatabaseSync, opts: {
  key: string | undefined;
  method: string;
  path: string;
  userId: number | null;
  run: () => T | Promise<T>;
}): Promise<T | IdempotencyReplay<T>> {
  const { key } = opts;
  if (!key) return Promise.resolve(opts.run());

  const hashed = hashKey(`${opts.method}:${opts.path}:${opts.userId}:${key}`);
  const existing = db.prepare('SELECT response FROM idempotency_keys WHERE token_hash = ?').get(hashed) as
    | { response: string }
    | undefined;
  if (existing) {
    try {
      return Promise.resolve({ replay: true, value: JSON.parse(existing.response) as T });
    } catch {
      // Fall through and re-run if the cached payload is unparseable.
    }
  }

  return Promise.resolve(opts.run()).then((value) => {
    db.prepare('INSERT INTO idempotency_keys (token_hash, response, created_at) VALUES (?, ?, ?)')
      .run(hashed, JSON.stringify(value), new Date().toISOString());
    return value;
  });
}

export function makeIdempotencyKey(): string {
  return randomBytes(24).toString('hex');
}
