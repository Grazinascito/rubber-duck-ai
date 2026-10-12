"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MicAndSpeaker } = require("./microphone-and-speaker.js");

function node() {
  return {
    connections: new Set(), stops: 0,
    connect(destination) { this.connections.add(destination); },
    disconnect() { this.connections.clear(); },
    start(time) { this.startAt = time; },
    stop() { this.stops++; },
  };
}

function setup() {
  const mic = new MicAndSpeaker();
  const sources = [];
  const context = {
    state: "running", currentTime: 1, destination: node(),
    createGain: node, createAnalyser: node,
    createBuffer: (_channels, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
    createBufferSource() { const source = node(); sources.push(source); return source; },
    close() { this.state = "closed"; },
    removeEventListener() {},
  };
  mic.audioContext = context;
  return { mic, context, sources, chunk: new Int16Array(2400) };
}

test("only one speaker path exists when attaching and releasing the analyser", () => {
  const { mic, context, sources, chunk } = setup();
  mic.playChunk(chunk);
  const bus = mic.playbackBus;
  assert.deepEqual([...sources[0].connections], [bus]);
  assert.deepEqual([...bus.connections], [context.destination]);
  const meter = mic.acquirePlaybackMeter(1024);
  assert.equal(meter.analyser.fftSize, 1024);
  assert.deepEqual([...bus.connections], [meter.analyser]);
  assert.deepEqual([...meter.analyser.connections], [context.destination]);
  assert.equal(mic.acquirePlaybackMeter(1024), meter);
  mic.playChunk(chunk);
  assert.deepEqual([...sources[1].connections], [bus]);
  meter.release();
  meter.release();
  assert.deepEqual([...bus.connections], [context.destination]);
  assert.equal(meter.analyser.connections.size, 0);
  mic.close();
  assert.equal(bus.connections.size, 0);
});

test("buffers are scheduled in order and the empty callback waits for every source", () => {
  const { mic, sources, chunk } = setup();
  let drained = 0;
  mic.onPlaybackEmpty = () => drained++;
  mic.playChunk(chunk);
  mic.playChunk(chunk);
  assert.equal(sources[0].startAt, 1.1);
  assert.ok(Math.abs(sources[1].startAt - 1.2) < 1e-10);
  sources[0].onended();
  assert.equal(sources[0].connections.size, 0);
  assert.equal(mic.hasPendingPlayback(), true);
  assert.equal(drained, 0);
  sources[1].onended();
  assert.equal(drained, 1);
  assert.equal(mic.hasPendingPlayback(), false);
});

test("interrupt disconnects all nodes and stale ended callbacks cannot drain the next utterance", () => {
  const { mic, sources, chunk } = setup();
  let drained = 0;
  mic.onPlaybackEmpty = () => drained++;
  mic.playChunk(chunk);
  const stale = sources[0].onended;
  const meter = mic.acquirePlaybackMeter(1024);
  const bus = mic.playbackBus;
  mic.stopPlayback();
  assert.equal(sources[0].stops, 1);
  assert.equal(sources[0].connections.size, 0);
  assert.equal(bus.connections.size, 0);
  assert.equal(meter.analyser.connections.size, 0);
  assert.equal(mic.nextStartTime, 0);
  mic.playChunk(chunk);
  stale();
  meter.release();
  assert.equal(drained, 0);
  assert.equal(mic.hasPendingPlayback(), true);
  assert.equal(mic.playbackBus.connections.size, 1);
  sources[1].onended();
  assert.equal(drained, 1);
  mic.close();
});

test("audio context suspension stops queued playback and reports an error", () => {
  const { mic, context, chunk } = setup();
  let errors = 0;
  mic.onPlaybackError = () => errors++;
  mic.playChunk(chunk);
  context.state = "suspended";
  mic.onContextStateChange();
  assert.equal(errors, 1);
  assert.equal(mic.hasPendingPlayback(), false);
  assert.throws(() => mic.playChunk(chunk), /not running/);
  mic.close();
});

test("failed source start disconnects the source", () => {
  const { mic, context, chunk } = setup();
  const source = node();
  source.start = () => { throw new Error("playback failed"); };
  context.createBufferSource = () => source;
  assert.throws(() => mic.playChunk(chunk), /playback failed/);
  assert.equal(source.connections.size, 0);
  assert.equal(mic.hasPendingPlayback(), false);
  mic.close();
});
