import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import * as bitcoin from 'bitcoinjs-lib';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import type { DatabaseSync } from 'node:sqlite';
import { encryptSecret, decryptSecret, isEncrypted } from '../crypto';

export interface AddressInfo {
  address: string;
  index: number;
  outputScript: Uint8Array;
}

export interface Signer {
  publicKey: Uint8Array;
  index: number;
  sign(hash: Uint8Array): Uint8Array;
}

// BIP84: native SegWit (P2WPKH) — m/84'/0'/0'/0/i
const RECEIVE_PATH = (index: number) => `m/84'/0'/0'/0/${index}`;

export class HdWallet {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get mnemonic(): string {
    const row = this.db.prepare('SELECT mnemonic FROM wallet_keys WHERE id = 1').get() as
      | { mnemonic: string }
      | undefined;
    if (row) {
      // Migrate a legacy plaintext mnemonic to encrypted form on read.
      if (isEncrypted(row.mnemonic)) return decryptSecret(row.mnemonic);
      const encrypted = encryptSecret(row.mnemonic);
      this.db.prepare('UPDATE wallet_keys SET mnemonic = ? WHERE id = 1').run(encrypted);
      return row.mnemonic;
    }
    const mnemonic = bip39.generateMnemonic(wordlist, 128);
    this.db.prepare('INSERT INTO wallet_keys (id, mnemonic) VALUES (1, ?)').run(encryptSecret(mnemonic));
    return mnemonic;
  }

  private root(): HDKey {
    const seed = bip39.mnemonicToSeedSync(this.mnemonic);
    return HDKey.fromMasterSeed(seed);
  }

  getReceiveAddress(index: number): AddressInfo {
    const child = this.root().derive(RECEIVE_PATH(index));
    const { address, output } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey!,
      network: bitcoin.networks.bitcoin,
    });
    return { address: address!, index, outputScript: output! };
  }

  getSigner(index: number): Signer {
    const child = this.root().derive(RECEIVE_PATH(index));
    return {
      publicKey: child.publicKey!,
      index,
      sign: (hash: Uint8Array) =>
        secp256k1.sign(hash, child.privateKey!, { lowS: true, format: 'compact' }),
    };
  }
}
