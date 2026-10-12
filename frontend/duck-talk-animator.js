"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckTalkAnimatorModule = exported;
  }
})(globalThis, function () {
  // Calibration: normalized PCM RMS (0–1), before the system speaker volume.
  const LIMIAR_1 = 0.02;
  const LIMIAR_2 = 0.08;
  const MIN_FRAME_MS = 60;
  const FFT_SIZE = 1024;
  const DEBUG = false;
  const FRAMES = Object.freeze([
    "/images/pato.png",
    "/images/pato-talk-1.png",
    "/images/pato-talk-2.png",
  ]);

  function rmsOf(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
  }

  function frameForVolume(volume) {
    return volume < LIMIAR_1 ? 0 : volume < LIMIAR_2 ? 1 : 2;
  }

  class DuckTalkAnimator {
    constructor(avatar, container, debugEl, options = {}) {
      this.avatar = avatar;
      this.container = container;
      this.debugEl = debugEl;
      this.debug = options.debug ?? DEBUG;
      this.requestFrame = options.requestFrame || ((fn) => requestAnimationFrame(fn));
      this.cancelFrame = options.cancelFrame || ((id) => cancelAnimationFrame(id));
      this.motion = options.motion || matchMedia("(prefers-reduced-motion: reduce)");
      this.source = null;
      this.meter = null;
      this.raf = null;
      this.generation = 0;
      this.smoothed = 0;
      this.frame = 0;
      this.lastFrameAt = -Infinity;
      this.lastDebugAt = -Infinity;
      this.samples = new Float32Array(FFT_SIZE);
      this.destroyed = false;
      const makeImage = options.makeImage || (() => new Image());
      // Keep decoded images alive for the whole renderer lifetime.
      this.images = FRAMES.map((src) => {
        const image = makeImage();
        image.src = src;
        return image;
      });
      this.ready = Promise.all(this.images.map((image) => image.decode()))
        .then(() => true)
        .catch((error) => {
          console.warn("[duck] imagens da fala:", error);
          return false;
        });
      this.onMotionChange = () => {
        if (this.source === null) return;
        this.halt();
        if (!this.motion.matches) this.begin();
      };
      this.motion.addEventListener("change", this.onMotionChange);
    }

    start(source) {
      if (this.destroyed || source === this.source) return;
      this.stop();
      this.source = source;
      this.setFrame(0);
      if (!this.motion.matches) this.begin();
    }

    begin() {
      const generation = ++this.generation;
      this.ready.then((loaded) => {
        if (!loaded || generation !== this.generation || !this.source || this.motion.matches) return;
        try {
          this.meter = this.source.acquirePlaybackMeter(FFT_SIZE);
          if (!this.meter) return;
          this.container.classList.add("is-talking");
          if (this.debug && this.debugEl) this.debugEl.hidden = false;
          const tick = (now) => {
            if (generation !== this.generation) return;
            try {
              this.meter.analyser.getFloatTimeDomainData(this.samples);
              const rms = rmsOf(this.samples);
              this.smoothed = this.smoothed * 0.6 + rms * 0.4;
              const frame = frameForVolume(this.smoothed);
              if (frame !== this.frame && now - this.lastFrameAt >= MIN_FRAME_MS) {
                this.setFrame(frame);
                this.lastFrameAt = now;
              }
              // Silence has no body movement. Transform never changes layout.
              const strength = frame === 0 ? 0 : Math.min(this.smoothed / LIMIAR_2, 1);
              this.container.style.setProperty("--talk-lift", `${-2 * strength}px`);
              this.container.style.setProperty("--talk-squash", String(1 - 0.01 * strength));
              if (this.debug && this.debugEl && now - this.lastDebugAt >= 100) {
                this.debugEl.textContent = `RMS ${rms.toFixed(3)} | suave ${this.smoothed.toFixed(3)} | bico ${this.frame}`;
                this.lastDebugAt = now;
              }
              this.raf = this.requestFrame(tick);
            } catch (error) {
              console.warn("[duck] análise da fala:", error);
              this.stop();
            }
          };
          this.raf = this.requestFrame(tick);
        } catch (error) {
          console.warn("[duck] análise da fala:", error);
          this.stop();
        }
      });
    }

    setFrame(frame) {
      this.frame = frame;
      if (this.avatar.getAttribute("src") !== FRAMES[frame]) {
        this.avatar.setAttribute("src", FRAMES[frame]);
      }
    }

    halt() {
      ++this.generation;
      if (this.raf !== null) this.cancelFrame(this.raf);
      this.raf = null;
      if (this.meter) this.meter.release();
      this.meter = null;
      this.smoothed = 0;
      this.lastFrameAt = -Infinity;
      this.lastDebugAt = -Infinity;
      this.setFrame(0);
      this.container.classList.remove("is-talking");
      this.container.style.removeProperty("--talk-lift");
      this.container.style.removeProperty("--talk-squash");
      if (this.debugEl) this.debugEl.hidden = true;
    }

    stop() {
      // A repeated stop must not overwrite the next state's artwork.
      if (this.source === null) return;
      this.source = null;
      this.halt();
    }

    destroy() {
      this.stop();
      this.destroyed = true;
      this.motion.removeEventListener("change", this.onMotionChange);
    }
  }

  return { DuckTalkAnimator, FRAMES, rmsOf, frameForVolume };
});
