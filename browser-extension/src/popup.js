(function (root, factory) {
  const api = factory(
    root.PLCI18n || (typeof require === "function" ? require("./common/i18n.js") : null),
    root.PLCUIState || (typeof require === "function" ? require("./common/ui-state.js") : null)
  );
  root.PLCPopup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (i18n, uiState) {
  function setText(documentObject, id, text, state) {
    const node = documentObject.querySelector(`#${id}`);
    if (!node) return;
    node.textContent = text;
    if (state) node.dataset.state = state;
  }

  function renderHealth(documentObject, health) {
    const connected = health?.connected === true;
    setText(documentObject, "zoteroState", i18n.t(connected ? "connected" : "offline"), connected ? "good" : "error");
    const modeKey = health?.mode === "enhanced" ? "activeModeEnhanced" :
      health?.mode === "standard" ? "activeModeStandard" : "activeModeUnavailable";
    setText(documentObject, "modeState", i18n.t(modeKey), connected ? "good" : "error");

    let capabilityKey = "matchingUnavailable";
    let capabilityState = "error";
    if (connected && health?.mode === "standard") {
      capabilityKey = "standardMatchingCapabilities";
      capabilityState = "good";
    } else if (connected && health?.mode === "enhanced") {
      capabilityKey = health?.indexReady === true ? "enhancedMatchingCapabilities" : "indexing";
      capabilityState = health?.indexReady === true ? "good" : "warning";
    }
    setText(documentObject, "indexState", i18n.t(capabilityKey), capabilityState);

    const fallback = documentObject.querySelector("#fallbackState");
    const fallbackLabel = documentObject.querySelector("#fallbackLabel");
    const hasFallback = connected && Boolean(health?.degradedReason);
    if (fallback) {
      fallback.hidden = !hasFallback;
      fallback.textContent = hasFallback ? i18n.t(degradedReasonKey(health.degradedReason)) : "";
    }
    if (fallbackLabel) fallbackLabel.hidden = !hasFallback;

    const repairHint = documentObject.querySelector("#repairHint");
    const repairButton = documentObject.querySelector("#repairConnection");
    const needsRepair = !connected || hasFallback;
    if (repairHint) {
      repairHint.hidden = !needsRepair;
      repairHint.textContent = needsRepair
        ? i18n.t(hasFallback ? "repairEnhancedHint" : errorHintKey(health?.error))
        : "";
    }
    if (repairButton) repairButton.hidden = !needsRepair;
  }

  function degradedReasonKey(reason) {
    const keys = {
      enhanced_backend_unavailable: "fallbackEnhancedUnavailable",
      enhanced_backend_incompatible: "fallbackEnhancedIncompatible",
      enhanced_index_unavailable: "fallbackEnhancedIndexUnavailable"
    };
    return keys[reason] || "fallbackEnhancedUnavailable";
  }

  function errorHintKey(error) {
    const keys = {
      local_api_disabled: "repairLocalApiDisabled",
      local_api_incompatible: "repairLocalApiIncompatible",
      enhanced_backend_incompatible: "repairEnhancedIncompatible",
      enhanced_index_unavailable: "repairEnhancedIndex",
      authentication_missing: "repairAuthentication"
    };
    return keys[error] || "repairZoteroOffline";
  }

  function renderPageState(documentObject, pageState) {
    const state = uiState.normalizePageState(pageState);
    const good = state === uiState.PAGE_STATES.SAVED;
    const missing = state === uiState.PAGE_STATES.NOT_SAVED;
    const warning = [uiState.PAGE_STATES.POSSIBLE_MATCH, uiState.PAGE_STATES.NOT_CHECKED,
      uiState.PAGE_STATES.CHECKING, uiState.PAGE_STATES.CHOOSE_ITEM].includes(state);
    setText(documentObject, "pageState", i18n.t(uiState.messageKeyForPageState(state)),
      good ? "good" : missing ? "missing" : warning ? "warning" : "error");
    const checkButton = documentObject.querySelector("#checkPage");
    if (checkButton) checkButton.disabled = state === uiState.PAGE_STATES.UNSUPPORTED;
  }

  async function getActiveTab(chromeObject) {
    const tabs = await chromeObject.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function readPageState(chromeObject) {
    const tab = await getActiveTab(chromeObject);
    if (!tab || typeof tab.id !== "number") return { tab: null, state: uiState.PAGE_STATES.UNSUPPORTED };
    try {
      const response = await chromeObject.tabs.sendMessage(tab.id, { type: "zotero-check:get-page-state" });
      return { tab, state: response?.ok ? response.pageState?.state : uiState.PAGE_STATES.ERROR };
    } catch (_error) {
      return { tab, state: uiState.PAGE_STATES.UNSUPPORTED };
    }
  }

  async function refresh(documentObject, chromeObject) {
    const [health, page] = await Promise.all([
      chromeObject.runtime.sendMessage({ type: "zotero-check:popup-health" }).catch(() => ({ connected: false, indexReady: false })),
      readPageState(chromeObject)
    ]);
    renderHealth(documentObject, health);
    renderPageState(documentObject, page.state);
    setText(documentObject, "liveStatus", i18n.t(page.state === uiState.PAGE_STATES.UNSUPPORTED ? "popupStatusUnsupported" : "popupStatusReady"));
    return page;
  }

  async function checkCurrentPage(documentObject, chromeObject) {
    const page = await readPageState(chromeObject);
    if (!page.tab || page.state === uiState.PAGE_STATES.UNSUPPORTED) {
      renderPageState(documentObject, uiState.PAGE_STATES.UNSUPPORTED);
      setText(documentObject, "liveStatus", i18n.t("popupStatusUnsupported"));
      return false;
    }
    try {
      const response = await chromeObject.tabs.sendMessage(page.tab.id, { type: "zotero-check:manual-page-check" });
      renderPageState(documentObject, response?.ok ? response.pageState?.state : uiState.PAGE_STATES.ERROR);
      setText(documentObject, "liveStatus", i18n.t(response?.ok ? "popupStatusCheckStarted" : "popupStatusError"));
      return response?.ok === true;
    } catch (_error) {
      renderPageState(documentObject, uiState.PAGE_STATES.UNSUPPORTED);
      setText(documentObject, "liveStatus", i18n.t("popupStatusUnsupported"));
      return false;
    }
  }

  function initialize(documentObject, chromeObject) {
    i18n.localizeDocument(documentObject);
    documentObject.querySelector("#checkPage")?.addEventListener("click", () => checkCurrentPage(documentObject, chromeObject));
    documentObject.querySelector("#openOptions")?.addEventListener("click", () => chromeObject.runtime.openOptionsPage());
    documentObject.querySelector("#repairConnection")?.addEventListener("click", () => chromeObject.runtime.openOptionsPage());
    return refresh(documentObject, chromeObject);
  }

  if (typeof document !== "undefined" && typeof chrome !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => initialize(document, chrome));
  }

  return {
    checkCurrentPage,
    degradedReasonKey,
    errorHintKey,
    getActiveTab,
    initialize,
    readPageState,
    refresh,
    renderHealth,
    renderPageState
  };
});
