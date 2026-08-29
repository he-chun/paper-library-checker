(function (root, factory) {
  const api = factory(
    root.PLCI18n || (typeof require === "function" ? require("./common/i18n.js") : null),
    root.PLCUIState || (typeof require === "function" ? require("./common/ui-state.js") : null)
  );
  root.PLCPopup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (i18n, uiState) {
  const PAGE_STATE_POLL_INTERVAL_MS = 200;
  const PAGE_STATE_POLL_TIMEOUT_MS = 35000;

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

    const engine = health?.engine || health?.capabilities?.engine;
    const engineKey = engine === "indexed" ? "engineIndexed" :
      engine === "direct" ? "engineDirect" :
        health?.mode === "enhanced" ? "engineEnhanced" : "engineUnavailable";
    setText(documentObject, "engineState", i18n.t(engineKey),
      !connected ? "error" : engine === "direct" ? "warning" : "good");

    const lifecycleState = health?.index?.state || health?.indexState;
    const lifecycleKey = indexStateMessageKey(lifecycleState, health?.mode);
    const lifecycleGood = lifecycleState === "ready" || (health?.mode === "enhanced" && health?.indexReady === true);
    setText(documentObject, "standardIndexState", i18n.t(lifecycleKey),
      !connected ? "error" : lifecycleGood ? "good" : "warning");

    let capabilityKey = "matchingUnavailable";
    let capabilityState = "error";
    if (connected && health?.mode === "standard") {
      const isDirect = health?.capabilities?.engine === "direct" ||
        health?.capabilities?.completeNegativeResults === false;
      capabilityKey = isDirect ? "directMatchingCapabilities" : "standardMatchingCapabilities";
      capabilityState = isDirect ? "warning" : "good";
    } else if (connected && health?.mode === "enhanced") {
      capabilityKey = health?.indexReady === true ? "enhancedMatchingCapabilities" : "indexing";
      capabilityState = health?.indexReady === true ? "good" : "warning";
    }
    setText(documentObject, "indexState", i18n.t(capabilityKey), capabilityState);

    const complete = health?.complete ?? health?.capabilities?.complete;
    const completenessKey = !connected ? "resultUnavailable" :
      engine === "direct" ? "resultDirectIncomplete" :
        health?.freshness === "stale" || ["stale", "refreshing", "error"].includes(lifecycleState)
          ? "resultStale" : complete === false ? "resultIncomplete" : "resultComplete";
    setText(documentObject, "completenessState", i18n.t(completenessKey),
      !connected ? "error" : completenessKey === "resultComplete" ? "good" : "warning");

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

  function indexStateMessageKey(state, mode) {
    if (mode === "enhanced") return state === "ready" ? "indexStateReady" : "indexStateEnhanced";
    const keys = {
      not_built: "indexStateNotBuilt",
      building: "indexStateBuilding",
      ready: "indexStateReady",
      stale: "indexStateStale",
      refreshing: "indexStateRefreshing",
      error: "indexStateError"
    };
    return keys[state] || "indexStateNotBuilt";
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
      uiState.PAGE_STATES.CHECKING, uiState.PAGE_STATES.CHOOSE_ITEM,
      uiState.PAGE_STATES.STALE_MATCH, uiState.PAGE_STATES.STALE_UNKNOWN].includes(state);
    setText(documentObject, "pageState", i18n.t(uiState.messageKeyForPageState(state)),
      good ? "good" : missing ? "missing" : warning ? "warning" : "error");
    const checkButton = documentObject.querySelector("#checkPage");
    if (checkButton) {
      checkButton.disabled = [uiState.PAGE_STATES.UNSUPPORTED, uiState.PAGE_STATES.CHECKING].includes(state);
    }
  }

  async function getActiveTab(chromeObject) {
    const tabs = await chromeObject.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  async function readPageState(chromeObject) {
    const tab = await getActiveTab(chromeObject);
    if (!tab || typeof tab.id !== "number") return { tab: null, state: uiState.PAGE_STATES.UNSUPPORTED };
    return { tab, state: await readTabPageState(chromeObject, tab.id) };
  }

  async function readTabPageState(chromeObject, tabId) {
    try {
      const response = await chromeObject.tabs.sendMessage(tabId, { type: "zotero-check:get-page-state" });
      return response?.ok
        ? uiState.normalizePageState(response.pageState?.state)
        : uiState.PAGE_STATES.ERROR;
    } catch (_error) {
      return uiState.PAGE_STATES.UNSUPPORTED;
    }
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function waitForFinalPageState(chromeObject, tabId, initialState, options = {}) {
    let state = uiState.normalizePageState(initialState);
    if (state !== uiState.PAGE_STATES.CHECKING) return state;
    const intervalMs = options.intervalMs ?? PAGE_STATE_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? PAGE_STATE_POLL_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    while (state === uiState.PAGE_STATES.CHECKING && Date.now() < deadline) {
      await wait(intervalMs);
      state = await readTabPageState(chromeObject, tabId);
    }
    return state;
  }

  async function settlePageState(documentObject, chromeObject, page) {
    renderPageState(documentObject, page.state);
    if (!page.tab || page.state !== uiState.PAGE_STATES.CHECKING) return page;
    const state = await waitForFinalPageState(chromeObject, page.tab.id, page.state);
    renderPageState(documentObject, state);
    return { ...page, state };
  }

  function renderPageLiveStatus(documentObject, state) {
    const key = state === uiState.PAGE_STATES.UNSUPPORTED
      ? "popupStatusUnsupported"
      : state === uiState.PAGE_STATES.ERROR
        ? "popupStatusError"
        : state === uiState.PAGE_STATES.CHECKING
          ? "popupStatusCheckStarted"
          : "popupStatusReady";
    setText(documentObject, "liveStatus", i18n.t(key));
  }

  async function refresh(documentObject, chromeObject) {
    const [health, page] = await Promise.all([
      chromeObject.runtime.sendMessage({ type: "zotero-check:popup-health" }).catch(() => ({ connected: false, indexReady: false })),
      readPageState(chromeObject)
    ]);
    renderHealth(documentObject, health);
    const settledPage = await settlePageState(documentObject, chromeObject, page);
    renderPageLiveStatus(documentObject, settledPage.state);
    return settledPage;
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
      if (!response?.ok) {
        renderPageState(documentObject, uiState.PAGE_STATES.ERROR);
        setText(documentObject, "liveStatus", i18n.t("popupStatusError"));
        return false;
      }
      const startedPage = {
        tab: page.tab,
        state: uiState.normalizePageState(response.pageState?.state)
      };
      renderPageState(documentObject, startedPage.state);
      setText(documentObject, "liveStatus", i18n.t("popupStatusCheckStarted"));
      const settledPage = await settlePageState(documentObject, chromeObject, startedPage);
      renderPageLiveStatus(documentObject, settledPage.state);
      return true;
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
    indexStateMessageKey,
    readPageState,
    readTabPageState,
    refresh,
    renderHealth,
    renderPageState,
    waitForFinalPageState
  };
});
