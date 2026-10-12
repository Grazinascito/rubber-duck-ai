# Plano de tasks — Rubber Duck AI (POC)

- **Data:** 2026-10-12 · **Fontes:** PRD v1.6 + `pesquisa-tecnica.md` · **Detalhes** (assinaturas, nomes de testes, subtarefas): plano de implementação, depois da aprovação deste
- **Tags:** `[P]` = paralelizável · `[USx]` = story dona da task · `(depends on Txxx)` = dependência
- **Decisões embutidas** (motivos na pesquisa): Electron abre com `loadURL("http://127.0.0.1:8000")`, não `loadFile`; timer de sono (120 s) no backend via `input_audio_transcription`; `safety_settings` no padrão; modelo `gemini-3.8-live` via `.env`

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
- [ ] T008 [P] Integration test WS echo (JSON in → `echo` out) in `tests/test_ws_echo.py`
- [ ] T009 [P] Test static page contains connection marker in `tests/test_static.py`

### Implementation for Foundational

- [ ] T010 `main.py`: FastAPI app — `GET /health` + static mount serving `frontend/`
- [ ] T011 `main.py`: WebSocket `/ws` in echo mode; uvicorn bound to `127.0.0.1:8000`; loads `.env` (key required only from US2 on)
- [ ] T012 `frontend/main.js`: spawn Python (`python3`/`python` per platform), poll `/health`, `loadURL("http://127.0.0.1:8000")`, kill child on quit
- [ ] T013 `frontend/preload.js`: `contextBridge` with minimal summon/dismiss command channel
- [ ] T014 [P] `frontend/gemini-client.js`: WS client with reconnect + message-shape validation (check `type` before use)
- [ ] T015 [P] `frontend/index.html` + `frontend/duck.css`: minimal page showing "conectado"/"desconectado"
- [ ] T016 Electron security baseline: `contextIsolation` on, `nodeIntegration` off, sandbox, permission handler approving only `media`, CSP on served page

**Checkpoint**: `npm start` opens window showing "conectado"; quitting kills Python (`lsof -nP -i :8000` empty)

---

## Phase 3: User Story 1 - Convocar o pato (Priority: P1) 🎯 MVP

**Goal**: Global shortcut summons a draggable floating duck in any app; no voice yet

**Independent Test**: with any app focused: shortcut → duck appears in corner; drag works; shortcut again → duck hides

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

- [ ] T017 [P] [US1] Unit test state machine Oculto↔Visível on summon/dismiss in `frontend/duck-state-machine.test.js`

### Implementation for User Story 1

- [ ] T018 [US1] Create `frontend/duck-state-machine.js` — pure reducer, states Oculto/Visível (depends on T017)
- [ ] T019 [US1] `frontend/main.js`: floating window (`transparent`, `frame: false`, `hasShadow: false`, `alwaysOnTop`, corner position)
- [ ] T020 [US1] `frontend/main.js`: `globalShortcut` `CmdOrCtrl+Shift+D` toggle + IPC notify via preload
- [ ] T021 [US1] `frontend/duck.css` + `index.html`: drag region on duck, `no-drag` on icon area, transparent body
- [ ] T022 [US1] `frontend/main.js`: click-through via `setIgnoreMouseEvents(true, {forward: true})` + mouseenter/mouseleave
- [ ] T023 [US1] `frontend/main.js`: tray icon with Summon/Quit
- [ ] T024 [US1] `frontend/duck-states.js`: render as function of state + placeholder duck images in `frontend/images/`
- [ ] T025 [US1] Manual validation AC1.1–AC1.3 (macOS) + AC1.4 Windows smoke

**Checkpoint**: US1 works alone; foundation still green

---

## Phase 4: User Story 2 - Conversar por voz (Priority: P1) 🎯 MVP

**Goal**: Full voice loop with Gemini Live: talk/hear, session context, natural interruption, greeting on summon, sleep after long silence. Persona stays generic (US3)

**Independent Test**: summon → hear greeting; explain aloud → coherent answer; reply → context kept; speak over duck → it stops; 2 min silence → duck sleeps (zzz), mic off

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T026 [P] [US2] Unit test event→message mapping (`interrupted`, `turn_complete`, `gemini`, `user`) in `tests/test_message_mapping.py`
- [ ] T027 [P] [US2] Integration test `/ws` with stubbed Gemini session (audio reaches session; greeting trigger fired) in `tests/test_ws_route.py`
- [ ] T028 [P] [US2] Unit test pure sleep decision (`should_sleep(last_utterance, now, timeout)`) in `tests/test_sleep_decision.py`

