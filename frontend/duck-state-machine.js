"use strict";

(function (globalScope, factory) {
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStateMachineModule = exported;
  }
})(globalThis, function () {
  const DUCK_STATES = Object.freeze({
    OCULTO: "OCULTO",
    VISIVEL: "VISIVEL",
  });

  function initialDuckState() {
    return { status: DUCK_STATES.OCULTO };
  }

  function duckReducer(state, action) {
    const type = typeof action === "object" && action !== null ? action.type : null;
    switch (type) {
      case "SUMMON":
        return { status: DUCK_STATES.VISIVEL };
      case "DISMISS":
        return { status: DUCK_STATES.OCULTO };
      case "SHORTCUT_PRESSED":
        return state.status === DUCK_STATES.OCULTO
          ? { status: DUCK_STATES.VISIVEL }
          : { status: DUCK_STATES.OCULTO };
      default:
        return state;
    }
  }

  return { DUCK_STATES, initialDuckState, duckReducer };
});
