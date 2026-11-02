import { ERR_WRONG, ERR_WORK_FACTOR, ERR_UNRECOGNIZED } from './cryptoErrors.js';
import { passwordBits, strengthFromEntropy, crackTime } from './passwordStrength.js';

const MIN_PASSWORD_LENGTH = 12;
const AUTO_CLEAR_MS = 30 * 60 * 1000;
const AUTO_CLEAR_WARNING_MS = 60 * 1000;
const MASK = '••••••••••••';

const ERROR_MESSAGES = {
  [ERR_WRONG]: 'Wrong password or corrupted text.',
  [ERR_WORK_FACTOR]: 'Unsupported work factor',
  [ERR_UNRECOGNIZED]: 'Unrecognized text. Paste the Base64 or Hex output from Hold my secret.',
};

const $ = (id) => document.getElementById(id);

const el = {
  password: $('master-password'),
  passwordError: $('password-error'),
  meter: $('meter'),
  meterSegments: [...document.querySelectorAll('.meter-segment')],
  meterLabel: $('meter-label'),
  meterBits: $('meter-bits'),
  meterCrack: $('meter-crack'),
  encryptForm: document.forms['encrypt'],
  encryptText: $('encrypt-text'),
  encryptVeil: $('encrypt-veil'),
  encryptError: $('encrypt-error'),
  encryptButton: $('encrypt-button'),
  encryptedContainer: $('encrypted-container'),
  encrypted: $('encrypted'),
  encryptedHex: $('encrypted-hex'),
  decryptForm: document.forms['decrypt'],
  decryptText: $('decrypt-text'),
  decryptError: $('decrypt-error'),
  decryptButton: $('decrypt-button'),
  decryptedContainer: $('decrypted-container'),
  decrypted: $('decrypted'),
  revealDecrypted: $('reveal-decrypted'),
  legacyNotice: $('legacy-notice'),
  reencryptButton: $('reencrypt-button'),
  reencryptHint: $('reencrypt-hint'),
  seePassword: $('see-password'),
  clearAll: $('clear-all'),
  clock: $('auto-clear-clock'),
  toast: $('toast'),
};

const show = (node, display = 'block') => {
  node.classList.remove('hidden');
  node.classList.add(display);
};
const hide = (node, display = 'block') => {
  node.classList.remove(display);
  node.classList.add('hidden');
};

// Decrypted plaintext lives only here; it enters the DOM only while revealed
// (spec 004, R2.2).
let decryptedSecret = '';
// Bumped by clearAll() so results of in-flight operations are discarded.
let generation = 0;

const codePoints = (s) => [...s].length;
const currentPassword = () => el.password.value.trim();

// --- Worker client ---------------------------------------------------------

const worker = new Worker(new URL('./crypto.worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let nextId = 0;

worker.onmessage = ({ data }) => {
  const entry = pending.get(data.id);
  if (!entry) return;
  pending.delete(data.id);
  if (data.ok) entry.resolve(data.result);
  else entry.reject(data.code);
};

const runInWorker = (op, args) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });

/** Disables a button and swaps its label while `task` runs. */
const busy = new Set();
const withBusy = async (button, busyLabel, task) => {
  const label = button.textContent;
  busy.add(button);
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await task();
  } finally {
    busy.delete(button);
    button.textContent = label;
    button.disabled = false;
    updateReencryptState();
  }
};

// --- Toast (spec 004, R4) ----------------------------------------------------

let toastTimer;
const showToast = (message, ms = 2000) => {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.remove('opacity-0');
  toastTimer = setTimeout(() => {
    el.toast.classList.add('opacity-0');
    toastTimer = setTimeout(() => (el.toast.textContent = ''), 300);
  }, ms);
};

const copy = (getText) => {
  navigator.clipboard
    .writeText(getText())
    .then(() => showToast('Copied to clipboard'))
    .catch(() => showToast("Couldn't copy"));
};

const makeCopyable = (node, getText) => {
  node.addEventListener('click', () => copy(getText));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      copy(getText);
    }
  });
};

const copySources = {
  encrypted: () => el.encrypted.textContent,
  'encrypted-hex': () => el.encryptedHex.textContent,
  decrypted: () => decryptedSecret,
};

makeCopyable(el.encrypted, copySources.encrypted);
makeCopyable(el.encryptedHex, copySources['encrypted-hex']);
makeCopyable(el.decrypted, copySources.decrypted);

