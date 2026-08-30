import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, isEncrypted } from '../src/crypto';

describe('crypto (encryption-at-rest)', () => {
  it('encrypts and decrypts a secret', () => {
    const payload = encryptSecret('03 correct horse battery staple');
    expect(payload).toContain(':');
    expect(decryptSecret(payload)).toBe('03 correct horse battery staple');
  });

  it('produces a different ciphertext each time (random IV/base64 tag)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('marks encrypted payloads and detects plaintext', () => {
    expect(isEncrypted(encryptSecret('x'))).toBe(true);
    expect(isEncrypted('plain mnemonic words')).toBe(false);
  });

  it('throws on tampered ciphertext', () => {
    const payload = encryptSecret('secret');
    expect(() => decryptSecret('AAAAAAAA' + payload.slice(8))).toThrow();
  });
});