### Implementation for User Story 2

- [ ] T029 [US2] Create `gemini_live.py`: `client.aio.live.connect` + `LiveConnectConfig` (model from env, `response_modalities=["AUDIO"]`, voice `Puck`, input/output transcription, sliding-window compression, session resumption, safety default) (depends on T026–T028)
- [ ] T030 [US2] `main.py`: `/ws` real session — audio bytes ↔ session, JSON messages out, resumption handle kept, single reconnect on GoAway
- [ ] T031 [US2] `main.py`: greeting trigger on connect (client-content marker "[convocação]")
- [ ] T032 [US2] Create `frontend/microphone-and-speaker.js` + `frontend/pcm-processor.js`: capture with explicit constraints (`echoCancellation` etc.), 16 kHz Int16 stream, 24 kHz queued playback, `interrupted` → stop playback
- [ ] T033 [US2] `frontend/duck-states.js`: Ouvindo/Pensando/Falando/Sleep states from messages; sleep closes WS
- [ ] T034 [US2] `main.py`: backend idle timer 120 s (env-configurable) since last user utterance → `sleep` message + session close
- [ ] T035 [US2] `frontend/main.js`: macOS mic permission (`systemPreferences.askForMediaAccess('microphone')`)
- [ ] T036 [US2] Manual validation AC2.1–AC2.3 (voice, context, interruption, sleep)

**Checkpoint**: US1+US2 = core demo loop working (convocar → conversar → interromper → dormir)

---

## Phase 5: User Story 3 - Comportamento rubber duck (Priority: P2)

**Goal**: System instruction turns generic voice into rubber duck mode: questions first, hypothesis marked as guess, teach-back, epistemic honesty (P1–P8)

**Independent Test**: scripted conversation per ACs: ask for answer → deferral (AC3.3); insist → marked hypothesis + teach-back (AC3.4/3.5); factual question → "não sei/olha a doc" (AC3.8); short one-at-a-time questions (AC3.1/3.2)

**⚠️ Requires PRD pendings Q1 (persona/falas) and Q3 (AC3.7) closed by product owner first**

### Tests for User Story 3 ⚠️

- No automated tests (language behavior not automatable within C1); manual script above is the test

### Implementation for User Story 3

