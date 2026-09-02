var optionsI18n = globalThis.PLCI18n || (typeof require === "function" ? require("./common/i18n.js") : null);
var optionsRequestAuth = globalThis.PLCRequestAuth ||
  (typeof require === "function" ? require("./common/request-auth.js") : null);
var optionsVisualPreferences = globalThis.PLCVisualPreferences ||
  (typeof require === "function" ? require("./common/visual-preferences.js") : null);

var DEFAULT_OPTIONS = Object.assign({
  endpoint: "http://127.0.0.1:23119/zotero-checker",
  connectionMode: "auto",
  translationServerMode: "auto",
  developerMode: false,
  autoCheckReferenceLists: false,
  broadPageDetection: false
}, optionsVisualPreferences.DEFAULT_VISUAL_PREFERENCES);
var indexStatusTimer = null;

function validateEndpoint(value) {
  var url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname.replace(/\/$/, "") !== "/zotero-checker") {
    throw new Error(optionsI18n.t("endpointError"));
  }
  return url.href.replace(/\/$/, "");
}

function readPairingToken() {
  var token = document.querySelector("#token").value.trim();
  if (!optionsRequestAuth.isUsableSecret(token)) {
    throw new Error(optionsI18n.t("pairingTokenError"));
  }
  return token;
}

function normalizeConnectionMode(value) {
  return ["auto", "standard", "enhanced"].includes(value) ? value : "auto";
}

function connectionStorageUpdate(draft) {
  var mode = normalizeConnectionMode(draft.connectionMode);
  var sync = { connectionMode: mode };
  var local = {};
  if (mode === "enhanced") {
    sync.endpoint = validateEndpoint(draft.endpoint);
    if (!optionsRequestAuth.isUsableSecret(draft.token)) throw new Error(optionsI18n.t("pairingTokenError"));
    local.token = draft.token;
  } else if (mode === "auto") {
    sync.endpoint = validateEndpoint(draft.endpoint);
    if (draft.token) {
      if (!optionsRequestAuth.isUsableSecret(draft.token)) throw new Error(optionsI18n.t("pairingTokenError"));
      local.token = draft.token;
    }
  }
  return { sync, local };
}

function selectedMode() {
  var radio = document.querySelector("input[name=\"connectionMode\"]:checked");
  return normalizeConnectionMode(radio?.value);
}

function updateConnectionFields(mode) {
  var settings = document.querySelector("#enhancedSettings");
  mode = normalizeConnectionMode(mode);
  settings.hidden = mode === "standard";
  settings.open = mode === "enhanced";
}

function setStatus(message, isError) {
  var status = document.querySelector("#status");
  status.textContent = message;
  status.style.color = isError ? "#a40000" : "#176b32";
}

