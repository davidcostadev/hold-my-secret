// Crypto core for Hold my secret. No DOM access: runs inside crypto.worker.js.
//
// - New format: age v1 with a passphrase (scrypt + ChaCha20-Poly1305).
// - Legacy format: CryptoJS AES (OpenSSL "Salted__"), decrypt-only.
//
// See .specs/001-criptografia-age.md.

import { Encrypter, Decrypter, armor } from 'age-encryption';
import AES from 'crypto-js/aes.js';
import Utf8 from 'crypto-js/enc-utf8.js';
import { ERR_WRONG, ERR_WORK_FACTOR, ERR_UNRECOGNIZED } from './cryptoErrors.js';

export const SCRYPT_LOG_N = 18;
export const MAX_SCRYPT_LOG_N = 18;

const ARMOR_HEADER = '-----BEGIN AGE ENCRYPTED FILE-----';
const AGE_MAGIC = 'age-encryption.org/v1\n';
const LEGACY_MAGIC = 'Salted__';


export class CryptoError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// --- Encoding helpers ----------------------------------------------------

export const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const bytesToHex = (bytes) => {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
};

const base64ToBytes = (b64) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 === 1) return null;
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

const startsWithAscii = (bytes, prefix) => {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix.charCodeAt(i)) return false;
  }
  return true;
};

// --- Format detection (spec 001, R3) -----------------------------------

/** @returns {{ format: 'age' | 'legacy' | 'unknown', bytes?: Uint8Array }} */
export const detectFormat = (input) => {
  const text = input.trim();

  if (text.startsWith(ARMOR_HEADER)) {
    try {
      return { format: 'age', bytes: armor.decode(text) };
    } catch {
      return { format: 'unknown' };
    }
  }

  // Encoded data may come wrapped across lines (e.g. `base64` without -w0).
  const compact = text.replace(/\s+/g, '');
  let bytes = null;
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    bytes = hexToBytes(compact);
  } else {
    bytes = base64ToBytes(compact);
  }
  if (!bytes) return { format: 'unknown' };

  if (startsWithAscii(bytes, AGE_MAGIC)) return { format: 'age', bytes };
  if (startsWithAscii(bytes, LEGACY_MAGIC)) return { format: 'legacy', bytes };
  return { format: 'unknown' };
};

// --- age ----------------------------------------------------------------

/** @returns {Promise<{ base64: string, hex: string }>} */
export const encryptAge = async (secret, password) => {
  const e = new Encrypter();
  e.setScryptWorkFactor(SCRYPT_LOG_N);
  e.setPassphrase(password.trim());
  const bytes = await e.encrypt(secret);
  return { base64: bytesToBase64(bytes), hex: bytesToHex(bytes) };
};

// Reads the scrypt work factor from the header without running scrypt
// (spec 001, R4.1). Returns null if there is no scrypt stanza.
const scryptLogN = (bytes) => {
  // The header is ASCII and ends at the "--- " MAC line; 4 KiB is plenty.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  for (const line of head.split('\n')) {
    if (line.startsWith('--- ')) break;
    const m = /^-> scrypt \S+ (\S+)$/.exec(line);
    if (m) return /^[0-9]+$/.test(m[1]) ? Number(m[1]) : Infinity;
  }
  return null;
};

const decryptAge = async (bytes, password) => {
  const logN = scryptLogN(bytes);
  if (logN !== null && logN > MAX_SCRYPT_LOG_N) throw new CryptoError(ERR_WORK_FACTOR);

  const d = new Decrypter();
  d.addPassphrase(password.trim());
  try {
    return await d.decrypt(bytes, 'text');
  } catch {
    throw new CryptoError(ERR_WRONG);
  }
};

// --- Legacy (CryptoJS 4.1.1), decrypt-only (spec 001, R5) ----------------

const decryptLegacy = (bytes, password) => {
  let text = '';
  try {
    text = AES.decrypt(bytesToBase64(bytes), password.trim()).toString(Utf8);
  } catch {
    throw new CryptoError(ERR_WRONG);
  }
  if (text === '') throw new CryptoError(ERR_WRONG);
  return text;
};

// --- Entry point ----------------------------------------------------------

/** @returns {Promise<{ format: 'age' | 'legacy', text: string }>} */
export const decrypt = async (input, password) => {
  const { format, bytes } = detectFormat(input);
  if (format === 'age') return { format, text: await decryptAge(bytes, password) };
  if (format === 'legacy') return { format, text: decryptLegacy(bytes, password) };
  throw new CryptoError(ERR_UNRECOGNIZED);
};
