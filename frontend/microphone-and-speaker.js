// Microphone capture and speaker playback for the voice loop (T032).
// The only module allowed to touch getUserMedia and AudioContext.
"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.MicrophoneAndSpeakerModule = exported;
  }
})(globalThis, function () {
  const INPUT_RATE = 16000; // what we send to the server
  const OUTPUT_RATE = 24000; // what the Live API sends back
  const PLAYBACK_LEAD_SECONDS = 0.1;

  // The W3C spec guarantees no default for these constraints; each browser
  // picks its own. Without echoCancellation the duck hears itself and
  // interrupts itself.
  async function openMicrophoneStream() {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  class MicAndSpeaker {
    constructor() {
      this.audioContext = null;
      this.stream = null;
      this.source = null;
      this.worklet = null;
      this.scheduledSources = [];
      this.nextStartTime = 0;
    }

    async start(onAudioChunk) {
      if (this.stream !== null) {
        return; // already capturing
      }
      if (this.audioContext === null) {
        this.audioContext = new AudioContext();
      }
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      await this.audioContext.audioWorklet.addModule("/pcm-processor.js");
      this.stream = await openMicrophoneStream();
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.audioContext, "pcm-processor");
      this.worklet.port.onmessage = (event) => {
        onAudioChunk(new Int16Array(event.data));
      };
      // Same wiring as Google's official example: the worklet is the sink.
      this.source.connect(this.worklet);
    }

    // Stops capture for real (privacy: nothing is captured while stopped).
    stopCapture() {
      if (this.stream !== null) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.source !== null) {
        this.source.disconnect();
        this.source = null;
      }
      if (this.worklet !== null) {
        this.worklet.port.onmessage = null;
        this.worklet.disconnect();
        this.worklet = null;
      }
    }

    // Enqueues one 24 kHz Int16 chunk at the first free slot of the schedule.
    playChunk(int16Array) {
      if (this.audioContext === null || int16Array.length === 0) {
        return;
      }
      const floats = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        floats[i] = int16Array[i] / 32768;
      }
      const buffer = this.audioContext.createBuffer(1, floats.length, OUTPUT_RATE);
      buffer.copyToChannel(floats, 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      const startAt = Math.max(
        this.audioContext.currentTime + PLAYBACK_LEAD_SECONDS,
        this.nextStartTime
      );
      source.start(startAt);
      this.nextStartTime = startAt + buffer.duration;
      this.scheduledSources.push(source);
      source.onended = () => {
        this.scheduledSources = this.scheduledSources.filter((s) => s !== source);
      };
    }

    // Drops everything scheduled ("interrupted": the user spoke over the duck).
    stopPlayback() {
      for (const source of this.scheduledSources) {
        try {
          source.stop();
        } catch {
          // already finished
        }
      }
      this.scheduledSources = [];
      this.nextStartTime = 0;
    }

    close() {
      this.stopPlayback();
      this.stopCapture();
      if (this.audioContext !== null) {
        this.audioContext.close();
        this.audioContext = null;
      }
    }
  }

  return { INPUT_RATE, OUTPUT_RATE, MicAndSpeaker };
});