document.querySelectorAll('.copy-button').forEach((button) => {
  const getText = copySources[button.dataset.copy];
  button.addEventListener('click', () => copy(getText));
});

// --- Auto-growing textareas -------------------------------------------------

const autoGrow = (textarea) => {
  textarea.style.height = 'auto';
  if (textarea.value === '') return;
  // scrollHeight excludes borders; max-height (CSS) caps the growth.
  const borders = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + borders}px`;
};

const autoGrowFields = [...document.querySelectorAll('textarea.auto-grow')];
autoGrowFields.forEach((textarea) => textarea.addEventListener('input', () => autoGrow(textarea)));
window.addEventListener('resize', () => autoGrowFields.forEach(autoGrow));

// --- Press-and-hold reveal (spec 003 R5.4, spec 004 R2.3) -------------------

const holdToReveal = (button, reveal, conceal) => {
  let active = false;
  const on = () => {
    active = true;
    reveal();
  };
  const off = () => {
    if (!active) return;
    active = false;
    conceal();
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button === 0) on();
  });
  ['pointerup', 'pointerleave', 'pointercancel', 'keyup', 'blur'].forEach((type) =>
    button.addEventListener(type, off)
  );
  button.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      on();
    }
  });
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  return off;
};

holdToReveal(
  el.seePassword,
  () => el.password.setAttribute('type', 'text'),
  () => el.password.setAttribute('type', 'password')
);

const concealDecrypted = holdToReveal(
  el.revealDecrypted,
  () => (el.decrypted.textContent = decryptedSecret),
  () => (el.decrypted.textContent = MASK)
);

// --- Encrypt veil (spec 004, R1) ---------------------------------------------

const applyVeil = () => {
  if (el.encryptText.value === '') return;
  if (document.activeElement === el.encryptText) el.encryptText.blur();
  el.encryptText.classList.add('blur-md', 'select-none');
  el.encryptText.tabIndex = -1;
  show(el.encryptVeil, 'flex');
};

const removeVeil = () => {
  el.encryptText.classList.remove('blur-md', 'select-none');
  el.encryptText.removeAttribute('tabindex');
  hide(el.encryptVeil, 'flex');
};

el.encryptText.addEventListener('blur', applyVeil);
el.encryptText.addEventListener('focus', removeVeil);
el.encryptVeil.addEventListener('click', () => {
  removeVeil();
  el.encryptText.focus();
});
window.addEventListener('blur', applyVeil);

// --- Strength meter (spec 002) -----------------------------------------------

const updateMeter = () => {
  const pw = currentPassword();
  if (pw === '') {
    hide(el.meter);
    return;
  }
  const bits = passwordBits(pw);
  const s = strengthFromEntropy(bits);
  const colors = ['bg-red-500', 'bg-amber-500', 'bg-green-500', 'bg-emerald-600', 'bg-slate-700'];
  el.meterSegments.forEach((seg, i) => {
    seg.classList.remove(...colors);
    seg.classList.add(i < s.score ? s.color : 'bg-slate-700');
  });
  el.meterLabel.className = `font-bold ${s.textColor}`;
  el.meterLabel.textContent = s.label;
  el.meterBits.textContent = `${Math.round(bits)} bits (estimate)`;
  el.meterCrack.textContent = crackTime(bits);
  show(el.meter);
};

const updateReencryptState = () => {
  const tooShort = codePoints(currentPassword()) < MIN_PASSWORD_LENGTH;
  el.reencryptButton.disabled = tooShort || busy.has(el.reencryptButton);
  if (tooShort) show(el.reencryptHint, 'inline');
  else hide(el.reencryptHint, 'inline');
};

el.password.addEventListener('input', () => {
  el.passwordError.textContent = '';
  updateMeter();
  updateReencryptState();
});
el.encryptText.addEventListener('input', () => (el.encryptError.textContent = ''));
el.decryptText.addEventListener('input', () => (el.decryptError.textContent = ''));

// --- Encrypt (spec 001, R2) ---------------------------------------------------

const setError = (node, message) => (node.textContent = message);

const validatePassword = ({ forEncryption }) => {
  const pw = currentPassword();
  if (pw === '') return 'Please enter a password';
  if (forEncryption && codePoints(pw) < MIN_PASSWORD_LENGTH) return 'Use at least 12 characters';
  return '';
};

const showEncrypted = ({ base64, hex }) => {
  el.encrypted.textContent = base64;
  el.encryptedHex.textContent = hex;
  show(el.encryptedContainer);
};

const encryptSecret = async (secret, button) => {
  const gen = generation;
  try {
    const result = await withBusy(button, 'Encrypting…', () =>
      runInWorker('encrypt', { secret, password: currentPassword() })
    );
    if (gen !== generation) return false;
    showEncrypted(result);
    return true;
  } catch {
    if (gen === generation) setError(el.encryptError, "Couldn't encrypt");
    return false;
  }
};

el.encryptForm.addEventListener('submit', (event) => {
  event.preventDefault();
  // The secret is never trimmed (spec 001, D9).
  const secret = el.encryptText.value;
  const textError = secret.trim() === '' ? 'Please enter some text to encrypt' : '';
  const passwordError = validatePassword({ forEncryption: true });
  setError(el.encryptError, textError);
  setError(el.passwordError, passwordError);
  if (textError || passwordError) return;

  encryptSecret(secret, el.encryptButton);
});

// --- Decrypt (spec 001, R3–R5, R7) --------------------------------------------

const clearDecrypted = () => {
  decryptedSecret = '';
  concealDecrypted();
  el.decrypted.textContent = '';
  hide(el.decryptedContainer);
  hide(el.legacyNotice);
};

el.decryptForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = el.decryptText.value.trim();
  const textError = input === '' ? 'Please paste the encrypted text' : '';
  const passwordError = validatePassword({ forEncryption: false });
  setError(el.decryptError, textError);
  setError(el.passwordError, passwordError);
  if (textError || passwordError) return;

  clearDecrypted();
  const gen = generation;
  try {
    const { format, text } = await withBusy(el.decryptButton, 'Decrypting…', () =>
      runInWorker('decrypt', { input, password: currentPassword() })
    );
    if (gen !== generation) return;
    decryptedSecret = text;
    el.decrypted.textContent = MASK;
    show(el.decryptedContainer);
    if (format === 'legacy') show(el.legacyNotice);
    updateReencryptState();
  } catch (code) {
    if (gen !== generation) return;
    clearDecrypted();
    setError(el.decryptError, ERROR_MESSAGES[code] || ERROR_MESSAGES[ERR_WRONG]);
  }
});

// --- Re-encrypt (spec 001, R6) -------------------------------------------------

el.reencryptButton.addEventListener('click', async () => {
  if (decryptedSecret === '' || validatePassword({ forEncryption: true })) return;
  setError(el.encryptError, '');
  if (await encryptSecret(decryptedSecret, el.reencryptButton)) {
    el.encryptedContainer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});

// --- Clear all + auto-clear (spec 004, R5) --------------------------------------

let deadline = Date.now() + AUTO_CLEAR_MS;
let warned = false;

const resetDeadline = () => {
  deadline = Date.now() + AUTO_CLEAR_MS;
  warned = false;
  renderClock();
};

const clearAll = () => {
  generation++;
  el.password.value = '';
  el.password.setAttribute('type', 'password');
  el.encryptText.value = '';
  el.decryptText.value = '';
  autoGrowFields.forEach(autoGrow);
  el.encrypted.textContent = '';
  el.encryptedHex.textContent = '';
  hide(el.encryptedContainer);
  clearDecrypted();
  [el.passwordError, el.encryptError, el.decryptError].forEach((node) => setError(node, ''));
  hide(el.meter);
  removeVeil();
  updateReencryptState();
  resetDeadline();
};

const formatRemaining = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

function renderClock() {
  el.clock.textContent = `Auto-clear in ${formatRemaining(deadline - Date.now())}`;
}

const checkDeadline = () => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    clearAll();
    location.reload();
    return;
  }
  if (remaining <= AUTO_CLEAR_WARNING_MS && !warned) {
    warned = true;
    showToast('Auto-clear in 1 minute', 5000);
  }
  renderClock();
};

['input', 'keydown', 'pointerdown', 'paste'].forEach((type) =>
  document.addEventListener(type, resetDeadline, true)
);

el.clearAll.addEventListener('click', clearAll);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    applyVeil();
    concealDecrypted();
  } else {
    checkDeadline();
  }
});
window.addEventListener('focus', checkDeadline);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) clearAll();
});

setInterval(checkDeadline, 1000);
renderClock();
updateReencryptState();
