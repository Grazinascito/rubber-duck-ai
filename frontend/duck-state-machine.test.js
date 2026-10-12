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

test("SUMMON transitions OCULTO to VISIVEL", () => {
  const next = duckReducer({ status: DUCK_STATES.OCULTO }, { type: "SUMMON" });

  assert.deepEqual(next, { status: DUCK_STATES.VISIVEL });
});

test("DISMISS transitions VISIVEL to OCULTO", () => {
  const next = duckReducer({ status: DUCK_STATES.VISIVEL }, { type: "DISMISS" });

  assert.deepEqual(next, { status: DUCK_STATES.OCULTO });
});

test("SUMMON when already VISIVEL keeps VISIVEL", () => {
  const next = duckReducer({ status: DUCK_STATES.VISIVEL }, { type: "SUMMON" });

  assert.deepEqual(next, { status: DUCK_STATES.VISIVEL });
});

test("DISMISS when already OCULTO keeps OCULTO", () => {
  const next = duckReducer({ status: DUCK_STATES.OCULTO }, { type: "DISMISS" });

  assert.deepEqual(next, { status: DUCK_STATES.OCULTO });
});

test("SHORTCUT_PRESSED summons the duck when it is OCULTO", () => {
  const next = duckReducer(
    { status: DUCK_STATES.OCULTO },
    { type: "SHORTCUT_PRESSED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.VISIVEL });
});

test("SHORTCUT_PRESSED dismisses the duck when it is VISIVEL", () => {
  const next = duckReducer(
    { status: DUCK_STATES.VISIVEL },
    { type: "SHORTCUT_PRESSED" }
  );

  assert.deepEqual(next, { status: DUCK_STATES.OCULTO });
});

test("returns the state unchanged for an unknown action", () => {
  const state = { status: DUCK_STATES.VISIVEL };
  const next = duckReducer(state, { type: "SOMETHING_ELSE" });

  assert.deepEqual(next, { status: DUCK_STATES.VISIVEL });
});
