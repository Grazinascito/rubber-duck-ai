"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DuckTalkAnimator, FRAMES, rmsOf, frameForVolume } = require("./duck-talk-animator.js");

function setup({ decode = () => Promise.resolve(), reduced = false, debug = false } = {}) {
  let src = FRAMES[0];
  let volume = 0;
  let acquired = 0;
  let released = 0;
  let nextId = 0;
  const callbacks = new Map();
  const listeners = new Set();
  const classes = new Set();
  const properties = new Map();
  const images = [];
  const avatar = { getAttribute: () => src, setAttribute: (_name, value) => { src = value; } };
  const container = {
    classList: { add: (value) => classes.add(value), remove: (value) => classes.delete(value) },
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key) },
  };
  const motion = {
    matches: reduced,
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  };
  const source = {
    acquirePlaybackMeter(size) {
      assert.equal(size, 1024);
      acquired++;
      return {
        analyser: { getFloatTimeDomainData: (samples) => samples.fill(volume) },
        release: () => released++,
      };
    },
  };
  const debugEl = { hidden: true, textContent: "" };
  const animator = new DuckTalkAnimator(avatar, container, debugEl, {
    debug, motion,
    makeImage: () => { const image = { decode }; images.push(image); return image; },
    requestFrame: (fn) => { callbacks.set(++nextId, fn); return nextId; },
    cancelFrame: (id) => callbacks.delete(id),
  });
  return {
    animator, source, avatar, debugEl, images, callbacks, listeners, properties, classes,
    acquired: () => acquired, released: () => released, src: () => src,
    setVolume: (value) => { volume = value; },
    async start() { animator.start(source); await animator.ready; await Promise.resolve(); },
    tick(now) {
      assert.equal(callbacks.size, 1, "exactly one animation loop");
      const [id, fn] = callbacks.entries().next().value;
      callbacks.delete(id);
      fn(now);
    },
    reduce(value) { motion.matches = value; for (const fn of listeners) fn(); },
  };
}

test("RMS measures signed samples and frame boundaries are inclusive", () => {
  assert.equal(rmsOf(new Float32Array([-0.5, 0.5])), 0.5);
  assert.equal(rmsOf(new Float32Array(1024)), 0);
  assert.equal(frameForVolume(0.019), 0);
  assert.equal(frameForVolume(0.02), 1);
  assert.equal(frameForVolume(0.079), 1);
  assert.equal(frameForVolume(0.08), 2);
});

test("preloads every frame, smooths volume, holds frames 60ms and closes in silence", async () => {
  const h = setup();
  assert.deepEqual(h.images.map((image) => image.src), FRAMES);
  await h.start();
  h.setVolume(0.1);
  h.tick(0);
  assert.ok(Math.abs(h.animator.smoothed - 0.04) < 0.000001);
  assert.equal(h.src(), FRAMES[1]);
  h.setVolume(0.5);
  h.tick(30);
  assert.equal(h.src(), FRAMES[1]);
  h.tick(60);
  assert.equal(h.src(), FRAMES[2]);
  h.setVolume(0);
  for (let now = 80; now <= 300; now += 20) h.tick(now);
  assert.equal(h.src(), FRAMES[0]);
  assert.equal(Number.parseFloat(h.properties.get("--talk-lift")), 0);
  h.animator.destroy();
});

test("stop is immediate, cancels analysis, and repeated stop preserves other state art", async () => {
  const h = setup();
  await h.start();
  h.setVolume(1);
  h.tick(0);
  const staleTick = h.callbacks.values().next().value;
  assert.equal(h.src(), FRAMES[2]);
  h.animator.stop();
  assert.equal(h.src(), FRAMES[0]);
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.released(), 1);
  assert.equal(h.animator.smoothed, 0);
  assert.equal(h.properties.size, 0);
  h.avatar.setAttribute("src", "/images/pato-sleep.png");
  h.animator.stop();
  staleTick(16);
  assert.equal(h.src(), "/images/pato-sleep.png");
  assert.equal(h.callbacks.size, 0);
  h.animator.destroy();
  assert.equal(h.listeners.size, 0);
});

test("repeated start creates one meter and loop; a new utterance resets volume", async () => {
  const h = setup();
  await h.start();
  await h.start();
  assert.equal(h.acquired(), 1);
  assert.equal(h.callbacks.size, 1);
  h.setVolume(1);
  h.tick(0);
  h.animator.stop();
  h.setVolume(0);
  await h.start();
  h.tick(16);
  assert.equal(h.src(), FRAMES[0]);
  assert.equal(h.acquired(), 2);
  h.animator.destroy();
});

test("late image decoding cannot restart stopped animation", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = setup({ decode: () => pending });
  h.animator.start(h.source);
  assert.equal(h.callbacks.size, 0);
  h.animator.stop();
  h.avatar.setAttribute("src", "/images/pato-thinking.png");
  resolve();
  await h.animator.ready;
  await Promise.resolve();
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.acquired(), 0);
  assert.equal(h.src(), "/images/pato-thinking.png");
  h.animator.destroy();
});

test("failed image decoding leaves the base duck without analysis", async (t) => {
  t.mock.method(console, "warn", () => {});
  const h = setup({ decode: () => Promise.reject(new Error("missing PNG")) });
  await h.start();
  assert.equal(h.src(), FRAMES[0]);
  assert.equal(h.acquired(), 0);
  assert.equal(h.callbacks.size, 0);
  h.animator.destroy();
});

test("reduced motion disables everything and reacts during speech", async () => {
  const h = setup({ reduced: true });
  await h.start();
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.acquired(), 0);
  h.reduce(false);
  await Promise.resolve();
  h.setVolume(1);
  h.tick(0);
  assert.equal(h.src(), FRAMES[2]);
  h.reduce(true);
  assert.equal(h.src(), FRAMES[0]);
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.classes.size, 0);
  assert.equal(h.released(), 1);
  h.animator.stop();
  h.reduce(false);
  await Promise.resolve();
  assert.equal(h.callbacks.size, 0);
  h.animator.destroy();
});

test("debug is optional, throttled to 10Hz and hidden on stop", async () => {
  const h = setup({ debug: true });
  await h.start();
  h.setVolume(0.1);
  h.tick(0);
  const initial = h.debugEl.textContent;
  assert.equal(h.debugEl.hidden, false);
  assert.match(initial, /RMS 0.100/);
  h.setVolume(0.5);
  h.tick(50);
  assert.equal(h.debugEl.textContent, initial);
  h.tick(100);
  assert.match(h.debugEl.textContent, /RMS 0.500/);
  h.animator.stop();
  assert.equal(h.debugEl.hidden, true);
  h.animator.destroy();
});
