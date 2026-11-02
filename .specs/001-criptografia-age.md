# 001 — Criptografia: age v1 + compatibilidade com o formato legado

Status: aprovado (sessão de grilling de 2026-11-02)

## Contexto

Hoje (`src/main.js`) o app usa `CryptoJS.AES.encrypt(texto, senha)` carregado da cdnjs. Com senha em string, a CryptoJS usa o KDF legado do OpenSSL (`EVP_BytesToKey`: **MD5, 1 iteração**) + AES-256-CBC **sem MAC**. Consequências:

- Quem tem o texto cifrado testa senhas em velocidade de GPU (bilhões/s).
- Senha errada não é detectada de forma confiável (às vezes retorna `""`, às vezes lança "Malformed UTF-8 data").
- O texto cifrado é maleável (sem integridade).
- A CryptoJS está descontinuada.

## Decisões

| #   | Decisão                                                                                                                | Por quê                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Formato novo = **age v1** (`age-encryption.org/v1`), recipient de passphrase (scrypt + ChaCha20-Poly1305).             | Padrão público e auditável, implementação de referência em Go (CLI `age`), formato congelado. O segredo pode ser aberto **sem o site** (`age -d`). Elimina formato próprio. |
| D2  | Biblioteca: `age-encryption` (repo `FiloSottile/typage`), **versão exata `0.3.1`** em `dependencies`.                  | Lib oficial do autor do age. API é 0.x, então a versão fica fixa; o formato é estável, upgrades futuros não quebram textos existentes.                                      |
| D3  | scrypt **logN = 18**, definido explicitamente (`setScryptWorkFactor(18)`), não dependendo do default da lib.           | Mesmo default da CLI `age`.                                                                                                                                                 |
| D4  | Toda criptografia roda num **Web Worker**.                                                                             | scrypt logN=18 (~256 MB) é síncrono na lib e travaria a página por segundos.                                                                                                |
| D5  | Ao decifrar age, **recusar logN > 18** antes de rodar o scrypt.                                                        | A lib aceita até 20 (~1 GB); um texto malicioso congelaria o navegador da vítima.                                                                                           |
| D6  | Saídas: **Base64 (linha única, padrão com padding)** e **Hex (minúsculo)** dos **mesmos bytes** (arquivo age binário). | Mantém o fluxo atual; o usuário usa bastante o Hex.                                                                                                                         |
| D7  | Formato legado (CryptoJS): **somente decifrar, para sempre**. Nunca gerar texto legado.                                | Textos antigos podem estar guardados há anos.                                                                                                                               |
| D8  | Legado decifrado com sucesso → mostrar aviso curto + botão **Re-encrypt**.                                             | Incentivar migração; re-cifrar com a mesma senha protege pouco (as cópias antigas continuam quebráveis e revelam a senha), por isso o aviso sugere trocar a senha.          |
| D9  | `trim()` na **senha** (ambos os formatos) e no **texto cifrado colado**; **nunca** no segredo (texto em claro).        | Senha colada de chat costuma vir com espaço/quebra de linha no fim; o legado sempre usou senha com `trim()`. Alterar o segredo muda o conteúdo (ex.: chave SSH).            |
| D10 | Criptografia isolada em `src/crypto.js` (+ `src/crypto.worker.js`).                                                    | Separar da UI e permitir testes no futuro. Sem testes automatizados por agora; validação via checklist manual abaixo.                                                       |

## Requisitos

### R1 — Dependências

- R1.1 Adicionar `age-encryption@0.3.1` (exato, sem `^`) em `dependencies`.
- R1.2 Mover `crypto-js` para `dependencies` com versão exata `4.1.1`, importando só o necessário para o legado (`crypto-js/aes`, `crypto-js/enc-utf8`, `crypto-js/enc-hex`, `crypto-js/enc-base64`).
- R1.3 Remover o `<script>` da cdnjs de `src/index.html`, o uso de `window.CryptoJS` e ajustar/remover `src/dev.d.ts`.

