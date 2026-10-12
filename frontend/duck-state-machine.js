"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStateMachineModule = exported;
  }
})(globalThis, function () {
  // Conversation states from PRD 5.5 (US4 adds "Sem escuta", US6 "Encerrado").
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

  function initialDuckState() {
    return { status: DUCK_STATES.OCULTO };
  }

  function duckReducer(state, action) {
    const type = typeof action === "object" && action !== null ? action.type : null;
    switch (type) {
      case "SUMMON":
        // Summoning only opens the session; the duck listens and never
        // initiates a turn (PRD P6, without the greeting exception).
        return { status: DUCK_STATES.OUVINDO };
      case "DISMISS":
        return { status: DUCK_STATES.OCULTO };
      case "SHORTCUT_PRESSED":
        if (
          state.status === DUCK_STATES.OCULTO ||
          state.status === DUCK_STATES.SLEEP
        ) {
          return { status: DUCK_STATES.OUVINDO };
        }
        return { status: DUCK_STATES.OCULTO };
      // Explicit no-op: PRD 5.5 defines no art of its own for "user is
      // speaking" — the duck stays in OUVINDO either way.
      case "USER_SPEAKING":
        return state;
      case "USER_TURN_END":
        return state.status === DUCK_STATES.OUVINDO
          ? { status: DUCK_STATES.PENSANDO }
          : state;
      case "DUCK_AUDIO":
        // Model audio can arrive while the UI still shows OUVINDO (e.g.
        // without a seen USER_TURN_END), or after PENSANDO.
        if (
          state.status === DUCK_STATES.OUVINDO ||
          state.status === DUCK_STATES.PENSANDO
        ) {
          return { status: DUCK_STATES.FALANDO };
        }
        return state;
      case "DUCK_TURN_END":
      case "INTERRUPTED":
        return state.status === DUCK_STATES.FALANDO
          ? { status: DUCK_STATES.OUVINDO }
          : state;
      case "SLEEP":
        return ACTIVE_STATES.includes(state.status)
          ? { status: DUCK_STATES.SLEEP }
          : state;
      default:
        return state;
    }
  }

  return { DUCK_STATES, ACTIVE_STATES, initialDuckState, duckReducer };
});
