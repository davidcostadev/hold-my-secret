// Password strength estimate (spec 002).
//
// strengthFromEntropy and crackTime are copied from crazytools:
// crazytools/src/pages/password-generator/passwordUtils.ts (ported TS -> JS).
// It is a copy: changes there do not propagate here.

/** Bits = length (code points) × log2(pool). Simple estimate, see spec 002 D2. */
export function passwordBits(password) {
  const pw = password.trim();
  if (pw === '') return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  return [...pw].length * Math.log2(pool);
}

export function strengthFromEntropy(bits) {
  if (bits < 36) {
    return { bits, score: 1, label: 'Weak', color: 'bg-red-500', textColor: 'text-red-500' };
  }
  if (bits < 60) {
    return { bits, score: 2, label: 'Fair', color: 'bg-amber-500', textColor: 'text-amber-500' };
  }
  if (bits < 90) {
    return { bits, score: 3, label: 'Strong', color: 'bg-green-500', textColor: 'text-green-500' };
  }
  return {
    bits,
    score: 4,
    label: 'Very strong',
    color: 'bg-emerald-600',
    textColor: 'text-emerald-600',
  };
}

// --- Crack time estimation ----------------------------------------------

// Offline attack on a fast-hashed password: ~10 billion guesses/second is a
// reasonable mid-range estimate for a determined attacker with GPUs.
const GUESSES_PER_SECOND = 1e10;

const TIME_UNITS = [
  { label: 'century', seconds: 60 * 60 * 24 * 365 * 100 },
  { label: 'year', seconds: 60 * 60 * 24 * 365 },
  { label: 'month', seconds: 60 * 60 * 24 * 30 },
  { label: 'day', seconds: 60 * 60 * 24 },
  { label: 'hour', seconds: 60 * 60 },
  { label: 'minute', seconds: 60 },
  { label: 'second', seconds: 1 },
];

export function crackTime(bits) {
  if (bits <= 0) return 'instantly';
  // Average number of guesses is half the keyspace.
  const seconds = Math.pow(2, bits - 1) / GUESSES_PER_SECOND;

  if (seconds < 1) return 'instantly';
  if (seconds < 60) return 'a few seconds';

  // Very large numbers: report in centuries with a readable magnitude.
  const centuries = seconds / TIME_UNITS[0].seconds;
  if (centuries >= 1e6) return 'effectively forever';
  if (centuries >= 1000) {
    return `${Math.round(centuries).toLocaleString('en-US')} centuries`;
  }

  for (const unit of TIME_UNITS) {
    const value = seconds / unit.seconds;
    if (value >= 1) {
      const rounded = Math.round(value);
      if (rounded === 1) return `1 ${unit.label}`;
      const plural = unit.label === 'century' ? 'centuries' : `${unit.label}s`;
      return `${rounded.toLocaleString('en-US')} ${plural}`;
    }
  }
  return 'instantly';
}
