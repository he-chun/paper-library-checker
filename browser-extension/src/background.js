if (typeof importScripts === "function") {
  importScripts("common/request-auth.js", "common/candidate-normalization.js");
}
const PLCRequestAuth = globalThis.PLCRequestAuth || (typeof require === "function" ? require("./common/request-auth.js") : null);
const PLCCandidateNormalization = globalThis.PLCCandidateNormalization ||
  (typeof require === "function" ? require("./common/candidate-normalization.js") : null);

const DEFAULT_OPTIONS = {
  endpoint: "http://127.0.0.1:23119/zotero-checker",
  translationServerMode: "auto"
};
const TRANSLATION_SERVER_ENDPOINT = "http://127.0.0.1:1969/web";
const TRANSLATION_SERVER_TIMEOUT_MS = 5000;
const TRANSLATION_SERVER_PROBE_TIMEOUT_MS = 500;
const TRANSLATION_SERVER_REACHABLE_TTL = 30000;
let _tsReachable = null;

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
  const [stored, secrets] = await Promise.all([
    chrome.storage.sync.get(DEFAULT_OPTIONS),
    chrome.storage.local.get({ token: "" })
  ]);
  return { ...DEFAULT_OPTIONS, ...stored, token: secrets.token || "" };
}

async function callZotero(path, body, method = "POST") {
  const options = await getOptions();
  const endpoint = validateLoopbackEndpoint(options.endpoint);
  if (!PLCRequestAuth.isUsableSecret(options.token)) {
    throw new Error("Pairing token is not configured");
  }
  const payload = method === "GET"
    ? null
    : path === "/batch-check"
      ? { items: (body.items || []).map(PLCCandidateNormalization.normalizeCandidateForLocalAPI) }
      : { item: PLCCandidateNormalization.normalizeCandidateForLocalAPI(body) };
  const bodyText = payload ? JSON.stringify(payload) : "";
  const headers = await PLCRequestAuth.createHeaders({
    secret: options.token,
    method,
    path: `/zotero-checker${path}`,
    body: bodyText
  });
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: payload ? bodyText : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw makeLocalApiError(response.status, result.error || "request_failed");
  return result;
}

function makeLocalApiError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    callZotero(path, body)
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
});

function isTrustedMessage(message, sender) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") return false;
  if (!sender || sender.id !== chrome.runtime.id || !sender.tab || typeof sender.tab.url !== "string") return false;
  if (message.type === "zotero-check:translate-url") {
    return typeof message.url === "string" && urlsMatch(message.url, sender.tab.url);
  }
  if (message.type === "zotero-check:match") {
    return Boolean(message.candidate && typeof message.candidate === "object") || Array.isArray(message.candidates);
  }
  return false;
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

function validateLoopbackEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname.replace(/\/$/, "") !== "/zotero-checker") {
    throw new Error("Zotero endpoint must use HTTP on a loopback hostname");
  }
  return url.href.replace(/\/$/, "");
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
    callZotero,
    isTrustedMessage,
    makeLocalApiError,
    urlsMatch,
    validateLoopbackEndpoint,
    validateTranslationTarget
  };
}
