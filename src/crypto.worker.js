// Runs scrypt off the main thread (spec 001, D4).
import { encryptAge, decrypt, CryptoError } from './crypto.js';
import { ERR_WRONG } from './cryptoErrors.js';

const ops = {
  encrypt: ({ secret, password }) => encryptAge(secret, password),
  decrypt: ({ input, password }) => decrypt(input, password),
};

self.onmessage = async ({ data }) => {
  const { id, op, args } = data;
  try {
    if (!Object.hasOwn(ops, op)) throw new Error(`Unknown op: ${op}`);
    const result = await ops[op](args);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    const code = err instanceof CryptoError ? err.code : ERR_WRONG;
    self.postMessage({ id, ok: false, code });
  }
};
