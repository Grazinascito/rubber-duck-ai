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
    microphoneAndSpeakerModule
  );
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStatesModule = exported;
  }
})(globalThis, function (stateMachine, geminiClientModule, micModule) {
  function base64ToInt16Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  }

  function renderDuck(rootEl, state) {
    rootEl.classList.toggle(
      "is-oculto",
      state.status === stateMachine.DUCK_STATES.OCULTO
    );
    rootEl.dataset.status = state.status;
  }

  function initDuck(rootEl) {
    const api = globalThis.duckApi;
    if (typeof api === "undefined") {
      return;
    }

    let state = stateMachine.initialDuckState();
    const client = new geminiClientModule.GeminiClient();
    const mic = new micModule.MicAndSpeaker();

    const statusEl =
      typeof document !== "undefined"
        ? document.getElementById("status")
        : null;
    client.onStatusChange = (status) => {
      if (statusEl !== null) {
        statusEl.textContent = status;
      }
    };
    client.onMessage = handleEnvelope;

    function dispatch(action) {
      const next = stateMachine.duckReducer(state, action);
      if (next.status === state.status) {
        return;
      }
      const wasVisible = state.status !== stateMachine.DUCK_STATES.OCULTO;
      state = next;
      renderDuck(rootEl, state);
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

    function handleEnvelope(envelope) {
      const payload = (envelope && envelope.payload) || {};
      switch (envelope.type) {
        case "gemini":
          if (typeof payload.audio === "string" && payload.audio.length > 0) {
            mic.playChunk(base64ToInt16Array(payload.audio));
            dispatch({ type: "DUCK_AUDIO" });
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
          mic.stopPlayback();
          dispatch({ type: "INTERRUPTED" });
          break;
        case "turn_complete":
          dispatch({ type: "DUCK_TURN_END" });
          break;
        case "sleep":
          enterSleep();
          break;
        case "error":
          console.warn("[duck] erro do servidor:", payload);
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

    renderDuck(rootEl, state);
  }

  const rootEl =
    typeof document !== "undefined"
      ? document.getElementById("duck-root")
      : null;
  if (rootEl) {
    initDuck(rootEl);
  }

  return { renderDuck, initDuck };
});
