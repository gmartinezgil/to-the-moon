import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ALGO = 'aes-256-gcm';
const KEY_PATH = new URL('../data/server.key', import.meta.url).pathname;

let cachedKey: Buffer | null = null;

/**
 * Resolves the encryption key: a configured WALLET_KEY env secret (hashed), or a
 * persistent random key file. The file is created on first boot so the demo works
 * out of the box; production should set WALLET_KEY to a real secret.
 */
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.WALLET_KEY;
  if (secret) {
    cachedKey = createHash('sha256').update(secret).digest();
    return cachedKey;
  }
  if (!existsSync(KEY_PATH)) {
    mkdirSync(dirname(KEY_PATH), { recursive: true });
    writeFileSync(KEY_PATH, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  cachedKey = Buffer.from(readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

/** True when the stored payload is plaintext (legacy unencrypted mnemonic). */
export function isEncrypted(payload: string): boolean {
  return payload.includes(':') && payload.split(':').length === 3;
}
