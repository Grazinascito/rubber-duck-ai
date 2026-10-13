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
    "/images/pato-talk-1.png",
    "/images/pato-talk-2.png",
  ];
  for (const file of files) {
    const onDisk = path.join(__dirname, file);
    assert.ok(fs.existsSync(onDisk), `faltando: ${onDisk}`);
  }
});

function integrationHarness() {
  const elements = {};
  for (const id of ["#duck-avatar", "#mic-toggle"]) {
    elements[id] = {
      src: "/images/pato.png",
      getAttribute() { return this.src; },
      setAttribute(_key, value) { this.src = value; },
      classList: { toggle() {} },
      addEventListener(_name, fn) { this.click = fn; },
    };
  }
  const root = {
    dataset: {}, classList: { toggle() {} },
    querySelector: (id) => elements[id] || null,
  };
  const api = {
    summon() {}, dismiss() {},
    onShortcutPressed(fn) { this.shortcut = fn; },
    onTraySummon(fn) { this.summonFromTray = fn; },
    onDuckMoved(fn) { this.move = fn; },
  };
  const client = { connect() {}, disconnect() {}, send() {}, sendBinary() {} };
  const mic = {
    pending: false,
    start: () => Promise.resolve(), stopCapture() {}, close() {},
    playChunk() { this.pending = true; return true; },
    hasPendingPlayback() { return this.pending; },
    stopPlayback() { this.pending = false; },
    drain() { this.pending = false; this.onPlaybackEmpty(); },
  };
  const animator = {
    active: false, starts: 0,
    start() {
      if (this.active) return;
      this.active = true;
      this.starts++;
      elements["#duck-avatar"].src = "/images/pato-talk-2.png";
    },
    stop() {
      if (!this.active) return;
      this.active = false;
      elements["#duck-avatar"].src = "/images/pato.png";
    },
    destroy() { this.stop(); },
  };
  const controller = duckStates.initDuck(root, { api, client, mic, animator });
  const emit = (type, payload = {}) => client.onMessage({ type, payload });
  const audio = () => emit("gemini", { audio: "AAAAAA==" });
  api.shortcut();
  return { root, api, mic, client, animator, elements, controller, emit, audio };
}

test("turn_complete waits for queued audio; drain immediately closes the beak", () => {
  const h = integrationHarness();
  h.audio();
  assert.equal(h.root.dataset.status, DUCK_STATES.FALANDO);
  h.emit("turn_complete");
  assert.equal(h.root.dataset.status, DUCK_STATES.FALANDO);
  assert.equal(h.animator.active, true);
  h.mic.drain();
  assert.equal(h.root.dataset.status, DUCK_STATES.OUVINDO);
  assert.equal(h.elements["#duck-avatar"].src, "/images/pato.png");
  h.controller.destroy();
});

test("a streaming gap closes the beak and the next chunk restarts without a state change", () => {
  const h = integrationHarness();
  h.audio();
  h.mic.drain();
  assert.equal(h.root.dataset.status, DUCK_STATES.FALANDO);
  assert.equal(h.animator.active, false);
  h.audio();
  assert.equal(h.animator.active, true);
  assert.equal(h.animator.starts, 2);
  h.mic.drain();
  h.emit("turn_complete");
  assert.equal(h.root.dataset.status, DUCK_STATES.OUVINDO);
  h.controller.destroy();
});

test("muting while speaking preserves the frame and the playback", () => {
  const h = integrationHarness();
  h.audio();
  h.elements["#mic-toggle"].click();
  assert.equal(h.root.dataset.status, DUCK_STATES.FALANDO);
  assert.equal(h.elements["#duck-avatar"].src, "/images/pato-talk-2.png");
  assert.equal(h.mic.pending, true);
  assert.equal(h.animator.starts, 1);
  h.controller.destroy();
});

test("clicking the mic button while the duck sleeps wakes it into a new listening session", () => {
  const h = integrationHarness();
  h.emit("sleep");
  assert.equal(h.root.dataset.status, DUCK_STATES.SLEEP);
  let micStarts = 0;
  const originalStart = h.mic.start;
  h.mic.start = (...args) => {
    micStarts++;
    return originalStart.apply(h.mic, args);
  };
  h.elements["#mic-toggle"].click();
  assert.equal(h.root.dataset.status, DUCK_STATES.OUVINDO);
  assert.equal(micStarts, 1);
  assert.equal(h.elements["#duck-avatar"].src, "/images/pato.png");
  h.controller.destroy();
});

test("interruption, server error, playback failure and disconnect close immediately", (t) => {
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "log", () => {});
  for (const fail of [
    (h) => h.emit("interrupted"),
    (h) => h.emit("error"),
    (h) => h.client.onStatusChange("desconectado"),
    (h) => h.mic.onPlaybackError(new Error("audio suspended")),
    (h) => { h.mic.playChunk = () => { throw new Error("bad PCM"); }; h.audio(); },
    (h) => h.emit("gemini", { audio: "!invalid!" }),
  ]) {
    const h = integrationHarness();
    h.audio();
    h.emit("turn_complete");
    fail(h);
    assert.equal(h.root.dataset.status, DUCK_STATES.OUVINDO);
    assert.equal(h.animator.active, false);
    assert.equal(h.mic.pending, false);
    assert.equal(h.elements["#duck-avatar"].src, "/images/pato.png");
    h.controller.destroy();
  }
});

test("sleep, dismiss and unload stop animation; late audio preserves sleep/hidden art", () => {
  for (const next of ["sleep", "dismiss"]) {
    const h = integrationHarness();
    h.audio();
    if (next === "sleep") h.emit("sleep");
    else h.api.shortcut();
    assert.equal(h.root.dataset.status, next === "sleep" ? DUCK_STATES.SLEEP : DUCK_STATES.OCULTO);
    assert.equal(h.animator.active, false);
    assert.equal(h.mic.pending, false);
    h.audio();
    assert.equal(h.animator.active, false);
    assert.equal(h.mic.pending, false);
    if (next === "sleep") assert.equal(h.elements["#duck-avatar"].src, "/images/pato-sleep.png");
    h.controller.destroy();
  }
  const h = integrationHarness();
  h.audio();
  h.controller.destroy();
  h.controller.destroy();
  assert.equal(h.animator.active, false);
  assert.equal(h.mic.pending, false);
  assert.equal(h.client.onMessage, null);
  assert.equal(h.mic.onPlaybackEmpty, null);
});
