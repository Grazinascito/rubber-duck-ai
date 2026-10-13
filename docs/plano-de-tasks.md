# Plano de tasks — Rubber Duck AI (POC)

- **Data:** 2026-10-12 · **Fontes:** PRD (v1.6 na origem; emendas até a v1.8) + `pesquisa-tecnica.md` · **Detalhes** (assinaturas, nomes de testes, subtarefas): plano de implementação, depois da aprovação deste
- **Tags:** `[P]` = paralelizável · `[USx]` = story dona da task · `(depends on Txxx)` = dependência
- **Decisões embutidas** (motivos na pesquisa): Electron abre com `loadURL("http://127.0.0.1:8000")`, não `loadFile`; timer de sono (80 s) no backend via `input_audio_transcription`; `safety_settings` no padrão; modelo `gemini-3.8-live` via `.env`
- **Reestruturação (2026-10-12, a pedido da PO)**: nova **US8 — Identidade do pato (visual + fala)**, antes da US4. A autoria da system instruction (`duck_instruction.py`) mudou da US3 para a US8; a US3 ficou com ajuste fino e validação do comportamento e passou a depender da US8. A US6 subiu uma fase para acomodar a ordem.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Init git repo + `.gitignore` (`.env`, `node_modules/`, `.venv/`, `__pycache__/`)
- [ ] T002 Create Python venv + `requirements.txt` pinned (fastapi, uvicorn, google-genai, python-dotenv; dev: pytest)
- [ ] T003 [P] Create `frontend/package.json` (electron devDep; scripts `start`, `test`) + `npm install`
- [ ] T004 [P] Create `.env.example` (`GEMINI_API_KEY=`, `MODEL_ID=gemini-3.8-live`) + `.env` local
- [ ] T005 Create folder skeleton per approved structure (`frontend/`, `frontend/images/`) with empty files
- [ ] T006 [P] Create README stub (title + one line; full README is US7)

**Checkpoint**: installs OK; `pytest` e `npm test` verdes com teste placeholder; `git status` não lista `.env`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: End-to-end skeleton every story uses: Electron spawns Python, window loads FastAPI page, WebSocket echoes, security baseline on. No Gemini yet (echo works without API key).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T007 [P] Contract test `/health` returns 200 in `tests/test_health.py`
- [ ] ~~T008 [P] Integration test WS echo (JSON in → `echo` out) in `tests/test_ws_echo.py`~~ **removido na US2**: o echo foi substituído pela sessão real; `/ws` passa a ser coberto por T027
- [ ] T009 [P] Test static page serves the duck UI in `tests/test_static.py` — **emendado (PO, 2026-10-12)**: o marcador de conexão saiu da página (vira log no terminal, encaminhado pelo main); o teste agora cobre avatar + control-pill

### Implementation for Foundational

