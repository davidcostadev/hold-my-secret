# 004 — Proteção na tela

Status: aprovado (sessão de grilling de 2026-11-02)

## Contexto

Segredos ficam visíveis na tela indefinidamente (texto em claro no Encrypt, resultado do Decrypt), sem feedback ao copiar e sem limpeza automática. Risco: alguém olhando a tela, gravação/compartilhamento de tela, aba esquecida aberta.

## Decisões

| #   | Decisão                                                                                                                           | Por quê                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D1  | Textarea do Encrypt: **véu com blur** quando perde o foco; texto normal quando focado.                                            | `<textarea>` não aceita `type="password"`; `-webkit-text-security` não é padrão. Blur funciona em todos os navegadores.    |
| D2  | Resultado do Decrypt **sempre mascarado** (pontos em número fixo); revelado só **enquanto o olho está pressionado**.              | Não vazar nem o tamanho; exposição mínima.                                                                                 |
| D3  | Texto decifrado fica **só numa variável JS**, entra no DOM apenas enquanto revelado.                                              | Menos exposição a quem inspeciona/lê o DOM.                                                                                |
| D4  | **Clicar no campo sempre copia**, mesmo mascarado.                                                                                | Copiar sem precisar revelar.                                                                                               |
| D5  | Saídas cifradas (Base64/Hex) **não** são mascaradas.                                                                              | Não são segredo.                                                                                                           |
| D6  | **Toast** em toda cópia.                                                                                                          | Feedback claro e acessível.                                                                                                |
| D7  | **Não** limpar a área de transferência automaticamente.                                                                           | O navegador não permite verificar o conteúdo sem pedir permissão; poderia apagar algo que o usuário copiou de outro lugar. |
| D8  | **Auto-clear após 30 min sem uso** (reinicia ao digitar, clicar ou colar), com contagem visível, aviso a 1 min, limpeza + reload. | Contar desde a abertura apagaria o que está sendo digitado.                                                                |
| D9  | Nome **"Auto-clear"**, não "destruição da memória"; texto honesto no rodapé (spec 003, R4).                                       | JS não garante que o navegador apague a memória.                                                                           |

## Requisitos

### R1 — Véu no Encrypt

- R1.1 Ao perder o foco (`blur`) com conteúdo: aplicar blur forte no textarea (classe, ex. `blur-md select-none`) e sobrepor um overlay **"•••••• Click to edit"**.
- R1.2 Também aplicar o véu em `visibilitychange` (aba oculta) e `window` `blur` (troca de janela).
- R1.3 Clicar/tocar no overlay foca o textarea e remove o véu.
- R1.4 Textarea vazio → sem véu.
- R1.5 O overlay não contém o texto (é só visual por cima).

### R2 — Resultado do Decrypt mascarado

- R2.1 Exibe sempre **`••••••••••••`** (12 pontos, fixo) enquanto não revelado.
- R2.2 O texto decifrado fica numa variável de módulo; o elemento só recebe `textContent = segredo` enquanto revelado e volta para os pontos ao esconder.
- R2.3 Botão de **olho** ao lado do campo, press-and-hold (mesmo componente do "See", spec 003 R5.4): Pointer Events (`pointerdown` mostra; `pointerup`/`pointerleave`/`pointercancel` escondem) + teclado (Espaço/Enter segurado mostra; `keyup`/`blur` esconde). `aria-label="Hold to reveal"`.
- R2.4 Esconder também em `visibilitychange` (aba oculta).
- R2.5 Clicar no campo copia o valor da variável (revelado ou não). `title="Click to copy"`, `cursor-pointer`.

### R3 — Saídas cifradas

- R3.1 Base64 e Hex visíveis; clicar copia; `title="Click to copy"`.

### R4 — Toast

- R4.1 Container único com `role="status"` e `aria-live="polite"`, posicionado embaixo ao centro.
- R4.2 Mensagens: sucesso **"Copied to clipboard"**; falha (Promise rejeitada) **"Couldn't copy"**; aviso de auto-clear **"Auto-clear in 1 minute"**.
- R4.3 Some após ~2 s (aviso de auto-clear: ~5 s). Um toast novo substitui o anterior.
- R4.4 Implementação em JS puro, sem dependência.

### R5 — Auto-clear

- R5.1 Prazo = `Date.now() + 30 min`, guardado como timestamp. Reiniciado em `input`, `keydown`, `pointerdown` e `paste` (não em `mousemove`).
- R5.2 Relógio no canto superior: **"Auto-clear in MM:SS"**, atualizado a cada 1 s, ao lado do botão "Clear all" (spec 003 R5.6).
- R5.3 Faltando 60 s → toast "Auto-clear in 1 minute" (uma vez por ciclo).
- R5.4 Ao zerar: `clearAll()` e depois `location.reload()`.
- R5.5 Conferir o prazo também em `visibilitychange` (aba volta a ficar visível) e `focus`: se já passou, limpar imediatamente (timers de abas em segundo plano são atrasados pelo navegador).
- R5.6 `pageshow` com `event.persisted === true` (voltou pelo cache de navegação) → `clearAll()`.
- R5.7 `clearAll()` (também usado pelo botão "Clear all") zera: senha mestra, os dois textareas, outputs Base64/Hex, variável do texto decifrado, mensagens de erro, aviso de legado, medidor; esconde os containers de saída; remove véus; reinicia o prazo.
- R5.8 Limpar os campos **antes** do reload (o Firefox restaura valores de formulário após reload); campos com `autocomplete="off"` (spec 003 R5.5).

## Critérios de aceite

- [ ] Digitar no Encrypt, clicar fora → texto borrado com "•••••• Click to edit"; clicar → texto normal.
- [ ] Trocar de aba/janela com o textarea focado → véu aplicado ao voltar.
- [ ] Decifrar → campo mostra 12 pontos, independente do tamanho do segredo.
- [ ] Segurar o olho → segredo aparece; soltar ou arrastar para fora → pontos.
- [ ] Com o campo mascarado, inspecionar o DOM no DevTools → o segredo não aparece.
- [ ] Clicar no campo mascarado → toast "Copied to clipboard" e o segredo correto na área de transferência.
- [ ] Clicar em Base64 e em Hex → toast em ambos.
- [ ] Negar permissão de clipboard (ou contexto sem permissão) → "Couldn't copy".
- [ ] Teste rápido do auto-clear com o prazo temporariamente reduzido (ex.: 2 min): relógio conta, aviso a 1 min, ao zerar a página limpa e recarrega **vazia** (testar também no Firefox).
- [ ] Digitar durante a contagem → relógio volta a 30:00.
- [ ] Deixar a aba em segundo plano além do prazo e voltar → limpa na hora.
- [ ] "Clear all" limpa tudo sem recarregar.