- [ ] T037 [US3] Create `duck_instruction.py`: instruction from PRD 5.6 (persona, key lines, question bank, user's language) + summon marker mapping
- [ ] T038 [US3] Tune instruction across test sessions (C5: code, concept, article)
- [ ] T039 [US3] Verify R2/P7: every hypothesis marked as guess; unverifiable facts refused

**Checkpoint**: questionamento → hipótese → re-elaboração arc works; demo recordable (CS1)

---

## Phase 6: User Story 6 - Encerrar a sessão (Priority: P2)

**Goal**: Command ends session: short farewell, duck leaves screen, nothing captured after (privacy AC6.2)

**Independent Test**: during conversation, press end command → farewell plays, duck disappears, system mic indicator drops

### Tests for User Story 6 (OPTIONAL - only if tests requested) ⚠️

- [ ] T040 [P] [US6] Unit test state machine: active states → Encerrado on end event; no capture state after

### Implementation for User Story 6

- [ ] T041 [US6] Same global shortcut ends active session (toggle summon/dismiss) (depends on T020)
- [ ] T042 [US6] `frontend/duck-states.js`: teardown sequence — stop playback → `stop()` tracks → close WS → play local farewell audio → Oculto
- [ ] T043 [US6] Add farewell sound asset in `frontend/images/` (local audio, no API turn — deterministic, zero cost)
- [ ] T044 [US6] Manual validation AC6.1/AC6.2 (macOS mic indicator after end)

**Checkpoint**: full Fluxo A (convocar → conversar → encerrar) with privacy closed

---

## Phase 7: User Story 4 - Desligar a escuta (Priority: P3)

**Goal**: Mic icon toggles listening with permanent on-avatar mute indicator; re-enable plays "Quack!" (E8/D11)

**Independent Test**: click mic icon → permanent mute indicator; say marker word → no reaction/transcript; re-enable → "Quack!" and conversation resumes

### Tests for User Story 4 (OPTIONAL - only if tests requested) ⚠️

- [ ] T045 [P] [US4] Unit test state machine: enter/exit "Sem escuta"; indicator derived from state

### Implementation for User Story 4

- [ ] T046 [US4] `frontend/index.html` + `duck-states.js`: mic icon on hover, toggles listening
- [ ] T047 [US4] `frontend/microphone-and-speaker.js`: mute = `stop()` tracks; unmute = new `getUserMedia` with same constraints
- [ ] T048 [US4] Mute indicator on avatar while disabled + local `quack.mp3` on re-enable
- [ ] T049 [US4] Manual validation AC4.1–AC4.3 (marker-word privacy test)

---

## Phase 8: User Story 5 - Legendas (Priority: P3)

**Goal**: Caption icon shows/hides transcript of duck's speech anytime; voice has no off by design (D7)

**Independent Test**: caption on → text syncs with speech; toggle mid-speech → text hides, voice continues; re-enable → next lines shown

### Tests for User Story 5 (OPTIONAL - only if tests requested) ⚠️

- [ ] T050 [P] [US5] Unit test state machine: caption toggle independent of listening state (AC4.2)

### Implementation for User Story 5

- [ ] T051 [US5] `frontend/index.html` + `duck-states.js`: caption icon on hover, independent of mic icon
- [ ] T052 [US5] `frontend/duck.css`: caption box next to duck rendering `gemini` message text
- [ ] T053 [US5] Manual validation AC5.1/AC5.2

---

## Phase 9: User Story 7 - Instalar e testar no GitHub (Priority: P2, runs last)

**Goal**: Outsider installs and runs from README on macOS/Windows with own key (CS4)

**Independent Test**: clean-folder install following README (macOS); external person on Windows (R3 mitigation)

### Tests for User Story 7 ⚠️

- No new automated tests; clean install IS the test (checklist vs AC7.1–AC7.3)

### Implementation for User Story 7

- [ ] T054 [US7] README: prerequisites, venv, pip/npm install, `.env` with own key, `npm start`, shortcut, troubleshooting (port in use, mic permission, `python` vs `python3`)
- [ ] T055 [US7] README disclosures: voice sent to Google; free vs paid tier data use; 18+ (Gemini API terms); "duck can be wrong" (R2); own key = own data/billing (A6)
- [ ] T056 [US7] README section "what the duck cannot do" (C6: no search/screen/code access; hypothesis never verdict)
- [ ] T057 [US7] Choose repo license (open question Q5) + dead code cleanup + pinned deps check
- [ ] T058 [US7] Validation: clean install run (CS4)

---

## Phase 10: Polish (Final)

**Purpose**: POC acceptance wrap-up

- [ ] T059 Record demo video: convocar → explicar → destravar → encerrar, in PT-BR (CS1)
- [ ] T060 Measure cost per session from API usage data (CS2; closes open billing question empirically)
- [ ] T061 Short adversarial safety test: request prohibited/offensive content, record behavior
- [ ] T062 Long session test: coherence with sliding-window compression (E6)
- [ ] T063 Full AC checklist pass

---

## Dependencies & Execution Order

- **Setup → Foundational**: Foundational blocks ALL stories
- **US1 (P1)**: after Foundational; no story dependencies
- **US2 (P1)**: after Foundational (e2e test uses US1's summon)
- **US3 (P2)**: depends on US2 + PRD Q1/Q3 closed
- **US6 (P2)**: depends on US2 (+US1 shortcut)
- **US4 (P3)** / **US5 (P3)**: depend on US2; independent of each other
- **US7 (P2)**: after all stories included in the public repo
- **Polish**: after all desired stories
- Regression rule: after each story, re-run previous stories' independent tests

## Open questions (before implementation plan)

1. Confirm `loadFile` → `loadURL` reversal (Phase 2; only change to an approved decision)
2. Sleep silence: 120 s OK?
3. Shortcut: `CmdOrCtrl+Shift+D` OK?
4. Duck voice: `Puck` (decide in first US2 test session)
5. Repo license: MIT / Apache-2.0 / none
6. PRD Q1/Q3 (persona, AC3.7) — product owner closes before Phase 5
