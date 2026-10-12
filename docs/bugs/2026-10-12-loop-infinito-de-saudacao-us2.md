# Bug report — Loop infinito de saudação na US2

- **Data:** 2026-10-12 (noite)
- **Descoberto por:** Grazi, na primeira tentativa de validação manual do T036
- **Componente:** backend `/ws` (`main.py`) + `google-genai` 2.29.0
- **Severidade:** bloqueante — impedia AC2.1, AC2.2 e AC2.3 (o pato nunca escutava)
- **Status:** corrigido e validado (ver [Validação](#validação))

---

## Título (resumo)

O backend encerra a sessão do Gemini Live ao fim de **cada turno** e o frontend reconecta automaticamente; toda reconexão abre sessão nova e reenvia o marcador `[convocação]` — o pato repete a saudação eternamente e nunca escuta a usuária (US2, rota `/ws`).

## Passos para reproduzir

### Reprodução original (app completo)

Estado inicial: `.env` com `GEMINI_API_KEY` real, portas 8000/8010 livres, nenhuma instância antiga rodando.

1. `cd frontend && SLEEP_AFTER_SECONDS=20 npm start`
2. `Cmd+Shift+D` em qualquer aplicativo → o pato aparece e fala a saudação.
3. Não fazer nada (ou falar com o pato).
4. Observar por ~30 s.

### Reprodução técnica (sem Electron, usada no diagnóstico)

1. Subir o backend isolado: `.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8010`
2. Conectar um cliente WebSocket em `ws://127.0.0.1:8010/ws` (biblioteca `websockets` do próprio venv).
3. Aguardar a saudação (~2 s de envelopes `gemini` com áudio/texto, terminando com `turn_complete`).
4. Enviar frames binários contínuos de PCM Int16 LE 16 kHz (320 bytes = 20 ms de áudio, um frame a cada 20 ms), imitando o microfone.
5. Ler os envelopes que chegam.

## Resultado esperado

Segundo o plano de tasks (T030) e o PRD (AC2.2, AC2.3):

- Uma **única** sessão por convocação; a saudação toca **uma vez**.
- Após o `turn_complete` da saudação, o backend continua escutando **na mesma sessão**; o status permanece "conectado".
- A conversa mantém contexto (AC2.2) e o pato reage à fala da usuária.
- O WebSocket só fecha no sono (`SLEEP_AFTER_SECONDS` de silêncio), no encerramento (US6) ou após a reconexão única por GoAway.

## Resultado atual (observado antes da correção)

- A saudação completa ("Quack! Tô aqui. Me conta: o que você tá estudando e em que ponto tá?") se repetia a cada ciclo de ~5–8 s, indefinidamente.
- O marcador de status na página alternava entre "conectado" e "desconectado" (o cliente reconectava com backoff de 1 s → 2 s → 4 s …).
- Nenhuma reação à fala da usuária.
- Na sonda técnica: `{"type": "turn_complete"}` seguido de `{"type": "error", "payload": {"reason": "session_lost"}}` **~150–450 ms depois do primeiro frame de áudio**; em seguida o servidor fechava o WebSocket (código 1000).

## Como o problema foi resolvido

### Investigação (tentativas, em ordem)

1. **Instrumentação do `main.py`.** O handler capturava `Exception` sem logar o traceback — primeira correção foi adicionar `logger.exception` + logs de INFO (conexão, primeiro frame de áudio, fim do loop com contagem de frames) e `logging.basicConfig` no `__main__`. Só com isso a "morte silenciosa" ficou visível como `end_reason="session_ended"` **sem** `go_away`.
2. **Sonda WS contra o `/ws` real** (passos da reprodução técnica acima): reproduziu o bug — a sessão caía logo depois que o áudio começava a chegar, com a saudação intacta antes disso. Provou que o problema não era captura/permissão de microfone (o áudio chegava ao servidor).
3. **Probe direto do SDK, sem FastAPI** (sequencial: marcador → aguardar `turn_complete` → só então enviar áudio → continuar ouvindo): a sessão **não** morreu. Isolou o problema para o meu caminho no servidor, não para o Google nem para o formato/mime do áudio. Observação lateral: o modelo não responde a ruído gaussiano sintético (o VAD não classifica como fala).
4. **Réplica concorrente do servidor** (duas tasks: loop de recepção + envio de áudio imediato, como o microfone real): o stream **terminava sozinho logo após o `TURN_COMPLETE`**, sem exceção nenhuma. Esse foi o gatilho identificado: o fim de iteração acontecia exatamente na fronteira do turno.
5. **Leitura do código do SDK** (`google/genai/live.py`): `receive()` é um iterador **por interação** — o gerador faz `break` quando `_is_interaction_complete(server_content)` é verdadeiro (`turn_complete` ou `interaction_status == IDLE`; linhas ~87–102 e ~470–475). A sessão e o WebSocket seguem vivos; apenas uma exceção (`ConnectionClosed` → `APIError` em `_receive`) significa queda real da conexão.

Hipóteses descartadas com evidência: flood de frames do mic (o bug reproduziu a 50 msg/s, taxa bem abaixo da real), formato/mime do áudio (o mesmo frame funcionou direto no SDK), permissão de microfone (o áudio chegava ao backend).

### Causa raiz

`pump_from_session` em `main.py` iterava `session.receive()` **uma única vez** e tratava o fim do gerador como morte da sessão (`end_reason="session_ended"` sem `go_away`) → envelope `session_lost` → fechamento do WebSocket → reconexão automática do `gemini-client.js` → novo handler com `greeted=False` → marcador `[convocação]` reenviado → nova saudação → loop. Como a sessão morria logo após o turno da saudação, nenhum turno da usuária chegava a completar — daí "não escuta".

### Correção aplicada

- **`main.py` — `pump_from_session`:** o `async for` ficou dentro de um `while True:` — ao fim de cada interação, `receive()` é chamado de novo (contrato do SDK 2.29). Só **exceção** define `end_reason="session_ended"`; o caminho de reconexão única por GoAway (que depende desse sinal) continua intacto.
- **`tests/test_ws_route.py` — `StubSession`:** o stub agora modela o contrato real do SDK: `hold_open=True` (default) bloqueia esperando a próxima interação (sessão viva); `hold_open=False` levanta exceção, como uma conexão caída. O teste de reconexão por GoAway usa `hold_open=False` explícito.
- **Logs permanentes** (diagnabilidade): `logger.exception` no handler; INFO em conexão do WS, primeiro frame de áudio e fim de loop com contagem de frames; `logging.basicConfig` no `__main__` para os logs aparecerem no console do Electron (`[python]`).

## Validação

1. Sonda técnica pós-correção (mesmos passos da reprodução): saudação → `turn_complete` → **nenhum** `session_lost`; ping no WebSocket respondeu 17 s depois — sessão e conexão sobreviveram à fronteira de turno.
2. `.venv/bin/python -m pytest -q` → **20 passed** (incluindo o teste de reconexão por GoAway com o stub no novo contrato).
3. Pendente (exige voz real): T036 completo — o VAD do Google não responde a ruído sintético, então a conversa só é verificável com a usuária falando.

## Referências

- PRD `rubber-duck-prd.md`: AC2.1–AC2.3, P6, E2/D10 (sono).
- `plano-de-tasks.md`: T030 (sessão real no `/ws`), bloco "Decisões US2".
- Código: `main.py` (`pump_from_session`), `tests/test_ws_route.py` (`StubSession`), `frontend/gemini-client.js` (reconexão automática que alimentava o loop).
- SDK: `google/genai/live.py` v2.29.0 — `receive()` (linhas ~448–475), `_is_interaction_complete` (~87–102), `_receive` (~549, converte `ConnectionClosed` em `APIError`).
- `CONTEXT.md`: termos "Sessão", "Turno", "Handle de resumption".
