"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStateMachineModule = exported;
  }
})(globalThis, function () {
  // Conversation states from PRD 5.5 (US6 "Encerrado" no longer exists).
  const DUCK_STATES = Object.freeze({
    OCULTO: "OCULTO",
    OUVINDO: "OUVINDO",
    PENSANDO: "PENSANDO",
    FALANDO: "FALANDO",
    SLEEP: "SLEEP",
  });

  const ACTIVE_STATES = [
    DUCK_STATES.OUVINDO,
    DUCK_STATES.PENSANDO,
    DUCK_STATES.FALANDO,
    DUCK_STATES.SLEEP,
  ];

  // "Sem escuta" is a derived condition, not a sixth status: the mute lives
  // once, in state.isMuted, and everything visual derives from it (PO,
  // 2026-10-12). The mic is also factually off in SLEEP (session closed) and
  // OCULTO (nothing is captured).
  function isMicOff(state) {
    return (
      state.isMuted === true ||
      state.status === DUCK_STATES.SLEEP ||
      state.status === DUCK_STATES.OCULTO
    );
  }

  function initialDuckState() {
    return { status: DUCK_STATES.OCULTO, isMuted: false };
  }

  function duckReducer(state, action) {
    const type = typeof action === "object" && action !== null ? action.type : null;
    // Normalize legacy/absent flags so every returned state has the full shape.
    const isMuted = state.isMuted === true;
    switch (type) {
      case "SUMMON":
        // Summoning only opens the session; the duck listens and never
        // initiates a turn (PRD P6, without the greeting exception). Every
        // summon opens the mic, so the mute never survives it.
        return { status: DUCK_STATES.OUVINDO, isMuted: false };
      case "DISMISS":
        return { status: DUCK_STATES.OCULTO, isMuted: false };
      case "SHORTCUT_PRESSED":
        if (
          state.status === DUCK_STATES.OCULTO ||
          state.status === DUCK_STATES.SLEEP
        ) {
          return { status: DUCK_STATES.OUVINDO, isMuted: false };
        }
        return { status: DUCK_STATES.OCULTO, isMuted: false };
      // Explicit no-op: PRD 5.5 defines no art of its own for "user is
      // speaking" — the duck stays in OUVINDO either way.
      case "USER_SPEAKING":
        return state;
      case "USER_TURN_END":
        return state.status === DUCK_STATES.OUVINDO
          ? { status: DUCK_STATES.PENSANDO, isMuted }
          : state;
      case "DUCK_AUDIO":
        // Model audio can arrive while the UI still shows OUVINDO (e.g.
        // without a seen USER_TURN_END), or after PENSANDO.
        if (
          state.status === DUCK_STATES.OUVINDO ||
          state.status === DUCK_STATES.PENSANDO
        ) {
          return { status: DUCK_STATES.FALANDO, isMuted };
        }
        return state;
      case "DUCK_TURN_END":
      case "INTERRUPTED":
        return state.status === DUCK_STATES.FALANDO
          ? { status: DUCK_STATES.OUVINDO, isMuted }
          : state;
      case "SLEEP":
        // The backend watchdog only fires with the mic on (decision #11),
        // but the reset keeps every wake path mic-on by construction.
        return ACTIVE_STATES.includes(state.status)
          ? { status: DUCK_STATES.SLEEP, isMuted: false }
          : state;
      case "MIC_TOGGLED":
        // Toggling only makes sense mid-conversation; while SLEEP the pill
        // button routes to the wake path instead, and OCULTO hides the pill.
        return state.status === DUCK_STATES.OUVINDO ||
          state.status === DUCK_STATES.PENSANDO ||
          state.status === DUCK_STATES.FALANDO
          ? { status: state.status, isMuted: !isMuted }
          : state;
      case "DUCK_GRABBED":
        // Drag-wake (decision #10): same SLEEP → OUVINDO transition as the
        // shortcut. Grabbing an awake or muted duck changes nothing —
        // dragging never unmutes, and there is no click-on-duck.
        return state.status === DUCK_STATES.SLEEP
          ? { status: DUCK_STATES.OUVINDO, isMuted: false }
          : state;
      default:
        return state;
    }
  }

  return {
    DUCK_STATES,
    ACTIVE_STATES,
    initialDuckState,
    duckReducer,
    isMicOff,
  };
});
