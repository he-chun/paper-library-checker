(function (root, factory) {
  const api = factory(root.PLCUIState || (typeof require === "function" ? require("./ui-state.js") : null));
  root.PLCPageController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (uiState) {
  function createPageController({ onManualCheck } = {}) {
    let current = { state: uiState.PAGE_STATES.NOT_CHECKED };

    function setState(state) {
      current = { state: uiState.normalizePageState(state) };
      return getState();
    }

    function getState() {
      return { ...current };
    }

    function manualCheck() {
      setState(uiState.PAGE_STATES.CHECKING);
      if (typeof onManualCheck === "function") onManualCheck();
      return getState();
    }

    return { getState, manualCheck, setState };
  }

  return { createPageController };
});