### R2 — Cifrar

- R2.1 Entrada: segredo **sem `trim()`** (vazio = só espaços → erro "Please enter some text to encrypt"); senha com `trim()`.
- R2.2 Bloquear se a senha tiver < 12 caracteres (ver spec 002).
- R2.3 `Encrypter` → `setScryptWorkFactor(18)` → `setPassphrase(senha)` → `encrypt(segredo)` → `Uint8Array`.
- R2.4 Exibir os dois outputs, rotulados **"Base64"** e **"Hex"**.
- R2.5 Durante a operação, o botão mostra **"Encrypting…"** e fica desabilitado.

### R3 — Detecção de formato (ao decifrar)

Entrada com `trim()`. Na ordem:

1. Começa com `-----BEGIN AGE ENCRYPTED FILE-----` → `armor.decode` → **age**.
2. Casa com `/^[0-9a-fA-F]+$/` e tem tamanho par → decodificar Hex para bytes.
3. Senão, tentar decodificar como Base64 → bytes. Falhou → **desconhecido**.
4. Bytes começam com `age-encryption.org/v1\n` → **age**.
5. Bytes começam com `Salted__` → **legado**.
6. Senão → **desconhecido**.

Prefixos de referência:

| Formato | Base64 começa com                                          | Hex começa com                               |
| ------- | ---------------------------------------------------------- | -------------------------------------------- |
| Legado  | `U2FsdGVkX1`                                               | `53616c7465645f5f`                           |
| age     | `YWdlLWVuY3J5cHRpb24ub3JnL3Yx` (ou armor `-----BEGIN AGE`) | `6167652d656e6372797074696f6e2e6f72672f7631` |

Não há ambiguidade Hex × Base64: os dois prefixos Base64 começam com letra fora de `[0-9a-f]` (`U`, `Y`).

### R4 — Decifrar age

- R4.1 Antes de decifrar, ler o cabeçalho: a linha de stanza `-> scrypt <salt> <logN>`. Se `logN > 18` → erro **"Unsupported work factor"**, sem rodar scrypt.
- R4.2 `Decrypter` → `addPassphrase(senha)` → `decrypt(bytes, "text")`.
- R4.3 Qualquer falha (MAC, senha errada, corrompido) → **"Wrong password or corrupted text."**
- R4.4 Durante a operação, o botão mostra **"Decrypting…"** e fica desabilitado.

### R5 — Decifrar legado

- R5.1 Senha com `trim()`. Hex → converter para Base64 → `AES.decrypt(...).toString(Utf8)`.
- R5.2 Resultado `""` **ou** exceção → **"Wrong password or corrupted text."**
- R5.3 Resultado não vazio → exibir (ver spec 004) + aviso **"Old format — change your password and re-encrypt."** + botão **Re-encrypt**.

### R6 — Re-encrypt

- R6.1 Cifra o texto decifrado em age com a senha mestra atual (fluxo de R2) e mostra os outputs Base64/Hex na área de saída do Encrypt.
- R6.2 Desabilitado se a senha tiver < 12 caracteres, com a dica "Use at least 12 characters".

### R7 — Erros e estado

- R7.1 Formato desconhecido → **"Unrecognized text. Paste the Base64 or Hex output from Hold my secret."**
- R7.2 Em **qualquer** erro de decifragem, o resultado anterior é apagado (tela e variável) e o aviso de legado some.

## Checklist manual de aceite

> Sem testes automatizados por decisão (D10). Rodar este checklist antes de cada deploy que toque em `src/crypto*.js`.

### C1 — Vetores legados (gerados com a versão atual: CryptoJS 4.1.1 + lógica de `main.js` em `e5bd5b6`)

