import crypto from 'crypto-js';

interface Window {
  CryptoJS: typeof crypto;
}
