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
      // Playback-only context (OUTPUT_RATE); capture gets its own context so
      // the worklet thread never competes with the speaker schedule.
      this.audioContext = null;
      this.captureContext = null;
      this.stream = null;
      this.source = null;
      this.worklet = null;
      this.scheduledSources = [];
      this.nextStartTime = 0;
      this.playbackBus = null;
      this.playbackMeter = null;
      this.playbackGeneration = 0;
      this.onPlaybackEmpty = null;
      this.onPlaybackError = null;
      this.onContextStateChange = () => {
        if (this.audioContext?.state !== "running" && this.hasPendingPlayback()) {
          this.stopPlayback();
          this.onPlaybackError?.(new Error("AudioContext stopped during playback"));
        }
      };
    }

    async start(onAudioChunk) {
      if (this.stream !== null) {
        return; // already capturing
      }
      if (this.audioContext === null) {
        this.audioContext = new AudioContext({
          sampleRate: OUTPUT_RATE,
          latencyHint: "playback",
        });
        this.audioContext.addEventListener("statechange", this.onContextStateChange);
      }
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      if (this.captureContext === null) {
        this.captureContext = new AudioContext();
      }
      if (this.captureContext.state === "suspended") {
        await this.captureContext.resume();
      }
      await this.captureContext.audioWorklet.addModule("/pcm-processor.js");
      this.stream = await openMicrophoneStream();
      this.source = this.captureContext.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.captureContext, "pcm-processor");
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
      if (this.captureContext !== null) {
        this.captureContext.close();
        this.captureContext = null;
      }
    }

    // Enqueues one 24 kHz Int16 chunk at the first free slot of the schedule.
    playChunk(int16Array) {
      if (this.audioContext === null || int16Array.length === 0) {
        return false;
      }
      if (this.audioContext.state !== "running") {
        throw new Error("AudioContext is not running");
      }
      if (this.playbackBus === null) {
        this.playbackBus = this.audioContext.createGain();
        this.playbackBus.connect(this.audioContext.destination);
      }
      const floats = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        floats[i] = int16Array[i] / 32768;
      }
      const buffer = this.audioContext.createBuffer(1, floats.length, OUTPUT_RATE);
      buffer.copyToChannel(floats, 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.playbackBus);
      const startAt = Math.max(
        this.audioContext.currentTime + PLAYBACK_LEAD_SECONDS,
        this.nextStartTime
      );
      try {
        source.start(startAt);
      } catch (error) {
        source.disconnect();
        throw error;
      }
      this.nextStartTime = startAt + buffer.duration;
      this.scheduledSources.push(source);
      const generation = this.playbackGeneration;
      source.onended = () => {
        if (generation !== this.playbackGeneration) return;
        source.onended = null;
        source.disconnect();
        this.scheduledSources = this.scheduledSources.filter((s) => s !== source);
        if (!this.hasPendingPlayback()) this.onPlaybackEmpty?.();
      };
      return true;
    }

    hasPendingPlayback() {
      return this.scheduledSources.length > 0;
    }

    // Only speaker PCM reaches this bus; capture has a separate worklet sink.
    acquirePlaybackMeter(fftSize) {
      if (!this.playbackBus || !this.audioContext) return null;
      if (this.playbackMeter) return this.playbackMeter;
      const bus = this.playbackBus;
      const destination = this.audioContext.destination;
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      bus.disconnect();
      bus.connect(analyser);
      analyser.connect(destination);
      const meter = {
        analyser,
        release: () => {
          if (this.playbackMeter !== meter) return;
          bus.disconnect();
          analyser.disconnect();
          bus.connect(destination);
          this.playbackMeter = null;
        },
      };
      this.playbackMeter = meter;
      return meter;
    }

    // Drops everything scheduled ("interrupted": the user spoke over the duck).
    stopPlayback() {
      ++this.playbackGeneration;
      for (const source of this.scheduledSources) {
        source.onended = null;
        try {
          source.stop();
        } catch {
          // already finished
        }
        source.disconnect();
      }
      this.scheduledSources = [];
      this.nextStartTime = 0;
      this.playbackMeter?.release();
      this.playbackBus?.disconnect();
      this.playbackBus = null;
    }

    close() {
      this.stopPlayback();
      this.stopCapture();
      if (this.audioContext !== null) {
        this.audioContext.removeEventListener("statechange", this.onContextStateChange);
        this.audioContext.close();
        this.audioContext = null;
      }
    }
  }

  return { INPUT_RATE, OUTPUT_RATE, MicAndSpeaker };
});