| ID  | Senha digitada                                     | Texto esperado                         | Base64                                                                                     | Hex                                                                                                                                |
| --- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| L1  | `correct horse battery`                            | `Hello, legacy!`                       | `U2FsdGVkX18sOo5k+43+6TJ+q2Ee/MLYSmR8bGuYXu8=`                                             | `53616c7465645f5f2c3a8e64fb8dfee9327eab611efcc2d84a647c6c6b985eef`                                                                 |
| L2  | `␣␣espacos nas pontas␣␣` (2 espaços em cada ponta) | `linha 1`⏎`linha 2 <b>&"x"</b> ç ã 🔐` | `U2FsdGVkX1+ZkYM+cB/FsaPGrdhuogaSIZ9dHGDH3ISh9XQf9rvn9LrtdSM1WZh0Is2I1CI7XmQIH4mpNl6laQ==` | `53616c7465645f5f9991833e701fc5b1a3c6add86ea20692219f5d1c60c7dc84a1f5741ff6bbe7f4baed75233559987422cd88d4223b5e64081f89a9365ea569` |
| L3  | `abc`                                              | `short password secret`                | `U2FsdGVkX1+eoqAbxZS64IiMiDWTX4UvYAwbDOaC985A5pcCV7spVGytb1XoZcfC`                         | `53616c7465645f5f9ea2a01bc594bae0888c8835935f852f600c1b0ce682f7ce40e6970257bb29546cad6f55e865c7c2`                                 |

- [ ] C1.1 L1, L2 e L3 decifram corretamente em **Base64 e Hex**.
- [ ] C1.2 L2 decifra digitando a senha **com** os espaços nas pontas (prova do `trim()` legado).
- [ ] C1.3 L2 exibe `<b>&"x"</b>` como **texto literal** (não negrito) e preserva a quebra de linha.
- [ ] C1.4 Os três mostram o aviso de formato antigo + Re-encrypt.
- [ ] C1.5 L3: Re-encrypt desabilitado com "Use at least 12 characters" (senha `abc`).
- [ ] C1.6 L1 com senha `wrong password` → "Wrong password or corrupted text." (no código atual retorna `""` silenciosamente).

### C2 — Interoperabilidade com a CLI `age` (v1.3.2 instalada em `/usr/local/bin/age`)

- [ ] C2.1 Site → CLI (Base64): cifrar `interop test` no site, então `echo '<base64>' | base64 -d > t.age && age -d t.age` → imprime `interop test`.
- [ ] C2.2 Site → CLI (Hex): `echo '<hex>' | xxd -r -p > t.age && age -d t.age` → imprime `interop test`.
- [ ] C2.3 CLI → site (armor): `printf 'from cli' | age -p -a` → colar a saída inteira no site → decifra `from cli`, **sem** aviso de legado.
- [ ] C2.4 CLI → site (Base64): `printf 'from cli' | age -p | base64 -w0` → colar no site → decifra.

### C3 — Formato age no site

- [ ] C3.1 Cifrar o mesmo texto duas vezes com a mesma senha gera saídas diferentes (salt/nonce aleatórios).
- [ ] C3.2 Senha errada → "Wrong password or corrupted text." e o resultado anterior some.
- [ ] C3.3 Alterar 1 caractere no meio do Hex → "Wrong password or corrupted text."
- [ ] C3.4 Work factor: pegar uma saída do site, `base64 -d > t.age`, trocar `18` por `19` na linha `-> scrypt …` (`sed -i '2s/ 18$/ 19/' t.age`), `base64 -w0 t.age` → colar → "Unsupported work factor", sem travar a página.
- [ ] C3.5 Texto aleatório (`hello`) → "Unrecognized text…".
- [ ] C3.6 A página continua responsiva (scroll, digitação) enquanto aparece "Encrypting…"/"Decrypting…".

## Fora de escopo

- Formato próprio (`v2`) — descartado em favor do age.
- Cifrar no formato legado.
- Testes automatizados.
