if (typeof importScripts === "function") {
  importScripts(
    "common/developer-diagnostics.js",
    "common/request-auth.js",
    "common/candidate-normalization.js",
    "common/sender-security.js",
    "backends/enhanced-backend.js",
    "backends/local-api-matcher.js",
    "backends/direct-local-api-backend.js",
    "backends/local-api-backend.js",
    "backends/backend-resolver.js"
  );
}
const PLCSenderSecurity = globalThis.PLCSenderSecurity ||
  (typeof require === "function" ? require("./common/sender-security.js") : null);
const PLCDeveloperDiagnostics = globalThis.PLCDeveloperDiagnostics ||
  (typeof require === "function" ? require("./common/developer-diagnostics.js") : null);
const PLCEnhancedBackend = globalThis.PLCEnhancedBackend ||
  (typeof require === "function" ? require("./backends/enhanced-backend.js") : null);
const PLCDirectLocalApiBackend = globalThis.PLCDirectLocalApiBackend ||
  (typeof require === "function" ? require("./backends/direct-local-api-backend.js") : null);
const PLCBackendResolver = globalThis.PLCBackendResolver ||
  (typeof require === "function" ? require("./backends/backend-resolver.js") : null);

const TRANSLATION_OPTIONS = {
  translationServerMode: "auto"
};
const TRANSLATION_SERVER_ENDPOINT = "http://127.0.0.1:1969/web";
const TRANSLATION_SERVER_TIMEOUT_MS = 5000;
const TRANSLATION_SERVER_PROBE_TIMEOUT_MS = 500;
const TRANSLATION_SERVER_REACHABLE_TTL = 30000;
const MATCH_WORKLOADS = new Set(["detail", "references"]);
let _tsReachable = null;
let diagnosticOperationSequence = 0;
const developerDiagnostics = PLCDeveloperDiagnostics.createDeveloperDiagnostics();
const reportDiagnostic = (event, details) => developerDiagnostics.record(event, details);
const enhancedBackend = PLCEnhancedBackend.createEnhancedBackend({ onDiagnostic: reportDiagnostic });
const standardBackend = PLCDirectLocalApiBackend.createDirectLocalApiBackend({ onDiagnostic: reportDiagnostic });
const backendResolver = PLCBackendResolver.createBackendResolver({ enhancedBackend, standardBackend });

async function refreshDeveloperMode() {
  const stored = await chrome.storage.sync.get({ developerMode: false });
  developerDiagnostics.setEnabled(stored.developerMode === true);
  return developerDiagnostics.isEnabled();
}

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.developerMode) {
    developerDiagnostics.setEnabled(changes.developerMode.newValue === true);
  }
});

async function isTranslationServerReachable() {
  if (_tsReachable !== null && Date.now() - _tsReachable.at < TRANSLATION_SERVER_REACHABLE_TTL) {
    return _tsReachable.value;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSLATION_SERVER_PROBE_TIMEOUT_MS);
    await fetch(TRANSLATION_SERVER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "",
      signal: controller.signal
    });
    clearTimeout(timeout);
    _tsReachable = { value: true, at: Date.now() };
  } catch (error) {
    _tsReachable = { value: false, at: Date.now() };
  }
  return _tsReachable.value;
}
const PRIORITY_TRANSLATION_SERVER_DOMAINS = [
  "sciencedirect.com",
  "springer.com",
  "wiley.com",
  "ieee.org",
  "acm.org",
  "tandfonline.com",
  "pubmed.ncbi.nlm.nih.gov",
  "arxiv.org",
  "doi.org",
  "mdpi.com"
];

async function getOptions() {
  const stored = await chrome.storage.sync.get(TRANSLATION_OPTIONS);
  return { ...TRANSLATION_OPTIONS, ...stored };
}

async function resolveBackend() {
  return backendResolver.resolve();
}

