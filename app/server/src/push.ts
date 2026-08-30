import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const keysPath = new URL('../data/vapid.json', import.meta.url).pathname;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let keys: VapidKeys | null = null;

export function getVapidKeys(): VapidKeys {
  if (keys) return keys;
  const pub = process.env.VAPID_PUBLIC_KEY;
  if (pub && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: pub, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  if (!existsSync(keysPath)) {
    const generated = webpush.generateVAPIDKeys();
    mkdirSync(dirname(keysPath), { recursive: true });
    writeFileSync(keysPath, JSON.stringify(generated, null, 2), { mode: 0o600 });
    keys = generated;
    return keys;
  }
  keys = JSON.parse(readFileSync(keysPath, 'utf8')) as VapidKeys;
  return keys;
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT ?? 'mailto:dev@tothemoon.app';
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(db: DatabaseSync, userId: number, sub: PushSubscription) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, sub.endpoint);
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, sub.endpoint, sub.keys?.p256dh ?? '', sub.keys?.auth ?? '', new Date().toISOString());
}

export function listSubscriptions(db: DatabaseSync): Array<{ endpoint: string; p256dh: string; auth: string }> {
  return db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all() as Array<{
    endpoint: string; p256dh: string; auth: string;
  }>;
}

/** Send a push notification to every stored subscription. Best-effort; logs failures. */
export async function sendPush(db: DatabaseSync, title: string, body: string, url = '/') {
  const { publicKey, privateKey } = getVapidKeys();
  webpush.setVapidDetails(getVapidSubject(), publicKey, privateKey);
  const subs = listSubscriptions(db);
  for (const s of subs) {
    const sub: PushSubscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    if (!sub.endpoint || !sub.keys.p256dh || !sub.keys.auth) continue;
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, url }));
    } catch (err) {
      // 404/410 → subscription is gone; drop it.
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(sub.endpoint);
      }
    }
  }
}
