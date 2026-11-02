# 003 — Transparência e hardening

Status: aprovado (sessão de grilling de 2026-11-02)

## Contexto

Problemas encontrados na auditoria:

- **XSS**: o texto decifrado é inserido com `innerHTML` (`src/main.js:98`). Um texto cifrado criado por um atacante (que também passa a senha) executa script no navegador de quem decifra.
- **Scripts de terceiros** numa página de segredos: Google Tag (gtag) e CryptoJS da cdnjs têm acesso total ao DOM.
- **Sem cabeçalhos de segurança** no repositório (só `dist/_redirects`).
- O usuário não é informado de como os dados são tratados.
- Vários problemas de usabilidade (placeholder errado, cópia com entidades HTML, erro no console etc.).

## Decisões

| #   | Decisão                                                                   | Por quê                                                                             |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D1  | `textContent` em **toda** saída/mensagem; nenhum `innerHTML` no código.   | Fecha o XSS e corrige segredos com `<`, `>`, `&`.                                   |
| D2  | **Remover o gtag.**                                                       | Nenhum script de terceiro deve ter acesso aos segredos; permite CSP rígida.         |
| D3  | CryptoJS **embutida no bundle** (spec 001, R1.2).                         | Sem domínio externo; `script-src 'self'`.                                           |
| D4  | CSP rígida + cabeçalhos via `dist/_headers` (Netlify), versionado no Git. | `connect-src 'none'` é a garantia técnica de que a página não envia nada pela rede. |
| D5  | Seção **"How it works"** no **rodapé**.                                   | Transparência sem poluir o fluxo principal.                                         |
| D6  | Todos os itens de usabilidade do relatório entram.                        | Ver R5.                                                                             |

## Requisitos

### R1 — XSS

- R1.1 Substituir todo `innerHTML` por `textContent` (outputs, texto decifrado, mensagens de erro).
- R1.2 Saída decifrada com `white-space: pre-wrap` (classe `whitespace-pre-wrap`) para preservar quebras de linha e espaços.
- R1.3 Nenhum `innerHTML`, `outerHTML`, `insertAdjacentHTML` ou `document.write` no código final.

### R2 — Terceiros

- R2.1 Remover de `src/index.html` o `<script>` do `googletagmanager.com` e o bloco inline `gtag(...)`.
- R2.2 Remover o `<script>` da cdnjs (ver spec 001).
- R2.3 Nenhum script inline nem atributo `on*=` no HTML; nenhum `style=` inline (alternar visual só por classes).

### R3 — Cabeçalhos

- R3.1 Criar `dist/_headers`:
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
  ```
- R3.2 Adicionar `!dist/_headers` ao `.gitignore` (como já existe para `_redirects`).

### R4 — Seção "How it works" (rodapé)

Texto (inglês, curto):

- Everything is encrypted and decrypted **in your browser**. Nothing is sent anywhere — the page is technically blocked from making network requests.
- Encryption uses **[age](https://age-encryption.org)** (scrypt + ChaCha20-Poly1305), an open, documented standard. You can decrypt without this site: `age -d`.
- **If you lose the password, nobody can recover the secret.**
- Send the password through a **different channel** than the encrypted text.
- Old-format texts (before age) still open, but are less secure — re-encrypt them.
- Spaces at the start/end of the password are ignored.
- Auto-clears after 30 min idle. Close the tab when done.
- Source code: https://github.com/davidcostadev/hold-my-secret

### R5 — Usabilidade

- R5.1 Placeholder do textarea de Decrypt: **"Paste the encrypted text (Base64 or Hex)..."** (hoje: "Type your password here...").
- R5.2 Copiar usa o valor real (variável/`textContent`), nunca `innerHTML`; tratar a Promise de `navigator.clipboard.writeText` (toast: spec 004).
- R5.3 Remover `copyToClipboard('decrypted-hex')` (elemento inexistente, lança TypeError no carregamento).
- R5.4 Botão "See" da senha mestra: press-and-hold via **Pointer Events** (`pointerdown` mostra; `pointerup`/`pointerleave`/`pointercancel` escondem) e teclado (Espaço/Enter segurado mostra; `keyup`/`blur` esconde). Mesmo componente do olho da spec 004.
- R5.5 `spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"` na senha mestra e nos dois textareas.
- R5.6 Botão **"Clear all"** no topo (ao lado do relógio de auto-clear, spec 004): chama `clearAll()` sem recarregar.
- R5.7 Remover `console.log(isFormValid(...))` e a validação duplicada em `handleEncryptForm`.

## Critérios de aceite

- [ ] `grep -nE "innerHTML|outerHTML|insertAdjacentHTML|document\.write" src/` → nada.
- [ ] Vetor L2 (spec 001) mostra `<b>&"x"</b>` literal, com quebra de linha; copiar cola exatamente o mesmo texto (sem `&amp;`).
- [ ] `grep -nE "googletagmanager|gtag|cdnjs" src/` → nada.
- [ ] Deploy preview: `curl -sI <url> | grep -iE "content-security-policy|referrer-policy|x-content-type-options"` mostra os três cabeçalhos.
- [ ] No deploy preview, console sem violações de CSP ao cifrar/decifrar (age e legado), copiar e usar o auto-clear.
- [ ] Na aba Network do DevTools, nenhuma requisição após o carregamento inicial ao cifrar/decifrar.
- [ ] Console sem erros ao carregar a página (o TypeError do `decrypted-hex` some).
- [ ] "See": arrastar o mouse para fora com o botão pressionado esconde a senha; segurar Espaço com foco no botão mostra; soltar esconde.
- [ ] Seção "How it works" visível no rodapé com os 8 itens.