async function probeBackend(existingResolution) {
  const resolution = existingResolution || await resolveBackend();
  const result = resolution.probeResult || await resolution.backend.probe();
  if (resolution.selectedMode === "enhanced") {
    const reason = PLCBackendResolver.enhancedProbeFailure(
      result,
      chrome.runtime.getManifest?.().version || ""
    );
    if (reason) {
      const error = new Error(reason);
      error.code = reason;
      throw error;
    }
  }
  return {
    ...result,
    mode: resolution.selectedMode,
    capabilities: resolution.backend.getCapabilities()
  };
}

async function callZotero(path, body, method = "POST", context = {}) {
  await refreshDeveloperMode();
  const startedAt = Date.now();
  const operationId = ++diagnosticOperationSequence;
  const operation = path === "/health" ? "probe" : path === "/batch-check" ? "batch" : "check";
  developerDiagnostics.record("operation_started", {
    operation,
    operationId,
    workload: context.workload,
    inputCount: operation === "batch" ? body?.items?.length || 0 : undefined
  });
  try {
    const resolution = await resolveBackend();
    developerDiagnostics.record("backend_selected", {
      operation,
      operationId,
      backend: resolution.selectedMode,
      workload: context.workload,
      degradedReason: resolution.degradedReason
    });
    let result;
    if (path === "/health" && method === "GET") {
      result = await probeBackend(resolution);
    } else if (path === "/check" && method === "POST") {
      result = await resolution.backend.check(body, { workload: context.workload });
    } else if (path === "/batch-check" && method === "POST") {
      result = await resolution.backend.batchCheck(body.items || [], {
        scope: context.batchScope,
        batchId: operationId,
        workload: context.workload,
        onProgress: context.onProgress
      });
    } else {
      throw new Error("unsupported_backend_operation");
    }
    const batchResults = Array.isArray(result?.results) ? result.results : null;
    const batchErrorCount = batchResults?.filter((entry) => entry.status === "error").length || 0;
    const outcome = batchResults
      ? batchErrorCount === 0 ? "ok" : batchErrorCount === batchResults.length ? "error" : "partial"
      : result?.status || "ok";
    developerDiagnostics.record("operation_completed", {
      operation,
      operationId,
      backend: resolution.selectedMode,
      workload: context.workload,
      durationMs: Date.now() - startedAt,
      outcome,
      errorCount: batchErrorCount
    });
    return resolution.degradedReason && result && typeof result === "object"
      ? { ...result, degradedReason: resolution.degradedReason }
      : result;
  } catch (error) {
    developerDiagnostics.record("operation_failed", {
      operation,
      operationId,
      workload: context.workload,
      durationMs: Date.now() - startedAt,
      error: error?.code || error?.message || "backend_unavailable"
    });
    throw error;
  }
}

function handleRuntimeMessage(message, sender, sendResponse) {
  if (["zotero-check:popup-health", "zotero-check:probe"].includes(message?.type)) {
    if (!isTrustedExtensionMessage(message, sender)) return false;
    getPopupHealth().then(sendResponse);
    return true;
  }

  if (message?.type === "zotero-check:developer-log") {
    if (!isTrustedExtensionMessage(message, sender)) return false;
    refreshDeveloperMode().then((enabled) => sendResponse({
      enabled,
      entries: enabled ? developerDiagnostics.getEntries() : []
    }));
    return true;
  }

  if (message?.type === "zotero-check:clear-developer-log") {
    if (!isTrustedExtensionMessage(message, sender)) return false;
    developerDiagnostics.clear();
    sendResponse({ ok: true });
    return false;
  }

  if (!isTrustedMessage(message, sender)) {
    return false;
  }

  if (message.type === "zotero-check:match") {
    const isBatch = Array.isArray(message.candidates);
    if (isBatch && message.candidates.length > 200) {
      sendResponse({ ok: false, error: "Batch exceeds 200 candidates" });
      return false;
    }
    const body = isBatch
      ? { items: message.candidates }
      : (message.candidate || message.candidates);
    const path = isBatch ? "/batch-check" : "/check";

    callZotero(path, body, "POST", {
      batchScope: batchScopeForMessage(message, sender),
      workload: matchWorkloadForMessage(message),
      onProgress: isBatch ? batchProgressReporter(message, sender) : undefined
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.type === "zotero-check:translate-url") {
    translateWithTranslationServer(message.url, sender.tab.url)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error.message,
          details: error.details || null
        })
      );

    return true;
  }

  return false;
}

