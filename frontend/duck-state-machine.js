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
        // The greeting plays right after the session connects (PRD fluxo A).
        return { status: DUCK_STATES.FALANDO };
      case "DISMISS":
        return { status: DUCK_STATES.OCULTO };
      case "SHORTCUT_PRESSED":
        // The summon command wakes a sleeping duck into a new session
        // (PRD 5.5: Sleep exits via "comando de convocação").
        if (
          state.status === DUCK_STATES.OCULTO ||
          state.status === DUCK_STATES.SLEEP
        ) {
          return { status: DUCK_STATES.FALANDO };
        }
        return { status: DUCK_STATES.OCULTO };
      // Explicit no-op: the duck is already listening; US8 uses it for art.
      case "USER_SPEAKING":
        return state;
      case "USER_TURN_END":
        return state.status === DUCK_STATES.OUVINDO
          ? { status: DUCK_STATES.PENSANDO }
          : state;
      case "DUCK_AUDIO":
        return state.status === DUCK_STATES.PENSANDO
          ? { status: DUCK_STATES.FALANDO }
          : state;
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
