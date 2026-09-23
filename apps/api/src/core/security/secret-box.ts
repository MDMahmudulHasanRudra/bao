import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env.js';

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  // Any ≥32-char passphrase works; SHA-256 always yields the 32 bytes AES-256 needs.
  return createHash('sha256').update(getEnv().ENCRYPTION_KEY).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(blob: string): string {
  const [v, ivB64, tagB64, dataB64] = blob.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Malformed secret blob');
  const decipher = createDecipheriv(ALGO, keyBytes(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Display-only suffix; full keys never leave the server. */
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return '••••';
  return `…${plaintext.slice(-4)}`;
}