chrome.runtime.onMessage.addListener(handleRuntimeMessage);

function batchScopeForMessage(message, sender) {
  const tabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : "unknown";
  return `tab:${tabId}:${matchWorkloadForMessage(message)}`;
}

function matchWorkloadForMessage(message) {
  return MATCH_WORKLOADS.has(message?.workload) ? message.workload : "default";
}

function batchProgressReporter(message, sender) {
  if (message?.workload !== "references" || !Number.isSafeInteger(message?.requestId) ||
      message.requestId < 1 || !Number.isInteger(sender?.tab?.id)) {
    return undefined;
  }
  const tabId = sender.tab.id;
  const requestId = message.requestId;
  return function reportBatchProgress(entry) {
    if (!Number.isInteger(entry?.index) || entry.index < 0 || !entry?.result || typeof entry.result !== "object") {
      return;
    }
    chrome.tabs?.sendMessage(tabId, {
      type: "zotero-check:batch-progress",
      requestId,
      index: entry.index,
      result: entry.result
    }, () => { void chrome.runtime.lastError; });
  };
}

function isTrustedMessage(message, sender) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") return false;
  if (!PLCSenderSecurity.isTrustedContentScriptSender(sender, chrome.runtime.id)) return false;
  if (message.type === "zotero-check:translate-url") {
    return typeof message.url === "string" && urlsMatch(message.url, sender.tab.url);
  }
  if (message.type === "zotero-check:match") {
    if (message.workload !== undefined && !MATCH_WORKLOADS.has(message.workload)) return false;
    if (message.requestId !== undefined &&
        (message.workload !== "references" || !Array.isArray(message.candidates) ||
          !Number.isSafeInteger(message.requestId) || message.requestId < 1)) {
      return false;
    }
    return Boolean(message.candidate && typeof message.candidate === "object") || Array.isArray(message.candidates);
  }
  return false;
}

function isTrustedExtensionMessage(message, sender) {
  return [
    "zotero-check:popup-health",
    "zotero-check:probe",
    "zotero-check:developer-log",
    "zotero-check:clear-developer-log"
  ].includes(message?.type) &&
    PLCSenderSecurity.isTrustedExtensionPageSender(sender, chrome.runtime);
}

async function getPopupHealth() {
  try {
    const result = await callZotero("/health", null, "GET");
    const health = {
      connected: true,
      indexReady: result.indexReady === true,
      mode: result.mode,
      capabilities: result.capabilities
    };
    if (result.degradedReason) health.degradedReason = result.degradedReason;
    return health;
  } catch (error) {
    const publicError = error?.message === "Pairing token is not configured"
      ? "authentication_missing"
      : error?.code || error?.message || "backend_unavailable";
    return {
      connected: false,
      indexReady: false,
      error: publicError
    };
  }
}

function urlsMatch(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return ["http:", "https:"].includes(a.protocol) && a.href === b.href;
  } catch (error) {
    return false;
  }
}

function validateTranslationTarget(value, tabUrl) {
  if (!urlsMatch(value, tabUrl)) throw new Error("translation_url_mismatch");
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ||
      hostname.endsWith(".local") || hostname === "0.0.0.0" ||
      /^(?:\[)?(?:fc|fd|fe8|fe9|fea|feb)/.test(hostname) ||
      /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new Error("translation_private_target_blocked");
  }
  return url.href;
}

