"use strict";

(function (globalScope, factory) {
  const stateMachine =
    globalScope.DuckStateMachineModule ||
    (typeof require === "function"
      ? require("./duck-state-machine.js")
      : null);
  const geminiClientModule =
    globalScope.GeminiClientModule ||
    (typeof require === "function"
      ? require("./gemini-client.js")
      : null);
  const microphoneAndSpeakerModule =
    globalScope.MicrophoneAndSpeakerModule ||
    (typeof require === "function"
      ? require("./microphone-and-speaker.js")
      : null);
  const exported = factory(
    stateMachine,
    geminiClientModule,
    microphoneAndSpeakerModule,
    globalScope.DuckTalkAnimatorModule ||
      (typeof require === "function" ? require("./duck-talk-animator.js") : null)
  );
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStatesModule = exported;
  }
})(globalThis, function (stateMachine, geminiClientModule, micModule, animatorModule) {
  function base64ToInt16Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  // The animator owns src only during FALANDO. Other states keep their art.
  const STATE_IMAGES = Object.freeze({
    [stateMachine.DUCK_STATES.OUVINDO]: "/images/pato.png",
    [stateMachine.DUCK_STATES.PENSANDO]: "/images/pato-thinking.png",
    [stateMachine.DUCK_STATES.FALANDO]: "/images/pato.png",
    [stateMachine.DUCK_STATES.SLEEP]: "/images/pato-sleep.png",
  });

  function imageForState(status) {
    const image = STATE_IMAGES[status];
    return image === undefined ? null : image;
  }

  function renderDuck(rootEl, state) {
    rootEl.classList.toggle(
      "is-oculto",
      state.status === stateMachine.DUCK_STATES.OCULTO
    );
    rootEl.dataset.status = state.status;
    const image = imageForState(state.status);
    const avatarEl = rootEl.querySelector("#duck-avatar");
    if (
      avatarEl !== null &&
      state.status !== stateMachine.DUCK_STATES.FALANDO &&
      image !== null &&
      avatarEl.getAttribute("src") !== image
    ) {
      avatarEl.setAttribute("src", image);
    }
    // The mic button is a function of the state too (Single Source of
    // Truth): is-muted whenever the mic is factually off — Sem escuta,
    // SLEEP (session closed) or OCULTO (nothing is captured). Art and CSS
    // shipped in US8; US4 only flips the class for real.
    const micButtonEl = rootEl.querySelector("#mic-toggle");
    if (micButtonEl !== null) {
      const micOff = stateMachine.isMicOff(state);
      micButtonEl.classList.toggle("is-on", !micOff);
      micButtonEl.classList.toggle("is-muted", micOff);
    }
  }

  function initDuck(rootEl, dependencies = {}) {
    const api = dependencies.api || globalThis.duckApi;
    if (typeof api === "undefined") {
      return;
    }

    let state = stateMachine.initialDuckState();
    const client = dependencies.client || new geminiClientModule.GeminiClient();
    const mic = dependencies.mic || new micModule.MicAndSpeaker();
    const animator = dependencies.animator || new animatorModule.DuckTalkAnimator(
      rootEl.querySelector("#duck-avatar"),
      rootEl.querySelector("#duck-body"),
      rootEl.querySelector("#duck-talk-debug")
    );
    let turnComplete = false;
    let destroyed = false;

    function finishTurnIfDrained() {
      if (turnComplete && !mic.hasPendingPlayback()) {
        turnComplete = false;
        dispatch({ type: "DUCK_TURN_END" });
      }
    }

    function stopSpeech() {
      turnComplete = false;
      animator.stop();
      mic.stopPlayback();
      dispatch({ type: "INTERRUPTED" });
    }

    mic.onPlaybackEmpty = () => {
      animator.stop();
      finishTurnIfDrained();
    };
    mic.onPlaybackError = (error) => {
      console.warn("[duck] reprodução:", error);
      stopSpeech();
    };

    client.onStatusChange = (status) => {
      // Connection state lives in the terminal only (PO decision): the UI
      // shows no badge.
      console.log("[duck] conexão:", status);
      if (status === "desconectado" && !destroyed) stopSpeech();
    };
    client.onMessage = handleEnvelope;

    function dispatch(action) {
      const next = stateMachine.duckReducer(state, action);
      // A mute toggle changes isMuted while keeping the status, so both
      // fields take part in the "nothing changed" guard.
      if (next.status === state.status && next.isMuted === state.isMuted) {
        return;
      }
      const wasVisible = state.status !== stateMachine.DUCK_STATES.OCULTO;
      const wasTalking = state.status === stateMachine.DUCK_STATES.FALANDO;
      if (wasTalking && next.status !== stateMachine.DUCK_STATES.FALANDO) {
        animator.stop();
      }
      state = next;
      renderDuck(rootEl, state);
      if (!wasTalking && state.status === stateMachine.DUCK_STATES.FALANDO) {
        animator.start(mic);
      }
      if (!wasVisible && state.status !== stateMachine.DUCK_STATES.OCULTO) {
        api.summon();
      } else if (wasVisible && state.status === stateMachine.DUCK_STATES.OCULTO) {
        api.dismiss();
      }
    }

    function openSession() {
      client.connect();
      mic
        .start((chunk) => client.sendBinary(chunk))
        .catch((error) => console.error("[duck] microfone:", error));
    }

    // Privacy guardrail: hidden duck captures nothing. US6 (T039) adds the
    // farewell asset on top of this teardown.
    function closeSession() {
      turnComplete = false;
      animator.stop();
      mic.stopPlayback();
      mic.stopCapture();
      client.disconnect();
    }

    function summonAction() {
      openSession();
      dispatch({ type: "SUMMON" });
    }

    function dismissAction() {
      closeSession();
      dispatch({ type: "DISMISS" });
    }

    function enterSleep() {
      dispatch({ type: "SLEEP" });
      closeSession();
    }

    // US4 mute: capture stops for real (privacy — no track alive) while the
    // session and its context stay alive; the backend pauses the sleep
    // watchdog while muted (decision #11). Unmuting reopens the mic and the
    // conversation resumes in the same session.
    function toggleMute() {
      const willMute = !state.isMuted;
      dispatch({ type: "MIC_TOGGLED" });
      if (willMute) {
        mic.stopCapture();
      } else {
        mic
          .start((chunk) => client.sendBinary(chunk))
          .catch((error) => console.error("[duck] microfone:", error));
      }
      client.send({ type: "muted", payload: { value: willMute } });
    }

    function handleEnvelope(envelope) {
      if (destroyed) return;
      const payload = (envelope && envelope.payload) || {};
      switch (envelope.type) {
        case "gemini":
          if (typeof payload.audio === "string" && payload.audio.length > 0) {
            if (state.status === stateMachine.DUCK_STATES.OCULTO ||
                state.status === stateMachine.DUCK_STATES.SLEEP) break;
            try {
              if (mic.playChunk(base64ToInt16Array(payload.audio))) {
                if (state.status !== stateMachine.DUCK_STATES.FALANDO) turnComplete = false;
                dispatch({ type: "DUCK_AUDIO" });
                // A streaming gap stops the animator without ending the turn.
                animator.start(mic);
              }
            } catch (error) {
              mic.onPlaybackError(error);
            }
          }
          // payload.text is reserved for US5 (captions).
          break;
        case "user":
          dispatch({ type: "USER_SPEAKING" });
          if (payload.finished === true) {
            dispatch({ type: "USER_TURN_END" });
          }
          break;
        case "interrupted":
          stopSpeech();
          break;
        case "turn_complete":
          turnComplete = true;
          finishTurnIfDrained();
          break;
        case "sleep":
          enterSleep();
          break;
        case "error":
          console.warn("[duck] erro do servidor:", payload);
          stopSpeech();
          break;
      }
    }

    api.onShortcutPressed(() => {
      // The summon command wakes a sleeping duck (PRD 5.5); the shortcut only
      // hides the duck during an active conversation.
      if (
        state.status === stateMachine.DUCK_STATES.OCULTO ||
        state.status === stateMachine.DUCK_STATES.SLEEP
      ) {
        summonAction();
      } else {
        dismissAction();
      }
    });
    api.onTraySummon(() => {
      // Re-summoning wakes the duck from SLEEP into a new session (PRD D10).
      if (
        state.status === stateMachine.DUCK_STATES.OCULTO ||
        state.status === stateMachine.DUCK_STATES.SLEEP
      ) {
        summonAction();
      }
    });

    const micButtonEl = rootEl.querySelector("#mic-toggle");
    if (micButtonEl !== null) {
      micButtonEl.addEventListener("click", () => {
        // The pill button also wakes the sleeping duck listening (PO,
        // 2026-10-12); it is a real button outside the drag region, unlike
        // the rejected click-on-duck. The pill is hidden while OCULTO.
        if (state.status === stateMachine.DUCK_STATES.SLEEP) {
          summonAction();
          return;
        }
        if (state.status === stateMachine.DUCK_STATES.OCULTO) {
          return;
        }
        toggleMute();
      });
    }

    api.onDuckMoved(() => {
      // Drag-wake (decision #10): only SLEEP reacts — dragging an awake or
      // muted duck changes nothing and never unmutes. No click-on-duck.
      if (state.status === stateMachine.DUCK_STATES.SLEEP) {
        summonAction();
      }
    });

    renderDuck(rootEl, state);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      closeSession();
      animator.destroy();
      mic.onPlaybackEmpty = null;
      mic.onPlaybackError = null;
      mic.close();
      client.onMessage = null;
      client.onStatusChange = null;
      globalThis.removeEventListener?.("beforeunload", destroy);
    }
    globalThis.addEventListener?.("beforeunload", destroy);
    return { destroy };
  }

  const rootEl =
    typeof document !== "undefined"
      ? document.getElementById("duck-root")
      : null;
  if (rootEl) {
    initDuck(rootEl);
  }

  return { renderDuck, initDuck, imageForState };
});
