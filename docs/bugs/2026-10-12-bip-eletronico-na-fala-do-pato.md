# Bug report — Bip eletrônico na voz do pato

- **Data:** 2026-10-12, 19h54 (gravação de tela de 27,44 s). Diagnosticado e corrigido em 2026-10-13
- **Descoberto por:** Grazi, durante uso real do app (conversa de teste com o pato)
- **Componente:** captura + reprodução de áudio no frontend: `frontend/microphone-and-speaker.js` e `frontend/pcm-processor.js`
- **Severidade:** média. Não impede a conversa, mas o som é audível, incômodo e contaminou a validação manual
- **Status:** ✅ **resolvido** no [PR #1](https://github.com/Grazinascito/rubber-duck-ai/pull/1) (branch `fix-bip`). Validado pela usuária rodando o app

---

## Resumo

Durante a fala do pato aparecia um bip agudo e metálico **no meio da fala**, em rajadas de ~50 ms a ~0,6 s, pelo menos uma por resposta. A causa **não** estava no áudio do Gemini. O motor de áudio do navegador perdia o prazo de renderização e **repetia o último bloco de 128 amostras** centenas de vezes. Isso acontecia porque captura (AudioWorklet) e reprodução dividiam o **mesmo `AudioContext`**, e o worklet de captura gerava pressão de GC a cada bloco.

## Sintoma

1. Pato convocado por atalho; Grazi pede: "Ei, pato, manda um salve pro pessoal do Twitter."
2. O pato responde. No meio da fala surge um "biiip" agudo, misturado à voz.
3. Grazi pergunta sobre o bip. O pato responde "Não ouço nenhum bipe por aqui". Isso é coerente: o `echoCancellation: true` remove do microfone o que sai dos alto-falantes.
4. O bip reaparece no turno seguinte, mais alto.

Sintoma correlato: o bico às vezes ficava aberto logo depois da fala. O bloco repetido mantinha o RMS acima de `LIMIAR_1`.

## Evidência

Áudio extraído da gravação (AAC 48 kHz, convertido para mono) e analisado por espectrograma e autocorrelação. Tempos medidos no áudio extraído.

| Momento | Duração aprox. | O que se vê |
|---|---|---|
| ~8,1 s | ~50 ms | rajada curta (turno 1) |
| ~10,2 s | ~0,6 s | rajada misturada à voz (turno 1) |
| ~19,5 s | ~0,2 s | rajada curta (turno 2) |
| ~23,46–23,9 s | ~0,5 s | **bip alto**, o mais audível (turno 2) |

**Assinatura do bip:**

- Autocorrelação com pico em **lag = 128 amostras a 48 kHz**, correlação > 0,9 entre blocos consecutivos. Ou seja, o mesmo bloco de 128 amostras se repete quase idêntico.
- Espectro em "pente": fundamental de **375 Hz** (= 48000 / 128) e harmônicos 750, 1125, 1500, 1875, 2250 Hz… até ~16 kHz. As linhas são perfeitamente horizontais: sem variação de pitch, sem formantes que mudam. É um sinal estacionário, não é voz.
- **128 frames é exatamente o tamanho do render quantum do Web Audio** (o bloco que o motor processa por vez). Quando o thread de renderização atrasa, o último quantum é tocado de novo em loop, e o loop de 128 amostras vira um tom de 375 Hz.

## Causa raiz

Duas causas que se somavam:

1. **Um único `AudioContext` para captura e reprodução.** O `MicAndSpeaker.start()` registrava o `pcm-processor` (AudioWorklet) no mesmo contexto usado pelo `playChunk()`. No Chromium, um contexto com AudioWorklet passa a renderizar **o grafo inteiro** no thread do worklet, que tem prioridade de agendamento menor que o thread de áudio padrão. A voz do pato passou a disputar CPU com a captura do microfone.
2. **Alocação e mensagens a cada bloco no `pcm-processor.js`.** Cada chamada de `process()` (~375×/s) criava 3–4 arrays (`new Float32Array` ×2, `slice`, `new Int16Array`) e fazia um `postMessage`. Isso gera coleta de lixo (GC) no mesmo thread que renderiza o áudio. Uma pausa de GC faz o render quantum perder o prazo, e o bloco se repete.

### Por que as hipóteses anteriores estavam erradas

A primeira versão deste report levantava três hipóteses: o tom viria no stream do Gemini, seria injetado pelo agendamento em `playChunk`, ou seria um chunk em loop no fim do turno. Ela também afirmava que o tom estava presente durante **toda** a fala.

- A medição do bin de 375 Hz durante a fala captava sobretudo **energia da própria voz** nessa faixa, não o tom. A assinatura periódica de 128 amostras só aparece em **rajadas**.
- O período de 64 amostras a 24 kHz (o "OUTPUT_RATE") é o mesmo tempo que 128 amostras a 48 kHz. A coincidência levou a suspeitar do PCM do Gemini, mas o número que explica o bug é o **render quantum**, não a taxa do stream.
- Agendamento com lacunas em `playChunk` geraria silêncio ou cliques, não um tom estacionário com período de 128 frames.

## Correção ([PR #1](https://github.com/Grazinascito/rubber-duck-ai/pull/1))

### `frontend/microphone-and-speaker.js`: dois AudioContexts

- `audioContext` (só reprodução): `new AudioContext({ sampleRate: OUTPUT_RATE, latencyHint: "playback" })`, **sem worklet**. A reprodução volta para o thread de áudio de alta prioridade. É criado e retomado em `start()`, que roda depois de um gesto do usuário.
- `captureContext` (novo): sample rate padrão; recebe `addModule("/pcm-processor.js")`, o `MediaStreamSource` e o `AudioWorkletNode`.
- `stopCapture()` fecha o `captureContext`; `close()` fecha os dois.
- Interface pública da classe inalterada.

### `frontend/pcm-processor.js`: zero alocação em `process()`

- Buffer de trabalho `Float32Array` e lote `Int16Array(640)` pré-alocados no constructor.
- Leftover e posição fracionária mantidos por índices: nenhum `new` ou `slice` por bloco.
- `postMessage` só quando o lote de **640 amostras (40 ms a 16 kHz)** enche. Isso reduz de ~375 para 25 mensagens/s. A única cópia é o `slice()` transferido.
- Mesma interpolação linear e mesmo clamp.

### Testes

- Novo teste `start() wires capture and playback on separate AudioContexts` em `microphone-and-speaker.test.js`.
- `npm test` (frontend): 50/50. `.venv/bin/python -m pytest -q`: 23 passaram.
- Teste de unidade não reproduz o bip real (exige áudio físico). A validação final foi manual, rodando o app: o bip sumiu.

## Lições / prevenção

- **Período de repetição = 128 frames → suspeite do render thread**, não do conteúdo do áudio. Medir o período por autocorrelação foi o que separou "áudio ruim vindo do servidor" de "motor de áudio engasgando".
- **Não misture AudioWorklet de captura com reprodução no mesmo `AudioContext`.** Captura e reprodução ficam em contextos separados.
- **Dentro de `process()` de um AudioWorklet: nada de `new`, `slice`, closures ou `postMessage` por bloco.** Pré-alocar e enviar em lotes.
- Se voltar a acontecer: gravar a saída, rodar autocorrelação e conferir se o pico está em 128 amostras (na taxa do contexto de reprodução).

## Referências

- PR da correção: [#1 — fix: Eliminar bip agudo durante a fala do pato](https://github.com/Grazinascito/rubber-duck-ai/pull/1)
- Código: `frontend/microphone-and-speaker.js` (`start`, `stopCapture`, `playChunk`, `close`), `frontend/pcm-processor.js` (`process`), `frontend/duck-talk-animator.js` (limiares de RMS do bico)
- Parente próximo: [2026-10-12-loop-infinito-de-saudacao-us2.md](./2026-10-12-loop-infinito-de-saudacao-us2.md)
- Vídeo original: `Screen Recording 2026-10-12 at 19.54.46.mov`
