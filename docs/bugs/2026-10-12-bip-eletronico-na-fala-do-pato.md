# Bug report — Bip eletrônico na voz do pato

- **Data:** 2026-10-12, 19h54 (gravação de tela de 27,44 s); report registrado em 2026-10-13 e corrigido no mesmo dia após observação da usuária
- **Descoberto por:** Grazi, durante uso real do app (conversa de teste com o pato)
- **Componente:** cadeia de reprodução de voz do pato — `frontend/microphone-and-speaker.js` (`playChunk`), `frontend/duck-states.js` (envelope `gemini` → `DUCK_AUDIO`), `frontend/duck-talk-animator.js` (animação do bico), `main.py` (encaminha `payload.audio`) e o stream de áudio do Gemini Live
- **Severidade:** média — não impede a conversa, mas o som é audível e incômodo (presente nas 3 falas do pato na gravação) e contaminou a validação manual
- **Status:** aberto — este report descreve o problema; nenhuma causa raiz foi investigada e nenhuma correção foi aplicada

---

## Título (resumo)

Um tom eletrônico (o "bip") acompanha a voz do pato **sempre que o pato fala**, misturado ao áudio da fala. Na maior parte do tempo a voz mascara o tom; ele fica claramente audível quando a voz pausa ou termina — por isso a primeira análise o detectou apenas nas bordas dos turnos. Correção da usuária (2026-10-13): "não é só no final da fala, o bip acontece sempre que o pato fala" — confirmada por análise espectral da fala completa.

## Fonte da evidência

- Gravação de tela com microfone: `/Users/grazinascimento/Desktop/Screen Recording 2026-10-12 at 19.54.46.mov` (27,44 s)
- Método de análise: áudio extraído e decomposto por frequência (banco de Goertzel — detector de tons por frequência), quadros extraídos a 4 por segundo e inspecionados, transcrição da fala
- O áudio da gravação vem do microfone da máquina; portanto tudo que se ouve na gravação saiu dos alto-falantes ou da voz no ambiente

## Passos para reproduzir (o que ocorre no vídeo)

1. Pato convocado por atalho (~2 s; acorda do sono).
2. Grazi fala: "Ei, pato, manda um salve pro pessoal do Twitter." (2–6 s).
3. Pato responde (turno 1, 7–11 s): "Salve para todo mundo do Twitter. O que estamos estudando hoje?"
4. Grazi desmuta o microfone pelo pill (~10 s; ícone do mic muda de cinza para escuro).
5. Grazi pergunta sobre o bip; o pato responde (turno 2, 19–24 s): "Não ouço nenhum bipe por aqui. Tudo bem? ..."
6. Grazi muta o microfone de novo (entre 20 e 25 s).
7. Pato fala "Estou aqui..." (turno 3, 26–27 s; gravação corta no fim).

O tom apareceu nos **3 turnos** do pato. Ainda não se sabe se ocorre em toda sessão ou esporadicamente.

## Resultado esperado

- A saída de áudio do pato contém apenas a voz sintetizada, sem nenhum tom eletrônico junto. O app não possui sons próprios (nenhum arquivo ou recurso de som no código); a única saída de áudio especificada é a voz do pato.
- O bico fecha assim que a fala termina. A animação do bico é dirigida pelo RMS do sinal reproduzido (RMS = valor médio da amplitude do áudio; limiar de abertura `LIMIAR_1 = 0.02` em `duck-talk-animator.js:12`).

## Resultado atual (observado na gravação)

### 1. Tom eletrônico presente durante toda a fala do pato (e só na fala dele)

Rastreamento do bin de 375 Hz em buckets de 250 ms no vídeo inteiro (amplitudes relativas; piso de ruído em silêncio = 0,4–4):

| Janela | O que é | Nível do bin 375 Hz |
|---|---|---|
| 7,5–11,0 s (turno 1 do pato) | fala do pato | 16–252 em todos os buckets, quase sempre > 60 |
| 19,5–24,0 s (turno 2 do pato) | fala do pato | 18–998 em todos os buckets, quase sempre > 60 |
| 26,75–27,25 s (turno 3) | fala do pato | 39–170 |
| 2,25–5,75 s e 13,0–17,75 s | fala da Grazi | piso a moderado (7–33; picos isolados 107 e 151) |
| 0–2 s, 6–7 s, 11,5–13 s, 18–19,5 s, 24,5–26,5 s | silêncio | 0,4–4 |

O tom existe enquanto o pato fala e some junto. Ele não aparece na voz da usuária nem nos silêncios — a fonte é a saída de áudio do pato, não o ambiente nem a cadeia de gravação.

