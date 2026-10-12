"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  DUCK_STATES,
  initialDuckState,
  duckReducer,
} = require("./duck-state-machine.js");

test("starts in OCULTO on a fresh app launch", () => {
  assert.deepEqual(initialDuckState(), { status: DUCK_STATES.OCULTO });
});

test("SUMMON transitions OCULTO to FALANDO because the greeting plays on connect", () => {
  const next = duckReducer({ status: DUCK_STATES.OCULTO }, { type: "SUMMON" });

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO });
});

test("SUMMON transitions SLEEP to FALANDO for a new session", () => {
  const next = duckReducer({ status: DUCK_STATES.SLEEP }, { type: "SUMMON" });

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO });
});

test("DISMISS transitions any active state to OCULTO", () => {
  for (const status of [
    DUCK_STATES.OUVINDO,
    DUCK_STATES.PENSANDO,
    DUCK_STATES.FALANDO,
    DUCK_STATES.SLEEP,
  ]) {
    const next = duckReducer({ status }, { type: "DISMISS" });

    assert.deepEqual(next, { status: DUCK_STATES.OCULTO });
  }
});

test("SHORTCUT_PRESSED summons the duck when it is OCULTO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OCULTO },
    { type: "SHORTCUT_PRESSED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO });
});

test("SHORTCUT_PRESSED hides the duck during an active conversation", () => {
  for (const status of [
    DUCK_STATES.OUVINDO,
    DUCK_STATES.PENSANDO,
    DUCK_STATES.FALANDO,
  ]) {
    const next = duckReducer({ status }, { type: "SHORTCUT_PRESSED" });

    assert.deepEqual(next, { status: DUCK_STATES.OCULTO });
  }
});

test("SHORTCUT_PRESSED wakes the duck from SLEEP into a new session", () => {
  const next = duckReducer({ status: DUCK_STATES.SLEEP }, { type: "SHORTCUT_PRESSED" });

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO });
});

test("DUCK_TURN_END transitions FALANDO to OUVINDO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.FALANDO },
    { type: "DUCK_TURN_END" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO });
});

test("INTERRUPTED transitions FALANDO to OUVINDO", () => {
  const next = duckReducer({ status: DUCK_STATES.FALANDO }, { type: "INTERRUPTED" });

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO });
});

test("USER_TURN_END transitions OUVINDO to PENSANDO", () => {
  const next = duckReducer({ status: DUCK_STATES.OUVINDO }, { type: "USER_TURN_END" });

  assert.deepEqual(next, { status: DUCK_STATES.PENSANDO });
});

test("USER_SPEAKING keeps OUVINDO unchanged", () => {
  const next = duckReducer({ status: DUCK_STATES.OUVINDO }, { type: "USER_SPEAKING" });

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO });
});

test("DUCK_AUDIO transitions PENSANDO to FALANDO", () => {
  const next = duckReducer({ status: DUCK_STATES.PENSANDO }, { type: "DUCK_AUDIO" });

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO });
});

test("SLEEP transitions an active state to SLEEP", () => {
  const next = duckReducer({ status: DUCK_STATES.OUVINDO }, { type: "SLEEP" });

  assert.deepEqual(next, { status: DUCK_STATES.SLEEP });
});

test("returns the state unchanged for an unknown action", () => {
  const state = { status: DUCK_STATES.PENSANDO };
  const next = duckReducer(state, { type: "SOMETHING_ELSE" });

  assert.deepEqual(next, { status: DUCK_STATES.PENSANDO });
});