async function translateWithTranslationServer(url, tabUrl) {
  url = validateTranslationTarget(url, tabUrl);
  const options = await getOptions();
  if (!shouldTryTranslationServer(url, options)) {
    throw makeTranslationServerError("translation_server_disabled", { url });
  }

  const reachable = await isTranslationServerReachable();
  if (!reachable) {
    throw makeTranslationServerError("translation_server_unavailable", { url });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_SERVER_TIMEOUT_MS);
  try {
    const response = await fetch(TRANSLATION_SERVER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: String(url || ""),
      signal: controller.signal
    });
    const payload = await readTranslationServerPayload(response);

    if (response.status === 200) {
      return {
        type: "items",
        items: normalizeTranslationServerItems(payload),
        status: response.status
      };
    }
    if (response.status === 300) {
      return {
        type: "multiple",
        choices: normalizeTranslationServerChoices(payload),
        status: response.status
      };
    }

    throw makeTranslationServerError("translation_server_http_error", {
      status: response.status,
      statusText: response.statusText,
      body: payload
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw makeTranslationServerError("translation_server_timeout", {
        timeoutMs: TRANSLATION_SERVER_TIMEOUT_MS,
        url
      });
    }
    if (error.details) {
      throw error;
    }
    _tsReachable = { value: false, at: Date.now() };
    throw makeTranslationServerError("translation_server_unavailable", {
      message: String(error && error.message ? error.message : error),
      url
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTryTranslationServer(url, options) {
  const mode = options.translationServerMode || "auto";
  if (mode === "off") {
    return false;
  }
  if (mode === "always") {
    return true;
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PRIORITY_TRANSLATION_SERVER_DOMAINS.some((domain) =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch (error) {
    return false;
  }
}

async function readTranslationServerPayload(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function normalizeTranslationServerItems(payload) {
  const items = Array.isArray(payload) ? payload : payload && Array.isArray(payload.items) ? payload.items : [];
  return items.map(normalizeTranslationServerItem).filter((item) => item.title || item.DOI || item.PMID || item.ISBN);
}

function normalizeTranslationServerChoices(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeTranslationServerChoice).filter(Boolean);
  }
  if (payload && Array.isArray(payload.choices)) {
    return payload.choices.map(normalizeTranslationServerChoice).filter(Boolean);
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items.map(normalizeTranslationServerChoice).filter(Boolean);
  }
  if (payload && typeof payload === "object") {
    return Object.entries(payload).map(([key, value]) =>
      normalizeTranslationServerChoice(typeof value === "object" ? { title: key, ...value } : { title: key, value })
    ).filter(Boolean);
  }
  return [];
}

function normalizeTranslationServerChoice(choice = {}) {
  if (typeof choice === "string") {
    return normalizeTranslationServerItem({ title: choice });
  }
  const item = normalizeTranslationServerItem(choice.item || choice);
  item.choiceLabel = choice.label || choice.title || item.title;
  return item.title || item.choiceLabel ? item : null;
}

function normalizeTranslationServerItem(item = {}) {
  return {
    itemType: item.itemType || "journalArticle",
    title: item.title || "",
    DOI: item.DOI || item.doi || "",
    PMID: item.PMID || item.pmid || "",
    ISBN: item.ISBN || item.isbn || "",
    creators: Array.isArray(item.creators) ? item.creators : [],
    date: item.date || item.year || "",
    url: item.url || item.uri || "",
    publicationTitle: item.publicationTitle || item.journalAbbreviation || "",
    metadataSource: "translation-server"
  };
}

function makeTranslationServerError(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  return error;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    batchScopeForMessage,
    batchProgressReporter,
    callZotero,
    getPopupHealth,
    probeBackend,
    handleRuntimeMessage,
    isTrustedExtensionMessage,
    isTrustedMessage,
    matchWorkloadForMessage,
    resolveBackend,
    urlsMatch,
    validateLoopbackEndpoint: PLCEnhancedBackend.validateLoopbackEndpoint,
    validateTranslationTarget,
    developerDiagnostics,
    refreshDeveloperMode
  };
}
