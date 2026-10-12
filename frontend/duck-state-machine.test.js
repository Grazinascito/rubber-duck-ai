"use strict";

const test = require("node:test");
const assert = require("node:assert");
const {
  DUCK_STATES,
  initialDuckState,
  duckReducer,
  isMicOff,
} = require("./duck-state-machine.js");

test("starts in OCULTO on a fresh app launch", () => {
  assert.deepEqual(initialDuckState(), {
    status: DUCK_STATES.OCULTO,
    isMuted: false,
  });
});

test("SUMMON transitions OCULTO to OUVINDO because the duck only listens", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OCULTO, isMuted: false },
    { type: "SUMMON" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("SUMMON transitions SLEEP to OUVINDO for a new session", () => {
  const next = duckReducer(
    { status: DUCK_STATES.SLEEP, isMuted: false },
    { type: "SUMMON" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("DISMISS transitions any active state to OCULTO", () => {
  for (const status of [
    DUCK_STATES.OUVINDO,
    DUCK_STATES.PENSANDO,
    DUCK_STATES.FALANDO,
    DUCK_STATES.SLEEP,
  ]) {
    const next = duckReducer({ status, isMuted: false }, { type: "DISMISS" });

    assert.deepEqual(next, { status: DUCK_STATES.OCULTO, isMuted: false });
  }
});

test("SHORTCUT_PRESSED summons the duck when it is OCULTO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OCULTO, isMuted: false },
    { type: "SHORTCUT_PRESSED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("SHORTCUT_PRESSED hides the duck during an active conversation", () => {
  for (const status of [
    DUCK_STATES.OUVINDO,
    DUCK_STATES.PENSANDO,
    DUCK_STATES.FALANDO,
  ]) {
    const next = duckReducer(
      { status, isMuted: false },
      { type: "SHORTCUT_PRESSED" }
    );

    assert.deepEqual(next, { status: DUCK_STATES.OCULTO, isMuted: false });
  }
});

test("SHORTCUT_PRESSED wakes the duck from SLEEP into a new session", () => {
  const next = duckReducer(
    { status: DUCK_STATES.SLEEP, isMuted: false },
    { type: "SHORTCUT_PRESSED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("DUCK_TURN_END transitions FALANDO to OUVINDO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.FALANDO, isMuted: false },
    { type: "DUCK_TURN_END" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("INTERRUPTED transitions FALANDO to OUVINDO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.FALANDO, isMuted: false },
    { type: "INTERRUPTED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("USER_TURN_END transitions OUVINDO to PENSANDO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: false },
    { type: "USER_TURN_END" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.PENSANDO, isMuted: false });
});

test("USER_SPEAKING keeps OUVINDO unchanged", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: false },
    { type: "USER_SPEAKING" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("DUCK_AUDIO transitions PENSANDO to FALANDO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.PENSANDO, isMuted: false },
    { type: "DUCK_AUDIO" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO, isMuted: false });
});

test("DUCK_AUDIO transitions OUVINDO to FALANDO when audio arrives without a seen user turn end", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: false },
    { type: "DUCK_AUDIO" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.FALANDO, isMuted: false });
});

test("SLEEP transitions an active state to SLEEP", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: false },
    { type: "SLEEP" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.SLEEP, isMuted: false });
});

test("returns the state unchanged for an unknown action", () => {
  const state = { status: DUCK_STATES.PENSANDO, isMuted: true };
  const next = duckReducer(state, { type: "SOMETHING_ELSE" });

  assert.deepEqual(next, { status: DUCK_STATES.PENSANDO, isMuted: true });
});

// T051 — "Sem escuta" as a derived condition: the mute lives once, in
// state.isMuted; the pill button and art derive from it.

test("muting in OUVINDO enters Sem escuta and unmuting leaves it", () => {
  const muted = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: false },
    { type: "MIC_TOGGLED" }
  );
  assert.deepEqual(muted, { status: DUCK_STATES.OUVINDO, isMuted: true });

  const unmuted = duckReducer(muted, { type: "MIC_TOGGLED" });
  assert.deepEqual(unmuted, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("muting during FALANDO keeps the speech and falls into Sem escuta when the turn ends", () => {
  const speaking = duckReducer(
    { status: DUCK_STATES.FALANDO, isMuted: false },
    { type: "MIC_TOGGLED" }
  );
  assert.deepEqual(speaking, { status: DUCK_STATES.FALANDO, isMuted: true });

  const turnEnded = duckReducer(speaking, { type: "DUCK_TURN_END" });
  assert.deepEqual(turnEnded, { status: DUCK_STATES.OUVINDO, isMuted: true });
});

test("MIC_TOGGLED changes nothing while OCULTO or SLEEP", () => {
  for (const status of [DUCK_STATES.OCULTO, DUCK_STATES.SLEEP]) {
    const state = { status, isMuted: false };
    const next = duckReducer(state, { type: "MIC_TOGGLED" });
    assert.deepEqual(next, state);
  }
});

test("backend sleep resets the mute so waking reopens the mic", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OUVINDO, isMuted: true },
    { type: "SLEEP" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.SLEEP, isMuted: false });
});

test("the mic indicator derives from state instead of being stored twice", () => {
  assert.equal(isMicOff({ status: DUCK_STATES.OUVINDO, isMuted: true }), true);
  assert.equal(isMicOff({ status: DUCK_STATES.OUVINDO, isMuted: false }), false);
  assert.equal(isMicOff({ status: DUCK_STATES.FALANDO, isMuted: true }), true);
  assert.equal(isMicOff({ status: DUCK_STATES.SLEEP, isMuted: false }), true);
  assert.equal(isMicOff({ status: DUCK_STATES.OCULTO, isMuted: false }), true);
});

// T070 — drag-wake (decision #10): DUCK_GRABBED shares the shortcut's
// SLEEP → OUVINDO transition and never changes anything else.

test("grabbing the sleeping duck wakes it listening", () => {
  const next = duckReducer(
    { status: DUCK_STATES.SLEEP, isMuted: false },
    { type: "DUCK_GRABBED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OUVINDO, isMuted: false });
});

test("grabbing an awake or muted duck changes nothing", () => {
  for (const isMuted of [false, true]) {
    for (const status of [
      DUCK_STATES.OUVINDO,
      DUCK_STATES.PENSANDO,
      DUCK_STATES.FALANDO,
    ]) {
      const state = { status, isMuted };
      const next = duckReducer(state, { type: "DUCK_GRABBED" });
      assert.deepEqual(next, state);
    }
  }
});
