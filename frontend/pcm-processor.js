// AudioWorklet: converts Float32 blocks at the AudioContext rate into a
// continuous 16 kHz Int16 stream for the Gemini Live session.
// Loaded via audioContext.audioWorklet.addModule("/pcm-processor.js").
"use strict";

const TARGET_RATE = 16000;

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / TARGET_RATE; // e.g. 48000 / 16000 = 3
    this._leftover = new Float32Array(0);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const merged = new Float32Array(this._leftover.length + channel.length);
    merged.set(this._leftover, 0);
    merged.set(channel, this._leftover.length);

    // Linear interpolation needs one sample of lookahead; keep the remainder.
    const outLength = Math.floor((merged.length - 1) / this._ratio);
    if (outLength <= 0) {
      this._leftover = merged;
      return true;
    }

    const resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const position = i * this._ratio;
      const index = Math.floor(position);
      const frac = position - index;
      resampled[i] = merged[index] * (1 - frac) + merged[index + 1] * frac;
    }
    this._leftover = merged.slice(Math.floor(outLength * this._ratio));

    const pcm16 = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const clamped = Math.max(-1, Math.min(1, resampled[i]));
      pcm16[i] = Math.round(clamped * 32767);
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
