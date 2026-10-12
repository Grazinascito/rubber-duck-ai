"use strict";

(function (globalScope, factory) {
  const stateMachine =
    globalScope.DuckStateMachineModule ||
    (typeof require === "function"
      ? require("./duck-state-machine.js")
      : null);
  const exported = factory(stateMachine);
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else {
    globalScope.DuckStatesModule = exported;
  }
})(globalThis, function (stateMachine) {
  function renderDuck(rootEl, state) {
    rootEl.classList.toggle(
      "is-oculto",
      state.status !== stateMachine.DUCK_STATES.VISIVEL
    );
  }

  function initDuck(rootEl) {
    const api = globalThis.duckApi;
    if (typeof api === "undefined") {
      return;
    }
    let state = stateMachine.initialDuckState();

    function dispatch(action) {
      const next = stateMachine.duckReducer(state, action);
      if (next.status === state.status) {
        return;
      }
      state = next;
      renderDuck(rootEl, state);
      if (state.status === stateMachine.DUCK_STATES.VISIVEL) {
        api.summon();
      } else {
        api.dismiss();
      }
    }

    api.onShortcutPressed(() => dispatch({ type: "SHORTCUT_PRESSED" }));
    api.onTraySummon(() => dispatch({ type: "SUMMON" }));

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
