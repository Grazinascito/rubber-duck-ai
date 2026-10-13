// AudioWorklet: converts Float32 blocks at the AudioContext rate into a
// continuous 16 kHz Int16 stream for the Gemini Live session.
// Loaded via captureContext.audioWorklet.addModule("/pcm-processor.js").
"use strict";

const TARGET_RATE = 16000;
const BATCH_SAMPLES = 640; // 40 ms at 16 kHz

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / TARGET_RATE; // e.g. 48000 / 16000 = 3
    // Leftover samples (at most ratio + 2) live at the front of _work; each
    // process() appends the input block after them. Sized generously so the
    // buffer never needs to grow at runtime.
    this._work = new Float32Array(4096 + Math.ceil(this._ratio) + 16);
    this._leftoverLength = 0;
    this._batch = new Int16Array(BATCH_SAMPLES);
    this._batchFill = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) {
      return true;
    }

    const avail = this._leftoverLength + channel.length;
    this._work.set(channel, this._leftoverLength);

    // Linear interpolation needs one sample of lookahead; keep the remainder.
    const outLength = Math.floor((avail - 1) / this._ratio);
    if (outLength > 0) {
      for (let i = 0; i < outLength; i++) {
        const position = i * this._ratio;
        const index = Math.floor(position);
        const frac = position - index;
        const value =
          this._work[index] * (1 - frac) + this._work[index + 1] * frac;
        const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
        this._batch[this._batchFill++] = Math.round(clamped * 32767);
        if (this._batchFill === this._batch.length) {
          // slice() is the one allowed copy: the batch itself is reused.
          const out = this._batch.slice();
          this.port.postMessage(out.buffer, [out.buffer]);
          this._batchFill = 0;
        }
      }
      const consumed = Math.floor(outLength * this._ratio);
      const remaining = avail - consumed;
      for (let j = 0; j < remaining; j++) {
        this._work[j] = this._work[consumed + j];
      }
      this._leftoverLength = remaining;
    }
    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
