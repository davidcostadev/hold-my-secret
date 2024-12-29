const { AES, enc } = window.CryptoJS;

const myEncrypt = (text, key) => {
  const encrypted = AES.encrypt(text, key).toString();
  const hex = enc.Base64.parse(encrypted).toString(enc.Hex);

  return [encrypted, hex];
};

const isHex = (str) => {
  const regex = /^[0-9a-fA-F]+$/;
  return regex.test(str);
};

const myDecrypt = (text, key) => {
  if (isHex(text)) {
    return AES.decrypt(enc.Hex.parse(text).toString(enc.Base64), key).toString(enc.Utf8);
  } else {
    return AES.decrypt(text, key).toString(enc.Utf8);
  }
};

/** @type {(form: HTMLFormElement) => boolean} */
const isFormValid = (form) => {
  const { text } = form.elements;

  const formControlMasterPassword = document.getElementById('form-control-master-password');
  const password = document.getElementById('master-password');

  const textValue = text.value.trim();
  const passwordValue = password.value.trim();

  let hasError = false;

  if (textValue === '') {
    /** @type {HTMLDivElement} */
    const errorMessage = form.querySelector('.error-message[data-field="text"]');
    errorMessage.innerHTML = 'Please enter some text to encrypt';
    hasError = true;
  } else {
    const errorMessage = form.querySelector('.error-message[data-field="text"]');
    errorMessage.innerHTML = '';
  }
  if (passwordValue === '') {
    /** @type {HTMLDivElement} */
    const errorMessage = formControlMasterPassword.querySelector(
      '.error-message[data-field="password"]'
    );
    errorMessage.innerHTML = 'Please enter a password';
    hasError = true;
  } else {
    const errorMessage = formControlMasterPassword.querySelector(
      '.error-message[data-field="password"]'
    );
    errorMessage.innerHTML = '';
  }
  return !hasError;
};

/** @type {(e: HTMLFormElement) => void} */
const handleEncryptForm = (event) => {
  event.preventDefault();

  const { text } = event.target.elements;
  const password = document.getElementById('master-password');

  console.log(isFormValid(event.target));
  if (!isFormValid(event.target)) return;

  text.value = text.value.trim();
  password.value = password.value.trim();

  const [encrypted, hex] = myEncrypt(text.value.trim(), password.value.trim());
  document.getElementById('encrypted-container').classList.remove('hidden');
  document.getElementById('encrypted-container').classList.add('block');

  document.getElementById('encrypted').innerHTML = encrypted;
  document.getElementById('encrypted-hex').innerHTML = hex;
};

/** @type {(e: HTMLFormElement) => void} */
const handleDecryptForm = (event) => {
  event.preventDefault();

  const { text } = event.target.elements;
  const password = document.getElementById('master-password');

  if (!isFormValid(event.target)) return;

  text.value = text.value.trim();
  password.value = password.value.trim();

  const decrypted = myDecrypt(text.value.trim(), password.value.trim());

  document.getElementById('decrypted-container').classList.remove('hidden');
  document.getElementById('decrypted-container').classList.add('block');

  document.getElementById('decrypted').innerHTML = decrypted;
};

document.forms['encrypt'].onsubmit = handleEncryptForm;
document.forms['decrypt'].onsubmit = handleDecryptForm;

window.onload = () => {
  const btns = document.getElementsByClassName('btn-see');
  /** @type {HTMLButtonElement} */
  const showPassword = (event) => {
    const masterPassword = document.getElementById('master-password');
    masterPassword.setAttribute('type', 'text');
  };
  /** @type {HTMLButtonElement} */
  const hidePassword = (event) => {
    const masterPassword = document.getElementById('master-password');
    masterPassword.setAttribute('type', 'password');
  };

  for (let i = 0; i < btns.length; i++) {
    /**  @type {HTMLButtonElement} */
    const btn = btns[i];
    btn.addEventListener('mousedown', showPassword);
    btn.addEventListener('mouseup', hidePassword);
    // capture event on mobile
    btn.addEventListener('touchstart', showPassword);
    btn.addEventListener('touchend', hidePassword);
  }
};

// get the element by id  and copy to clipboard on click needs to be generic to be used everywhere on click element
function copyToClipboard(id) {
  const el = document.getElementById(id);
  el.addEventListener('click', () => {
    const text = el.innerHTML;
    navigator.clipboard.writeText(text);
  });
}

copyToClipboard('encrypted');
copyToClipboard('encrypted-hex');
copyToClipboard('decrypted');
copyToClipboard('decrypted-hex');
