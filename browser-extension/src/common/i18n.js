(function (root, factory) {
  const api = factory();
  root.PLCI18n = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EN_MESSAGES = Object.freeze({
    extensionName: "Paper Library Checker",
    extensionDescription: "Check scholarly pages against a local Zotero library in standard or enhanced mode.",
    actionTitle: "Paper Library Checker",
    optionsTitle: "Paper Library Checker Options",
    optionsHeading: "Paper Library Checker",
    productTagline: "A local-first Zotero library checker",
    connectionModeLabel: "Connection method",
    connectionModeAuto: "Automatic (recommended)",
    connectionModeAutoDescription: "Use enhanced mode when available, otherwise use standard mode.",
    connectionModeStandard: "Standard mode",
    connectionModeStandardDescription: "No Zotero add-on required. Supports exact matching and reference-list batch checks.",
    connectionModeEnhanced: "Enhanced mode",
    connectionModeEnhancedDescription: "With the Zotero add-on: faster batches, full fuzzy matching, Possible match, and real-time index updates.",
    enhancedSettingsLabel: "Enhanced mode connection settings",
    standardIndexHeading: "Standard mode index",
    standardIndexDescription: "A local minimal index makes exact detail and reference checks fast. Refreshing keeps the previous index available until the replacement is complete.",
    indexStatusLabel: "Status",
    indexItemCountLabel: "Items",
    indexLibraryCountLabel: "Libraries",
    indexLastUpdatedLabel: "Last successful update",
    indexProgressLabel: "Progress",
    refreshIndex: "Refresh index",
    clearIndex: "Clear index",
    rebuildIndex: "Clear and rebuild",
    cancelIndex: "Cancel build",
    indexStateNotBuilt: "Not built",
    indexStateBuilding: "Building",
    indexStateReady: "Ready",
    indexStateStale: "Needs update",
    indexStateRefreshing: "Refreshing",
    indexStateError: "Error; previous index remains available when present",
    indexStateEnhanced: "Managed by the Zotero add-on",
    indexProgressValue: "$1 / $2 items",
    unknownValue: "Unknown",
    indexActionWorking: "Working…",
    indexActionAccepted: "Index action accepted.",
    indexActionFailed: "Index action failed.",
    endpointLabel: "Zotero plugin endpoint",
    pairingTokenLabel: "Pairing token",
    showToken: "Show",
    hideToken: "Hide",
    translationModeLabel: "Translation-server mode",
    translationModeOff: "Off — never use translation-server",
    translationModeAuto: "Auto — try on priority academic domains (default)",
    translationModeAlways: "Always — try on all pages",
    enablePageGlow: "Enable page edge glow — show a colored border around the viewport based on check result",
    autoCheckReferenceLists: "Auto-check reference lists — automatically scan CNKI / ScienceDirect references on page load and scroll",
    broadPageDetection: "Detect article details on supported injected websites",
    developerMode: "Developer mode — collect local performance logs",
    developerModeDescription: "Logs stay in service-worker memory and show backend phases, timings, cache use, counts, and stable errors.",
    developerLogHeading: "Developer log",
    developerLogPrivacy: "Pairing tokens and raw Zotero item records are never logged. Logs are cleared when the service worker restarts.",
    refreshDeveloperLog: "Refresh log",
    clearDeveloperLog: "Clear log",
    developerLogEmpty: "No developer log entries yet.",
    save: "Save",
    testConnection: "Test connection",
    saved: "Saved",
    endpointError: "Endpoint must use 127.0.0.1 or localhost and the Paper Library Checker path",
    pairingTokenError: "Pairing token must be the 64-character value copied from Zotero",
    protocolIncompatibleUpdate: "Protocol incompatible: update the extension and Zotero add-on together",
    pairingFailed: "Pairing failed: the token or signed request was rejected",
    tooManyRequests: "Too many requests: wait and test again",
    addonNotPaired: "Zotero add-on is not paired: copy a new token from Zotero",
    addonUnavailable: "Zotero add-on is temporarily unavailable",
    connectionFailed: "Connection failed (HTTP $1)",
    indexNotReady: "Connected, but the Zotero index is not ready",
    unexpectedAddonVersion: "Protocol incompatible: unexpected add-on version",
    connectedVersion: "Connected to Paper Library Checker $1",
    connectedMode: "Connected using $1",
    localApiDisabled: "Zotero Local API is disabled. Enable it in Zotero's advanced settings.",
    localApiIncompatible: "The available Zotero Local API is not compatible.",
    localApiTimeout: "Zotero Local API timed out.",
    pairingTokenMissing: "Enhanced mode requires a pairing token.",
    backendUnavailable: "Could not connect to Zotero using the selected mode.",
    popupHeading: "Paper Library Checker",
    zoteroLabel: "Zotero",
    indexLabel: "Index",
    actualModeLabel: "Active mode",
    engineLabel: "Engine",
    resultCompletenessLabel: "Result",
    capabilitiesLabel: "Matching",
    fallbackReasonLabel: "Fallback",
    currentPageLabel: "Current page",
    connected: "Connected",
    offline: "Offline",
    ready: "Ready",
    indexing: "Indexing",
    activeModeStandard: "Standard",
    activeModeEnhanced: "Enhanced",
    activeModeUnavailable: "Unavailable",
    engineIndexed: "Local index",
    engineDirect: "Direct-query fallback",
    engineEnhanced: "Zotero add-on",
    engineUnavailable: "Unavailable",
    resultComplete: "Complete exact check",
    resultDirectIncomplete: "Unmatched results may be incomplete",
    resultStale: "Based on the previous index",
    resultIncomplete: "Incomplete",
    resultUnavailable: "Unavailable",
    standardMatchingCapabilities: "Exact matching and batch",
    directMatchingCapabilities: "Direct fallback; unmatched results may be incomplete",
    enhancedMatchingCapabilities: "Full matching and real-time index",
    matchingUnavailable: "Unavailable",
    fallbackEnhancedUnavailable: "Enhanced mode unavailable",
    fallbackEnhancedIncompatible: "Enhanced add-on version incompatible",
    fallbackEnhancedIndexUnavailable: "Enhanced index not ready",
    repairConnection: "Fix connection",
    repairEnhancedHint: "Standard mode is active. Open Options to repair or explicitly select a mode.",
    repairLocalApiDisabled: "Start Zotero and enable the Local API, then test the connection in Options.",
    repairLocalApiIncompatible: "Update Zotero, then test the standard-mode connection again.",
    repairEnhancedIncompatible: "Update the extension and Zotero add-on together.",
    repairEnhancedIndex: "Wait for the add-on index to finish, then check again.",
    repairAuthentication: "Open Options and paste the 64-character pairing token.",
    repairZoteroOffline: "Start Zotero, then open Options to test or change the connection mode.",
    pageSaved: "Saved",
    pagePossibleMatch: "Possible match",
    pagePossiblySaved: "Possibly saved",
    pageNotSaved: "Not saved",
    pageIncompleteNotFound: "No match; result may be incomplete",
    pageStaleMatch: "Saved in previous index",
    pageStaleUnknown: "Waiting for index refresh",
    pageUnrecognized: "Unrecognized",
    pageNotChecked: "Not checked",
    pageUnsupported: "Unsupported page",
    pageError: "Error",
    pageChecking: "Checking",
    pageChooseItem: "Choose item",
    checkThisPage: "Check this page",
    openOptions: "Open options",
    popupStatusLoading: "Checking Zotero and the current page",
    popupStatusReady: "Status updated",
    popupStatusCheckStarted: "Page check started",
    popupStatusUnsupported: "Paper Library Checker is not available on this page",
    popupStatusError: "Unable to read the current page status",
    badgeChecking: "Library: checking",
    badgeCheckingSource: "Library: checking ($1)",
    badgeSaved: "Library: saved",
    badgePossibleMatch: "Library: possible match",
    badgePossiblySaved: "Library: possibly saved",
    badgeNotSaved: "Library: not saved",
    badgeIncompleteNotFound: "Library: no match; result may be incomplete",
    incompleteNotFoundDescription: "Direct Local API search found no candidate. Build or refresh the local index for a complete result.",
    badgeSavedStale: "Library: saved in previous index",
    badgeIndexStale: "Library: index needs update",
    staleIndexResultDescription: "This result uses the previous local index. The page will be checked again after refresh.",
    badgeUnrecognized: "Library: unrecognized",
    badgeChooseItem: "Library: choose item",
    badgeOffline: "Library: offline",
    badgeIndexing: "Library: indexing",
    recheckTooltip: "Re-check this page (drag to move)",
    recheckAriaLabel: "Re-check this page; drag to move",
    translationChoicesTitle: "Choose an article to check",
    translationChoicesDescription: "translation-server returned multiple choices.",
    unsupportedMetadataDescription: "No supported metadata was found on this page.",
    addonConnectionError: "Could not reach the Paper Library Checker add-on.",
    localIndexNotReady: "Local library index is not ready",
    noMatchingItem: "No matching Zotero item.",
    incompleteNotFoundInLibrary: "No match found; the direct-search result may be incomplete",
    noResultReturned: "No result returned",
    savedInLibrary: "Saved in local library",
    savedInStaleIndex: "Found in the previous local index; refresh is in progress",
    staleIndexNoMatch: "No match in the previous index; awaiting refresh",
    possibleInLibrary: "Possible match in local library",
    checkerError: "Paper Library Checker error",
    checkerOffline: "Paper Library Checker is offline",
    untitled: "Untitled"
  });

  function applySubstitutions(message, substitutions) {
    const values = Array.isArray(substitutions) ? substitutions : substitutions == null ? [] : [substitutions];
    return String(message).replace(/\$(\d+)/g, (_match, number) => String(values[Number(number) - 1] ?? ""));
  }

  function t(key, substitutions) {
    const values = Array.isArray(substitutions) ? substitutions : substitutions == null ? [] : [substitutions];
    const runtimeMessage = typeof chrome !== "undefined" && chrome.i18n?.getMessage
      ? chrome.i18n.getMessage(key, values.map(String))
      : "";
    if (runtimeMessage) return runtimeMessage;
    return applySubstitutions(EN_MESSAGES[key] || key, values);
  }

  function localizeDocument(documentObject) {
    if (!documentObject) return;
    const language = typeof chrome !== "undefined" && chrome.i18n?.getUILanguage
      ? chrome.i18n.getUILanguage()
      : "en";
    documentObject.documentElement.lang = language || "en";
    for (const node of documentObject.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    for (const node of documentObject.querySelectorAll("[data-i18n-title]")) {
      node.title = t(node.dataset.i18nTitle);
    }
    for (const node of documentObject.querySelectorAll("[data-i18n-aria-label]")) {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    }
    const titleKey = documentObject.documentElement.dataset.i18nTitle;
    if (titleKey) documentObject.title = t(titleKey);
  }

  return { EN_MESSAGES, applySubstitutions, localizeDocument, t };
});
