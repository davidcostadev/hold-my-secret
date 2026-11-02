# 002 — Senha mestra e medidor de força

Status: aprovado (sessão de grilling de 2026-11-02)

## Contexto

Hoje qualquer senha (inclusive de 1 caractere) é aceita e não há indicação de força. Mesmo com scrypt (spec 001), uma senha fraca cai rápido num ataque offline.

## Decisões

| #   | Decisão                                                                                                                                                          | Por quê                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Medidor no estilo do **Password Generator do crazytools** (4 segmentos, rótulo, bits, "Time to crack"), **só indicando a força da senha digitada**. Sem gerador. | Reaproveitar o visual e a lógica já conhecidos; o usuário não quer gerador neste app.                                                |
| D2  | Entropia por fórmula simples: `tamanho × log₂(pool)`, marcada como **"estimate"**.                                                                               | Sem dependência nova. Limitação aceita: superestima senhas previsíveis (`Password123!`).                                             |
| D3  | "Time to crack" com **10 bilhões de tentativas/s** (mesma constante do crazytools), **sem tooltip** explicativo.                                                 | Pior caso; não prometer número que depende do hardware do atacante.                                                                  |
| D4  | **Mínimo de 12 caracteres para cifrar**; decifrar aceita qualquer senha.                                                                                         | Textos antigos podem ter senhas curtas (ex.: vetor L3 da spec 001).                                                                  |
| D5  | Medidor **informativo**: o rótulo nunca bloqueia (com ≥ 12 caracteres a fórmula dá no mínimo ~40 bits, "Fair").                                                                                                | Bloqueio é só pela regra objetiva de tamanho.                                                                                        |
| D6  | **Sem campo de confirmação de senha.**                                                                                                                           | Decisão do usuário (menos atrito). Risco aceito: erro de digitação ao cifrar torna o segredo irrecuperável; mitigação = botão "See". |

## Fonte do código a portar

`~/workplace/crazytools/src/pages/password-generator/passwordUtils.ts` (TypeScript puro, sem React). Portar para JS em `src/passwordStrength.js` **apenas**:

- `strengthFromEntropy(bits)` — limiares e rótulos idênticos.
- `crackTime(bits)` — com `GUESSES_PER_SECOND = 1e10` e as mesmas faixas/strings.

É cópia: mudanças no crazytools **não** se propagam. Registrar no topo do arquivo de onde veio.

Não portar: geradores, `wordlists.ts`, `entropyFor*`, componentes React.

## Requisitos

### R1 — Cálculo

- R1.1 A senha considerada é a senha **com `trim()`** (a mesma usada para cifrar).
- R1.2 `tamanho` = número de code points (`[...senha].length`), não `senha.length`.
- R1.3 `pool` = soma de: 26 se tem `[a-z]`; 26 se tem `[A-Z]`; 10 se tem `[0-9]`; 32 se tem qualquer outro caractere (símbolos, espaço, acentos, emoji).
- R1.4 `bits = tamanho × log₂(pool)`; senha vazia → medidor oculto.

### R2 — Faixas (iguais ao crazytools)

| bits  | Rótulo      | Segmentos | Cor           |
| ----- | ----------- | --------- | ------------- |
| < 36  | Weak        | 1         | `red-500`     |
| 36–59 | Fair        | 2         | `amber-500`   |
| 60–89 | Strong      | 3         | `green-500`   |
| ≥ 90  | Very strong | 4         | `emerald-600` |

### R3 — UI

- R3.1 Logo abaixo do campo de senha mestra; aparece quando o campo tem conteúdo; atualiza a cada `input`.
- R3.2 Mostra: 4 segmentos (inativos em `slate-700`, tema escuro), rótulo colorido, `<N> bits (estimate)` e `Time to crack: <crackTime>`.
- R3.3 Textos em inglês, como o resto do app.
- R3.4 O medidor não lê nem guarda a senha fora do cálculo; nada é enviado/registrado.

### R4 — Regra de tamanho

- R4.1 Encrypt com senha (após `trim()`) < 12 code points → erro abaixo da senha: **"Use at least 12 characters"**; nada é cifrado.
- R4.2 Decrypt não aplica a regra.
- R4.3 Re-encrypt (spec 001, R6) desabilitado com a mesma dica.

## Critérios de aceite

- [ ] `abc` → Weak, 1 segmento; Encrypt bloqueado com "Use at least 12 characters"; Decrypt funciona (vetor L3).
- [ ] `correct horse battery` (21 chars, minúsculas + espaço → pool 58) → ~123 bits, Very strong; Encrypt permitido.
- [ ] `123456789012` (12 dígitos) → ~40 bits, Fair; Encrypt **permitido** (o medidor não bloqueia). Limitação aceita (D2): `aaaaaaaaaaaa` aparece como ~56 bits, Fair, apesar de ser trivial.
- [ ] `␣␣abc␣␣` é medido como `abc` (3 chars).
- [ ] Campo vazio → medidor oculto.
- [ ] Strings de `crackTime` idênticas às do crazytools para os mesmos bits (ex.: 0 bits → "instantly").

## Fora de escopo

- Gerador de senhas.
- Confirmação de senha.
- Estimador baseado em dicionário (zxcvbn).