async function load() {
  var options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  var secrets = await chrome.storage.local.get({ token: "" });
  var legacySync = await chrome.storage.sync.get({ token: "" });
  var legacyDefault = ["zotero", "check", "local", "dev"].join("-");
  if (!secrets.token && legacySync.token && legacySync.token !== legacyDefault) {
    secrets.token = legacySync.token;
    await chrome.storage.local.set({ token: secrets.token });
  }
  await chrome.storage.sync.remove("token");
  document.querySelector("#endpoint").value = options.endpoint;
  document.querySelector("#token").value = secrets.token;
  var connectionMode = normalizeConnectionMode(options.connectionMode);
  var connectionRadio = document.querySelector(`input[name="connectionMode"][value="${connectionMode}"]`);
  if (connectionRadio) connectionRadio.checked = true;
  updateConnectionFields(connectionMode);
  var mode = options.translationServerMode || "auto";
  var radio = document.querySelector(`input[name="translationServerMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  renderVisualPreferences(options);
  document.querySelector("#autoCheckReferenceLists").checked = !!options.autoCheckReferenceLists;
  document.querySelector("#broadPageDetection").checked = !!options.broadPageDetection;
  document.querySelector("#developerMode").checked = !!options.developerMode;
  updateDeveloperPanel(!!options.developerMode);
  if (options.developerMode) await refreshDeveloperLog();
  await refreshIndexStatus();
}

function indexStateKey(state) {
  var keys = {
    not_built: "indexStateNotBuilt",
    building: "indexStateBuilding",
    ready: "indexStateReady",
    stale: "indexStateStale",
    refreshing: "indexStateRefreshing",
    error: "indexStateError"
  };
  return keys[state] || "indexStateNotBuilt";
}

function formatIndexDate(value) {
  if (!value) return optionsI18n.t("unknownValue");
  var date = new Date(value);
  return Number.isNaN(date.getTime()) ? optionsI18n.t("unknownValue") : date.toLocaleString();
}

function renderIndexStatus(status) {
  status = status || { state: "not_built" };
  document.querySelector("#optionIndexState").textContent = optionsI18n.t(indexStateKey(status.state));
  document.querySelector("#optionIndexItems").textContent = String(status.itemCount || 0);
  document.querySelector("#optionIndexLibraries").textContent = String(status.libraryCount || 0);
  document.querySelector("#optionIndexUpdated").textContent = formatIndexDate(status.lastSuccessfulBuildAt);
  document.querySelector("#optionIndexProgress").textContent = optionsI18n.t(
    "indexProgressValue",
    [status.processedItems || 0, status.totalItems == null ? optionsI18n.t("unknownValue") : status.totalItems]
  );
  var busy = ["building", "refreshing"].includes(status.state);
  document.querySelector("#refreshIndex").disabled = busy;
  document.querySelector("#rebuildIndex").disabled = busy;
  document.querySelector("#cancelIndex").disabled = !busy;
  clearTimeout(indexStatusTimer);
  if (busy) indexStatusTimer = setTimeout(() => refreshIndexStatus().catch(() => {}), 1000);
}

async function refreshIndexStatus() {
  var response = await chrome.runtime.sendMessage({ type: "get-index-status" });
  if (!response?.ok) throw new Error(optionsI18n.t("indexActionFailed"));
  renderIndexStatus(response.status);
  return response.status;
}

async function runIndexAction(type) {
  var actionStatus = document.querySelector("#indexActionStatus");
  actionStatus.textContent = optionsI18n.t("indexActionWorking");
  try {
    var response = await chrome.runtime.sendMessage({ type });
    if (!response?.ok) throw new Error(response?.error || "index_action_failed");
    actionStatus.textContent = optionsI18n.t("indexActionAccepted");
    await refreshIndexStatus();
    return response;
  } catch (_error) {
    actionStatus.textContent = optionsI18n.t("indexActionFailed");
    return null;
  }
}

async function save() {
  try {
    var connection = connectionStorageUpdate({
      connectionMode: selectedMode(),
      endpoint: document.querySelector("#endpoint").value.trim(),
      token: document.querySelector("#token").value.trim()
    });
    var modeRadio = document.querySelector("input[name=\"translationServerMode\"]:checked");
    var visual = readVisualPreferences();
    await chrome.storage.sync.set({
      ...connection.sync,
      ...visual,
      translationServerMode: modeRadio ? modeRadio.value : "auto",
      developerMode: document.querySelector("#developerMode").checked,
      autoCheckReferenceLists: document.querySelector("#autoCheckReferenceLists").checked,
      broadPageDetection: document.querySelector("#broadPageDetection").checked
    });
    if (Object.keys(connection.local).length) await chrome.storage.local.set(connection.local);
    await chrome.storage.sync.remove("token");
    setStatus(optionsI18n.t("saved"), false);
    updateDeveloperPanel(document.querySelector("#developerMode").checked);
    if (document.querySelector("#developerMode").checked) await refreshDeveloperLog();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function updatePageEdgeWidthOutput() {
  var input = document.querySelector("#pageEdgeWidth");
  var output = document.querySelector("#pageEdgeWidthOutput");
  if (input && output) output.textContent = String(input.value) + " px";
}

function renderVisualPreferences(value) {
  var visual = optionsVisualPreferences.normalizeVisualPreferences(value);
  document.querySelector("#highlightSearchResultRows").checked = visual.highlightSearchResultRows;
  document.querySelector("#searchResultMatchedBackground").value = visual.searchResultMatchedBackground;
  document.querySelector("#searchResultPossibleBackground").value = visual.searchResultPossibleBackground;
  document.querySelector("#enablePageGlow").checked = visual.enablePageGlow;
  document.querySelector("#pageEdgeStyle").value = visual.pageEdgeStyle;
  document.querySelector("#pageEdgeWidth").value = String(visual.pageEdgeWidth);
  document.querySelector("#pageEdgeMatchedColor").value = visual.pageEdgeMatchedColor;
  document.querySelector("#pageEdgePossibleColor").value = visual.pageEdgePossibleColor;
  document.querySelector("#pageEdgeMissingColor").value = visual.pageEdgeMissingColor;
  document.querySelector("#pageEdgeUnknownColor").value = visual.pageEdgeUnknownColor;
  document.querySelector("#pageEdgeErrorColor").value = visual.pageEdgeErrorColor;
  updatePageEdgeWidthOutput();
  return visual;
}

function readVisualPreferences() {
  return optionsVisualPreferences.normalizeVisualPreferences({
    highlightSearchResultRows: document.querySelector("#highlightSearchResultRows").checked,
    searchResultMatchedBackground: document.querySelector("#searchResultMatchedBackground").value,
    searchResultPossibleBackground: document.querySelector("#searchResultPossibleBackground").value,
    enablePageGlow: document.querySelector("#enablePageGlow").checked,
    pageEdgeStyle: document.querySelector("#pageEdgeStyle").value,
    pageEdgeWidth: document.querySelector("#pageEdgeWidth").value,
    pageEdgeMatchedColor: document.querySelector("#pageEdgeMatchedColor").value,
    pageEdgePossibleColor: document.querySelector("#pageEdgePossibleColor").value,
    pageEdgeMissingColor: document.querySelector("#pageEdgeMissingColor").value,
    pageEdgeUnknownColor: document.querySelector("#pageEdgeUnknownColor").value,
    pageEdgeErrorColor: document.querySelector("#pageEdgeErrorColor").value
  });
}

async function resetVisualPreferences() {
  var defaults = Object.assign({}, optionsVisualPreferences.DEFAULT_VISUAL_PREFERENCES);
  renderVisualPreferences(defaults);
  await chrome.storage.sync.set(defaults);
  setStatus(optionsI18n.t("visualPreferencesReset"), false);
  return defaults;
}

function updateDeveloperPanel(enabled) {
  document.querySelector("#developerPanel").hidden = !enabled;
}

function formatDeveloperEntry(entry) {
  return JSON.stringify(entry);
}

async function refreshDeveloperLog() {
  var output = document.querySelector("#developerLog");
  var response = await chrome.runtime.sendMessage({ type: "zotero-check:developer-log" });
  var entries = Array.isArray(response?.entries) ? response.entries : [];
  output.textContent = entries.length
    ? entries.map(formatDeveloperEntry).join("\n")
    : optionsI18n.t("developerLogEmpty");
}

async function clearDeveloperLog() {
  await chrome.runtime.sendMessage({ type: "zotero-check:clear-developer-log" });
  await refreshDeveloperLog();
}

function connectionMessage(status, payload) {
  if (status === 401 && payload.error === "protocol_incompatible") return optionsI18n.t("protocolIncompatibleUpdate");
  if (status === 401) return optionsI18n.t("pairingFailed");
  if (status === 429) return optionsI18n.t("tooManyRequests");
  if (status === 503) return payload.error === "pairing_not_configured"
    ? optionsI18n.t("addonNotPaired")
    : optionsI18n.t("addonUnavailable");
  return optionsI18n.t("connectionFailed", status);
}

function isCompatibleAddonVersion(addonVersion, extensionVersion) {
  return typeof addonVersion === "string" && typeof extensionVersion === "string" &&
    addonVersion === extensionVersion;
}

async function testConnection() {
  try {
    await save();
    var health = await chrome.runtime.sendMessage({ type: "zotero-check:probe" });
    if (!health?.connected) throw new Error(optionsI18n.t(errorMessageKey(health?.error)));
    var modeKey = health.mode === "enhanced" ? "connectionModeEnhanced" : "connectionModeStandard";
    setStatus(optionsI18n.t("connectedMode", optionsI18n.t(modeKey)), false);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function errorMessageKey(code) {
  var keys = {
    local_api_disabled: "localApiDisabled",
    local_api_incompatible: "localApiIncompatible",
    local_api_timeout: "localApiTimeout",
    enhanced_backend_incompatible: "unexpectedAddonVersion",
    enhanced_index_unavailable: "indexNotReady",
    authentication_missing: "pairingTokenMissing"
  };
  return keys[code] || "backendUnavailable";
}

function toggleToken() {
  var input = document.querySelector("#token");
  var button = document.querySelector("#toggleToken");
  var show = input.type === "password";
  input.type = show ? "text" : "password";
  button.textContent = optionsI18n.t(show ? "hideToken" : "showToken");
  button.setAttribute("aria-pressed", String(show));
}

if (typeof document !== "undefined") {
  optionsI18n.localizeDocument(document);
  document.querySelector("#save").addEventListener("click", save);
  document.querySelector("#testConnection").addEventListener("click", testConnection);
  document.querySelector("#toggleToken").addEventListener("click", toggleToken);
  document.querySelector("#developerMode").addEventListener("change", (event) => updateDeveloperPanel(event.target.checked));
  document.querySelector("#refreshDeveloperLog").addEventListener("click", () => refreshDeveloperLog().catch((error) => setStatus(error.message, true)));
  document.querySelector("#clearDeveloperLog").addEventListener("click", () => clearDeveloperLog().catch((error) => setStatus(error.message, true)));
  document.querySelector("#pageEdgeWidth").addEventListener("input", updatePageEdgeWidthOutput);
  document.querySelector("#resetVisualPreferences").addEventListener("click", () => resetVisualPreferences().catch((error) => setStatus(error.message, true)));
  document.querySelector("#refreshIndex").addEventListener("click", () => runIndexAction("start-index-build"));
  document.querySelector("#clearIndex").addEventListener("click", () => runIndexAction("clear-index"));
  document.querySelector("#rebuildIndex").addEventListener("click", () => runIndexAction("clear-and-rebuild-index"));
  document.querySelector("#cancelIndex").addEventListener("click", () => runIndexAction("cancel-index-build"));
  for (var connectionRadio of document.querySelectorAll("input[name=\"connectionMode\"]")) {
    connectionRadio.addEventListener("change", () => updateConnectionFields(selectedMode()));
  }
  load().catch((error) => setStatus(error.message, true));
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  DEFAULT_OPTIONS,
  connectionStorageUpdate,
  connectionMessage,
  errorMessageKey,
  formatDeveloperEntry,
  formatIndexDate,
  isCompatibleAddonVersion,
  load,
  normalizeConnectionMode,
  readVisualPreferences,
  renderVisualPreferences,
  resetVisualPreferences,
  indexStateKey,
  refreshIndexStatus,
  renderIndexStatus,
  runIndexAction,
  save,
  testConnection,
  updateDeveloperPanel,
  updatePageEdgeWidthOutput,
  updateConnectionFields,
  validateEndpoint
};
