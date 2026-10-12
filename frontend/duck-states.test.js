"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const duckStates = require("./duck-states.js");
const { DUCK_STATES } = require("./duck-state-machine.js");

test("imageForState maps each visible state to its image file", () => {
  const expected = {
    [DUCK_STATES.OUVINDO]: "/images/pato.png",
    [DUCK_STATES.PENSANDO]: "/images/pato-thinking.png",
    [DUCK_STATES.FALANDO]: "/images/pato.png",
    [DUCK_STATES.SLEEP]: "/images/pato-sleep.png",
  };
  for (const status of Object.keys(expected)) {
    assert.deepEqual(
      duckStates.imageForState(status),
      expected[status],
      `estado ${status} mapeou para ${duckStates.imageForState(status)}`
    );
  }
});

test("imageForState returns null for OCULTO (hidden duck has no art)", () => {
  assert.deepEqual(duckStates.imageForState(DUCK_STATES.OCULTO), null);
});

test("every mapped image file exists in frontend/images", () => {
  const files = [
    "/images/pato.png",
    "/images/pato-thinking.png",
    "/images/pato-sleep.png",
  ];
  for (const file of files) {
    const onDisk = path.join(__dirname, file);
    assert.ok(fs.existsSync(onDisk), `faltando: ${onDisk}`);
  }
});