### 2. Onde o tom fica audível (os "bipes")

- **Bip 1 — 11,25 a 11,95 s (~700 ms, volume baixo):** assim que a voz do turno 1 para, o tom fica exposto: ~750 Hz estável com 61% da energia da janela, RMS geral baixo (o sinal é quase só o tom).
- **Bip 2 — 23,87 a 24,15 s (~280 ms, volume alto):** no fim do turno 2 o tom **cresce 4–5×** (bin 375 Hz salta de ~60–200 para 668–998) e soa como o bip alto: 375 + 750 + 1500 Hz simultâneos (razão exata 1:2:4 — um som fundamental e seus harmônicos).
- **Reação da usuária (13–18 s):** "Cara, que diabo de bipe é esse? Tem um bipe aí no... ah!"
- **O pato não escuta o bip:** respondeu "Não ouço nenhum bipe por aqui". Coerente com o cancelamento de eco ativo na captura (`echoCancellation: true`, `microphone-and-speaker.js:23`): o som que sai dos alto-falantes é removido do áudio enviado ao modelo.

### 3. Sintoma correlato — bico preso aberto

Às 24,5 s e 25,2 s (silêncio entre os turnos 2 e 3) o bico permaneceu **aberto**. No silêncio entre os turnos 1 e 2 (14,0 s) o bico estava corretamente **fechado**. O tom que persiste no barramento de reprodução após a voz mantém o RMS acima do limiar e segura o quadro de "falando" (`duck-talk-animator.js:90-115`).

## Por que não é som de sistema ou notificação

1. Nos quadros exatos dos dois bipes audíveis, o canto superior direito da tela (área de banners de notificação do macOS) foi inspecionado: nenhum banner, popup ou alerta em nenhum instante.
2. A assinatura espectral do tom foi comparada com os 14 sons de `/System/Library/Sounds/` (Basso, Funk, Sosumi, Tink, Submarine, Ping etc.), com o som de carregador (`connect_power.aif` do PowerChime) e com `IKBeep.aiff`: nenhum contém tom puro de 375/750 Hz.
3. Sons de notificação são chimes musicais (sequências de notas). O tom do vídeo é **fixo e estável** enquanto existe, característica de artefato de áudio digital.
4. Um som de sistema tocaria independentemente de quem fala; o tom aparece só durante a fala do pato (tabela acima).

## Caracterização técnica do som

- 375 Hz é um padrão que se repete a cada 64 amostras a 24 kHz; 750 Hz, a cada 32 amostras. 24 kHz é exatamente a taxa de reprodução do pato (`OUTPUT_RATE = 24000`, `microphone-and-speaker.js:14`).
- Essa correspondência aritmética com a taxa de reprodução, mais os harmônicos 1:2:4 no bip alto, apontam para um **padrão de PCM periódico** (PCM = áudio digital em amostras cruas) na saída do pato — não para um som intencional de qualquer aplicação.

## Hipóteses de causa (não verificadas — sem investigação de causa raiz ainda)

1. O tom vem **dentro do próprio stream do Gemini Live** (artefato de sintetização/codec do lado do servidor, presente nos chunks de áudio enviados ao frontend). Peso aumentou com a correção da usuária: o tom existe durante toda a fala, não só nas bordas — ou seja, ele já chega junto com os chunks.
2. O tom é injetado pelo caminho local de reprodução enquanto ele está ativo (decodificação/agendamento dos chunks em `playChunk`, `microphone-and-speaker.js:91-133`).
3. Hipótese menos provável (era a principal antes da correção): resíduo apenas na fronteira de fim de turno, p. ex. último chunk em loop — não explica o tom presente durante a fala inteira.

## Referências

- Código: `frontend/microphone-and-speaker.js` (`playChunk` 91–133, `OUTPUT_RATE` 14, `echoCancellation` 23, `stopPlayback` 164–181, `acquirePlaybackMeter` 140–162); `frontend/duck-states.js` (207–221, envelope `gemini` → `mic.playChunk` → `animator.start`); `frontend/duck-talk-animator.js` (12–13 limiares, 90–115 laço de RMS); `main.py` (encaminhamento de `payload.audio`).
- Parente próximo: [2026-10-12-loop-infinito-de-saudacao-us2.md](./2026-10-12-loop-infinito-de-saudacao-us2.md) — aquele bug também se manifestava na fronteira de turno (`turn_complete`); este aqui é posterior àquela correção.
- Vídeo original: `/Users/grazinascimento/Desktop/Screen Recording 2026-10-12 at 19.54.46.mov`.