- [ ] T010 `main.py`: FastAPI app — `GET /health` + static mount serving `frontend/`
- [ ] T011 `main.py`: WebSocket `/ws` in echo mode; uvicorn bound to `127.0.0.1:8000`; loads `.env` (key required only from US2 on)
- [ ] T012 `frontend/main.js`: spawn Python (`python3`/`python` per platform), poll `/health`, `loadURL("http://127.0.0.1:8000")`, kill child on quit
- [ ] T013 `frontend/preload.js`: `contextBridge` with minimal summon/dismiss command channel
- [ ] T014 [P] `frontend/gemini-client.js`: WS client with reconnect + message-shape validation (check `type` before use)
- [x] ~~T015 [P] `frontend/index.html` + `frontend/duck.css`: minimal page showing "conectado"/"desconectado"~~ — **emendado (PO, 2026-10-12, decisão #9)**: página mínima SEM marcador de conexão (avatar + pílula; status de conexão só no terminal) — coberto por T009
- [ ] T016 Electron security baseline: `contextIsolation` on, `nodeIntegration` off, sandbox, permission handler approving only `media`, CSP on served page

**Checkpoint**: `npm start` abre a janela com a UI do pato (status de conexão só no terminal); quitting kills Python (`lsof -nP -i :8000` empty)

---

## Phase 3: User Story 1 - Convocar o pato (Priority: P1) 🎯 MVP

**Goal**: Global shortcut summons a draggable floating duck in any app; avatar mechanism (img + render as function of state); no voice yet. Per-state art and icon bar belong to US8.

**Independent Test**: with any app focused: shortcut → duck appears in corner; drag works; shortcut again → duck hides

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

- [x] T017 [P] [US1] Unit test state machine Oculto↔Visível on summon/dismiss in `frontend/duck-state-machine.test.js`

### Implementation for User Story 1

- [x] T018 [US1] Create `frontend/duck-state-machine.js` — pure reducer, states Oculto/Visível (depends on T017)
- [x] T019 [US1] `frontend/main.js`: floating window (`transparent`, `frame: false`, `hasShadow: false`, `alwaysOnTop`, corner position)
- [x] T020 [US1] `frontend/main.js`: `globalShortcut` `CmdOrCtrl+Shift+D` toggle + IPC notify via preload
- [x] T021 [US1] `frontend/duck.css` + `index.html`: drag region on duck, transparent body
- [x] T022 [US1] `frontend/main.js`: click-through via `setIgnoreMouseEvents(true, {forward: true})` + mouseenter/mouseleave
- [x] T023 [US1] `frontend/main.js`: tray icon with Summon/Quit
- [x] T024 [US1] `frontend/duck-states.js` + `index.html`: `<img id="duck-avatar">` rendered as function of state, single placeholder image in `frontend/images/`
- [ ] T025 [US1] Manual validation AC1.1–AC1.3 (macOS) + AC1.4 Windows smoke

**Checkpoint**: US1 works alone; foundation still green

---

## Phase 4: User Story 2 - Conversar por voz (Priority: P1) 🎯 MVP

**Goal**: Full voice loop with Gemini Live: talk/hear, session context, natural interruption, sleep after long silence. The duck never initiates — the user starts every conversation (PRD v1.7). Persona stays generic (US8 delivers identity/instruction)

**Independent Test**: summon → duck listens (no greeting); speak → coherent answer; reply → context kept; speak over duck → it stops; 80 s of silence → duck sleeps (zzz), mic off

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [x] T026 [P] [US2] Unit test event→message mapping (`interrupted`, `turn_complete`, `gemini`, `user`) in `tests/test_message_mapping.py`
- [x] T027 [P] [US2] Integration test `/ws` with stubbed Gemini session (audio reaches session; greeting trigger fired) in `tests/test_ws_route.py`
- [x] T028 [P] [US2] Unit test pure sleep decision (`should_sleep(last_utterance, now, timeout)`) in `tests/test_sleep_decision.py`

### Implementation for User Story 2

- [x] T029 [US2] Create `gemini_live.py`: `client.aio.live.connect` + `LiveConnectConfig` (model from env, `response_modalities=["AUDIO"]`, voice `Puck`, input/output transcription, sliding-window compression, session resumption, safety default) (depends on T026–T028)
- [x] T030 [US2] `main.py`: `/ws` real session — audio bytes ↔ session, JSON messages out, resumption handle kept, single reconnect on GoAway
- [ ] ~~T031 [US2] `main.py`: greeting trigger on connect (client-content marker "[convocação]")~~ **removido (PO, 2026-10-12, PRD v1.7)**: o pato nunca inicia a conversa — a sessão abre apenas escutando; quem fala primeiro é a usuária
- [x] T032 [US2] Create `frontend/microphone-and-speaker.js` + `frontend/pcm-processor.js`: capture with explicit constraints (`echoCancellation` etc.), 16 kHz Int16 stream, 24 kHz queued playback, `interrupted` → stop playback
- [x] T033 [US2] `frontend/duck-states.js`: Ouvindo/Pensando/Falando/Sleep states from messages + sleep closes WS (depends on T024)
- [x] T034 [US2] `main.py`: backend idle timer 80 s (env-configurable, `SLEEP_AFTER_SECONDS`) since last user utterance → `sleep` message + session close
- [x] T035 [US2] `frontend/main.js`: macOS mic permission (`systemPreferences.askForMediaAccess('microphone')`)
- [x] T036 [US2] Manual validation AC2.1–AC2.3 (voice, context, interruption, sleep)

**Decisões US2 (revisão de código 2026-10-12, spec↔código alinhados):**
- **Saudação removida (PO, 2026-10-12, PRD v1.7)**: quem inicia a comunicação é a usuária (P6 sem exceção); instrução placeholder (`DUCK_INSTRUCTION` em `gemini_live.py`) proíbe sons de pato/quack — persona final na US8/T046
- `DUCK_VOICE` no `.env` (default `Puck`) — troca de voz sem tocar código (avaliar no T036)
- ~~`GREETING_INSTRUCTION` placeholder em `gemini_live.py` — mínimo para o marcador da T031 produzir saudação; US8/T046 substitui~~ → virou `DUCK_INSTRUCTION` (sem marcador, sem quack); US8/T046 substitui
- Envelopes de erro `session_lost`/`session_failed` além dos 4 tipos da T026 — falha de sessão/reconexão avisada ao cliente
- Ação `USER_SPEAKING` no reducer (no-op) — gatilho explícito para a arte por estado da US8
- Timer de sono reseta com transcrição vazia também (ASR falhando ≠ silêncio, E5); atalho acorda do SLEEP (PRD 5.5)

**Checkpoint**: US1+US2 = core demo loop working (convocar → conversar → interromper → dormir)

---

## Phase 5: ~~User Story 6 - Encerrar a sessão~~ (DISSOLVIDA — PO, 2026-10-12)

**Motivo**: a US2 já entregou o teardown completo — o atalho durante a conversa para playback/captura, fecha o WS e esconde o pato (`frontend/duck-states.js`: `closeSession` + handler do atalho); privacidade AC6.2 fechada. Sem farewell em áudio local. "Encerrado" deixa de ser estado (todo encerramento leva a Oculto); T037–T041 removidas. F7/AC6.x do PRD ajustados no redraft v1.8 (2026-10-13); persona/falas (5.6) ficam para a v1.9.

**Checkpoint**: absorvido pela US2 (atalho encerra a sessão e o pato some)

---

## Phase 6: User Story 8 - Identidade do pato: visual e fala (Priority: P2) 🆕

**Goal**: The duck's identity in one place: one image per state (estados do PRD 5.5 com arte: Ouvindo, Pensando, Falando, Sleep "zzz"; Sem escuta usa a arte base — o indicador de mudo chega com o toggle na US4), icon bar below the duck (sempre visível; comporta microfone e legenda), arte final da PO (assets em `frontend/images/`), and the duck's system instruction (`duck_instruction.py` from PRD 5.6 — persona, falas-chave)

**Independent Test**: unit-test drive the state machine through all states → each maps to its image file; pílula de controles sempre visível abaixo do pato; conversa curta → falas seguem as falas-chave do PRD (ensaio A5)

**⚠️ Gate T046: ajustes da PO no PRD 5.6 primeiro (ela manda as mudanças → redraft v1.9 → aprovação). Q3/AC3.7 fechado (PO, 2026-10-12): o pato não escreve código por você — hipótese sempre em conceito. No v1.9 também se decide se a fala "Despedida" fica (inalcançável sem a US6)**

### Tests for User Story 8 (OPTIONAL - only if tests requested) ⚠️

- [x] T042 [P] [US8] Unit test `imageForState` in `frontend/duck-states.test.js` — OUVINDO→`pato.png`, PENSANDO→`pato-thinking.png`, FALANDO→`pato.png`, SLEEP→`pato-sleep.png`; null para Oculto (sem Encerrado — US6 dissolvida); arquivos existem em disco

### Implementation for User Story 8

- [x] T043 [US8] `frontend/index.html` + `duck.css`: icon-bar container below the duck — **emendado (PO, 2026-10-12)**: pílula `control-pill` SEMPRE visível (não só no hover), com o design dela (mic `is-on` âmbar, legendas `is-off` cinza, divisor, glass), SVG inline; botões seguem inertes até US4/US5
- [x] T044 [US8] `frontend/duck-states.js`: `imageForState` mapping wired into the render function; `id="duck-avatar"` no img; placeholders antigos (`duck-idle.png`, `generate-placeholders.py`) removidos (depends on T024, T033, T042)
- [x] T045 [US8] **cumprido pelos assets da PO (2026-10-12)**: `pato.png` / `pato-thinking.png` / `pato-sleep.png` em `frontend/images/` (set consistente, fundo transparente; Sem escuta = arte base; ícones da icon bar = SVG inline — T043) + `pato-talk-1.png` / `pato-talk-2.png` (bico animado — T075)
- [ ] T046 [US8] GATED: redraft do PRD 5.6 (v1.9) primeiro → criar `duck_instruction.py` (persona, falas-chave, question bank, idioma; Q3 mantido: nunca código pronto) → plugar no `LiveConnectConfig` via import em `gemini_live.py` (depends on T029, gate 5.6)
- [x] T047 [US8] **cumprido pelos assets da PO** (substitui a referência Stitch); troca estado→imagem verificada via T042
- [ ] T048 [US8] Manual validation: visual checklist per state + greeting/falas-chave read-through (ensaio curto, A5)
- [x] T075 [US8] **absorvido fora do plano (commit 5fe0165, 2026-10-12)**: `frontend/duck-talk-animator.js` + `pato-talk-1/2.png` — bico sincronizado com a voz (RMS do playback troca o `src` do avatar); testes em `frontend/duck-talk-animator.test.js` e `frontend/duck-states.test.js`; documentado no README

**Checkpoint**: duck has full identity — per-state visuals, icon bar, final art, persona/falas loaded

---

## Phase 7: User Story 3 - Comportamento rubber duck (Priority: P2)

**Goal**: Validate and tune the duck's behavior against P1–P8: questions first, hypothesis marked as guess, teach-back, epistemic honesty. Instruction authored in US8; this story tunes it.

**Independent Test**: scripted conversation per ACs: ask for answer → deferral (AC3.3); insist → marked hypothesis + teach-back (AC3.4/3.5); factual question → "não sei/olha a doc" (AC3.8); short one-at-a-time questions (AC3.1/3.2)

### Tests for User Story 3 ⚠️

- No automated tests (language behavior not automatable within C1); manual script above is the test

### Implementation for User Story 3

- [ ] T049 [US3] Tune `duck_instruction.py` across test sessions until AC3.1–AC3.8 hold (C5: code, concept, article) (depends on T046)
- [ ] T050 [US3] Verify R2/P7: every hypothesis marked as guess; unverifiable facts refused

**Checkpoint**: questionamento → hipótese → re-elaboração arc works; demo recordable (CS1)

---

## Phase 8: User Story 4 - Desligar a escuta (Priority: P3)

**Goal**: Mic icon toggles listening with permanent mute indicator; re-enable silently reopens the mic (no sound — decision #12). NEW (PO, 2026-10-12): dragging the sleeping duck wakes it — mic reopens with the new session

**Independent Test**: click mic icon → permanent mute indicator; say marker word → no reaction/transcript; re-enable → conversation RESUMES in the SAME session, no sound played (sleep timer paused while muted — decision #11); sleeping duck → drag it → duck wakes listening (mic dot on); sleeping duck → click the mic button → duck wakes listening (decisão #13)

### Tests for User Story 4 (OPTIONAL - only if tests requested) ⚠️

- [x] T051 [P] [US4] Unit test state machine: enter/exit "Sem escuta"; indicator derived from state
- [x] T070 [P] [US4] Unit test state machine: `DUCK_GRABBED` in SLEEP → wake (mesma transição do atalho); em estados ativos/mutados → sem mudança de estado (arrastar NUNCA desmuta)

### Implementation for User Story 4

- [x] T052 [US4] `frontend/index.html` + `duck-states.js`: mic icon inside icon bar, toggles listening (depends on T043) — estados visuais prontos na US8 (2026-10-12): `is-on` âmbar / `is-muted` cinza + glyph `mic_off`; US4 só alterna a classe no mudo real
- [x] T053 [US4] `frontend/microphone-and-speaker.js`: mute = `stop()` tracks; unmute = new `getUserMedia` with same constraints
- [x] T054 [US4] Mute indicator: pílula sempre visível com `is-muted` + glyph `mic_off` (PO confirmou que o CSS/SVG da US8 bastam — sem overlay no avatar). ~~Local `quack.mp3` ao religar~~ — **sem som ao religar** (decisão #12)
- [x] T071 [US4] `frontend/main.js`: arrasto-acorda — listener de movimento da janela (verificar `move` × `moved` por plataforma, spike 15 min) enquanto SLEEP → dispara o caminho de wake existente (IPC p/ renderer)
- [x] T072 [US4] `frontend/duck-states.js`: rotear o wake-por-arrasto como o do atalho; arrasto não desmuta pato acordado; **sem clique-no-pato** (cliques em região de arrasto são não-confiáveis no Electron — decisão 2026-10-12)
- [ ] T055 [US4] Manual validation AC4.1–AC4.3 (marker-word privacy test) + arrasto-acorda do SLEEP (mic liga ao acordar)
- [x] T073 [US4] `main.py`: receber `{"type":"muted","payload":{"value":true|false}}` do cliente → **pausar o watchdog de sono enquanto mutado** e retomar ao desmutar (decisão #11: mudo explícito mantém a sessão viva — custo ~zero, sem áudio enviado; sono só dispara por inatividade com microfone ligado) — **emendado (PO, 2026-10-12)**: shape com `payload`, conforme o envelope do CONTEXT.md (code review)
- [x] T074 [P] [US4] Test in `tests/test_ws_route.py`: watchdog NÃO dispara enquanto `muted`; após desmutar + timeout, dispara
- [x] T076 [US4] Teste em `frontend/duck-states.test.js`: clicar o botão de microfone no SLEEP acorda o pato (mesma transição do atalho) — cobre a decisão #13

---

## Phase 9: User Story 5 - Legendas (Priority: P3)

**Goal**: Caption icon shows/hides transcript of duck's speech anytime; voice has no off by design (D7)

**Independent Test**: caption on → text syncs with speech; toggle mid-speech → text hides, voice continues; re-enable → next lines shown

### Tests for User Story 5 (OPTIONAL - only if tests requested) ⚠️

- [ ] T056 [P] [US5] Unit test state machine: caption toggle independent of listening state (AC4.2)

### Implementation for User Story 5

- [ ] T057 [US5] `frontend/index.html` + `duck-states.js`: caption icon inside icon bar, independent of mic icon (depends on T043)
- [ ] T058 [US5] `frontend/duck.css`: caption box next to duck rendering `gemini` message text
- [ ] T059 [US5] Manual validation AC5.1/AC5.2

---

## Phase 10: User Story 7 - Instalar e testar no GitHub (Priority: P2, runs last)

**Goal**: Outsider installs and runs from README on macOS/Windows with own key (CS4)

**Independent Test**: clean-folder install following README (macOS); external person on Windows (R3 mitigation)

### Tests for User Story 7 ⚠️

- No new automated tests; clean install IS the test (checklist vs AC7.1–AC7.3)

### Implementation for User Story 7

- [ ] T060 [US7] README: prerequisites, venv, pip/npm install, `.env` with own key, `npm start`, shortcut, troubleshooting (port in use, mic permission, `python` vs `python3`)
- [ ] T061 [US7] README disclosures: voice sent to Google; free vs paid tier data use; 18+ (Gemini API terms); "duck can be wrong" (R2); own key = own data/billing (A6)
- [ ] T062 [US7] README section "what the duck cannot do" (C6: no search/screen/code access; hypothesis never verdict)
- [ ] T063 [US7] Add MIT LICENSE (PO's pick, 2026-10-12) + dead code cleanup + pinned deps check
- [ ] T064 [US7] Validation: clean install run (CS4)

---

## Phase 11: Polish (Final)

**Purpose**: POC acceptance wrap-up

- [ ] T065 Record demo video: convocar → explicar → destravar → encerrar, in PT-BR (CS1)
- [ ] T066 Measure cost per session from API usage data (CS2; closes open billing question empirically)
- [ ] T067 Short adversarial safety test: request prohibited/offensive content, record behavior
- [ ] T068 Long session test: coherence with sliding-window compression (E6)
- [ ] T069 Full AC checklist pass

---

## Dependencies & Execution Order

- **Setup → Foundational**: Foundational blocks ALL stories
- **US1 (P1)**: after Foundational; no story dependencies
- **US2 (P1)**: after Foundational (e2e test uses US1's summon)
- **US6**: dissolvida (2026-10-12) — teardown absorvido pela US2; sem farewell local
- **US8 (P2)**: depends on US1 + US2 (avatar mechanism + states); gate: ajustes da PO no 5.6 (Q3 fechado: pato não escreve código)
- **US3 (P2)**: depends on US8 (instruction authored there) — runs AFTER US8
- **US4 (P3)** / **US5 (P3)**: depend on US2 + US8 (icon bar); independent of each other
- **US7 (P2)**: after all stories included in the public repo
- **Polish**: after all desired stories
- Regression rule: after each story, re-run previous stories' independent tests

## Decisões fechadas (respostas da PO, 2026-10-12)

1. ✅ `loadURL` no lugar de `loadFile` — já em vigor (Fase 2 implementada e conectando)
2. ✅ Silêncio até o sono (E2): **80 s**, variável `SLEEP_AFTER_SECONDS` no `.env`
3. ✅ Atalho: `CmdOrCtrl+Shift+D` — em vigor no macOS (AC1.1 confirmado); conferir no Windows na US7
4. ✅ Voz do pato: **Puck**
5. ✅ Licença do repositório: **MIT**
6. ✅ US6 dissolvida (2026-10-12): teardown já entregue pela US2; sem farewell em áudio local; "Encerrado" deixa de existir
7. ✅ Q3/AC3.7 mantido (2026-10-12): o pato não escreve código por você; hipótese sempre em conceito
8. ✅ Arte final da US8: assets da PO (`pato.png`, `pato-thinking.png`, `pato-sleep.png` + `pato-talk-1.png`/`pato-talk-2.png` — T075) substituem placeholders e a referência Stitch
9. ✅ Badge de conexão sai da UI; estado de conexão só no terminal (PO, 2026-10-12). Pílula de controles sempre visível com o design da PO (mic âmbar / legendas cinza)
10. ✅ **Arrasto-acorda (PO, 2026-10-12, parte da US4 — T070–T072):** arrastar o pato no estado SLEEP acorda (mic liga com a sessão nova); arrastar pato acordado NUNCA desmuta (gesto frequente, dessilêncio acidental); sem clique-no-pato (região de arrasto não entrega clique confiável no Electron). Voz-wake ("ei pato") rejeitado para a POC: exigiria microfone sempre ativo (custo/privacidade/dependência) — candidato de MVP
11. ✅ **Mudo explícito ≠ silêncio (PO, 2026-10-12, US4 — T073/T074):** mutar pelo ícone mantém a sessão viva indefinidamente (pausa declarada; custo ~zero — sem áudio enviado, nenhum token). O sono (E2) só dispara por inatividade **com microfone ligado**. O backend passa a saber do mudo (mensagem `muted` no WS) e pausa o watchdog. A tabela de estados do PRD já dizia isso ("Sem escuta" sai por toggle ou encerramento) — v1.8 só ganha uma linha de esclarecimento
12. ✅ **Sem quack nenhum (PO, 2026-10-12):** nenhum som de quack existe no produto. E8/D11 (Quack! ao religar o microfone) **revogado** — a confirmação de que a escuta voltou é o indicador visual (pílula âmbar `is-on`). As falas "Quack! Foi você que achou" (comemoração) e "Quack. Boa sessão" (despedida) saem no redraft v1.8 do PRD (E8, falas-chave 5.6 e D11)
13. ✅ **Botão-acorda (PO, ratifica em 2026-10-13 o já implementado; US4):** o botão de microfone da pílula acorda o pato do SLEEP — mesma transição do atalho/arrasto (wiring em `duck-states.js`; o reducer mantém MIC_TOGGLED como no-op no SLEEP). PRD: D15. Teste: T076.

## Ainda abertas

- **PRD Q1** (persona e falas-chave, seção 5.6) → **v1.9**: PO manda os ajustes → agente redige a v1.9 → aprovação antes do T046 (US8); no mesmo redraft decide-se se a fala "Despedida" fica (inalcançável sem a US6). Gate do T046 inalterado.
- **Fechadas no v1.8 mecânico do PRD (2026-10-13)** — tudo com decisão já tomada: US6 dissolvida no PRD (estado Encerrado, F7, Fluxo C e bloco US6 removidos; AC6.2 reescrita como AC2.4), quacks eliminados (E8/D11 revogados — D17; falas reescritas sem "Quack!"), exceção do P6 removida, Q3 fechado na 10.1, indicador de mudo na pílula (AC4.3/E4), saídas do Sleep = atalho/arrasto/botão de microfone (D15; decisões #10 e #13), mudo ≠ silêncio (D16; decisão #11), D15–D17 registradas no apêndice A, CS4→CS3, referência Stitch substituída pela arte da PO, E2 fixa 80 s (`SLEEP_AFTER_SECONDS`), citação ao PRD v0.6 corrigida (arquivo não existe no repositório)
