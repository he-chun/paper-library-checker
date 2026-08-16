/* global Components, TextDecoder, TextEncoder, crypto */

var ZoteroCheck = ZoteroCheck || {};

ZoteroCheck.Security = (function () {
  const PROTOCOL_VERSION = "1";
  const CONTENT_TYPE = "application/vnd.paper-library-checker+json";
  const LEGACY_AUTH_HEADER = "x-paper-library-checker-token";
  const LEGACY_TOKEN = ["zotero", "check", "local", "dev"].join("-");
  const MAX_BODY_BYTES = 64 * 1024;
  const MAX_BATCH_ITEMS = 200;
  const MAX_CACHE_KEY_BYTES = 48 * 1024;
  const MAX_TITLE_LENGTH = 1000;
  const MAX_IDENTIFIER_LENGTH = 512;
  const MAX_CREATORS = 20;
  const MAX_CREATOR_LENGTH = 256;
  const MAX_URL_LENGTH = 2048;
  const MAX_CLOCK_SKEW_SECONDS = 60;
  const MAX_JSON_DEPTH = 64;
  const MAX_JSON_NODES = 10000;
  const EMBEDDED_CREDENTIAL_KEYS = new Set([
    "token",
    "pairingtoken",
    "authtoken",
    "secret",
    "pairingsecret",
    "authorization"
  ]);

  function randomBytes(length) {
    const generator = Components.classes["@mozilla.org/security/random-generator;1"]
      .getService(Components.interfaces.nsIRandomGenerator);
    const bytes = generator.generateRandomBytes(length);
    return Uint8Array.from(Array.from(bytes, (byte) => {
      const value = typeof byte === "number" ? byte : byte.charCodeAt(0);
      return value & 0xff;
    }));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(value) {
    if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) throw new Error("invalid_hex");
    return Uint8Array.from(value.match(/../g), (byte) => parseInt(byte, 16));
  }

  function base64UrlToBytes(value) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("invalid_signature");
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function generateToken() {
    return bytesToHex(randomBytes(32));
  }

  function isUsableToken(token) {
    return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token) && token !== LEGACY_TOKEN;
  }

  function constantWorkEqual(expected, provided) {
    if (typeof expected !== "string" || typeof provided !== "string") return false;
    let difference = expected.length ^ provided.length;
    const length = Math.max(expected.length, provided.length);
    for (let index = 0; index < length; index += 1) {
      difference |= (expected.charCodeAt(index) || 0) ^ (provided.charCodeAt(index) || 0);
    }
    return difference === 0;
  }

  function normalizeCredentialKey(value) {
    return String(value).toLowerCase().replace(/[_\-\s]/g, "");
  }

  function assertNoEmbeddedCredentials(value, secret, { maximumDepth = MAX_JSON_DEPTH, maximumNodes = MAX_JSON_NODES } = {}) {
    const normalizedSecret = typeof secret === "string" ? secret.toLowerCase() : "";
    const pending = [{ value, depth: 0 }];
    let visited = 0;
    while (pending.length) {
      const current = pending.pop();
      visited += 1;
      if (visited > maximumNodes) throw new ValidationError("json_structure_too_large", 422);
      if (current.depth > maximumDepth) throw new ValidationError("json_nesting_too_deep", 422);
      if (typeof current.value === "string") {
        if (normalizedSecret && constantWorkEqual(normalizedSecret, current.value.toLowerCase())) {
          throw new ValidationError("legacy_auth_rejected", 401);
        }
        continue;
      }
      if (!current.value || typeof current.value !== "object") continue;
      if (Array.isArray(current.value)) {
        for (const entry of current.value) pending.push({ value: entry, depth: current.depth + 1 });
        continue;
      }
      for (const [key, entry] of Object.entries(current.value)) {
        if (EMBEDDED_CREDENTIAL_KEYS.has(normalizeCredentialKey(key))) {
          throw new ValidationError("legacy_auth_rejected", 401);
        }
        pending.push({ value: entry, depth: current.depth + 1 });
      }
    }
  }

  function canonicalize({ method, path, timestamp, nonce, bodyHash }) {
    return [PROTOCOL_VERSION, String(method).toUpperCase(), path, String(timestamp), nonce, bodyHash].join("\n");
  }

  async function sha256Hex(bytes) {
    return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  }

  async function verifyHmac(secret, canonical, signature) {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(canonical)
    );
  }

  function validateRequestSize(headers = {}, { bodyRequired = false } = {}) {
    const value = headers["content-length"];
    if (value == null) return bodyRequired ? "invalid_content_length" : null;
    if (!/^[0-9]+$/.test(String(value))) return "invalid_content_length";
    const length = Number(value);
    if (!Number.isSafeInteger(length) || length < 0) return "invalid_content_length";
    return length > MAX_BODY_BYTES ? "request_too_large" : null;
  }

  function readBodyBytes(stream, length) {
    if (!length) return new Uint8Array();
    if (!stream) throw new ValidationError("missing_raw_body", 400);
    const binary = Components.classes["@mozilla.org/binaryinputstream;1"]
      .createInstance(Components.interfaces.nsIBinaryInputStream);
    binary.setInputStream(stream);
    const bytes = Uint8Array.from(binary.readByteArray(length));
    if (bytes.length !== length) throw new ValidationError("incomplete_body", 400);
    return bytes;
  }

  class ReplayCache {
    constructor({ maximum = 1000, ttlSeconds = MAX_CLOCK_SKEW_SECONDS } = {}) {
      this.maximum = maximum;
      this.ttlSeconds = ttlSeconds;
      this.entries = new Map();
    }

    use(nonce, nowSeconds) {
      const cutoff = nowSeconds - this.ttlSeconds;
      for (const [key, timestamp] of this.entries) {
        if (timestamp < cutoff) this.entries.delete(key);
      }
      if (this.entries.has(nonce)) return false;
      this.entries.set(nonce, nowSeconds);
      while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value);
      return true;
    }

    clear() {
      this.entries.clear();
    }
  }

  async function authenticateRequest({ secret, request, method, path, replayCache, nowSeconds = Math.floor(Date.now() / 1000) }) {
    const headers = Object.fromEntries(Object.entries(request.headers || {})
      .map(([name, value]) => [String(name).toLowerCase(), value]));
    const bodyRequired = method !== "GET";
    const sizeError = validateRequestSize(headers, { bodyRequired });
    if (sizeError) throw new ValidationError(sizeError, sizeError === "request_too_large" ? 413 : 400);
    if (!isUsableToken(secret)) throw new ValidationError("pairing_not_configured", 503);
    const contentType = String(headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (contentType !== CONTENT_TYPE) throw new ValidationError("protocol_incompatible", 401);
    if (headers[LEGACY_AUTH_HEADER] || request.data && typeof request.data === "object" && !bodyRequired) {
      throw new ValidationError("legacy_auth_rejected", 401);
    }
    const protocol = headers["x-plc-protocol"];
    const timestampText = headers["x-plc-timestamp"];
    const nonce = headers["x-plc-nonce"];
    const claimedHash = headers["x-plc-body-sha256"];
    const signature = headers["x-plc-signature"];
    if (protocol !== PROTOCOL_VERSION) throw new ValidationError("protocol_incompatible", 401);
    if (!/^[0-9]{1,12}$/.test(timestampText || "")) throw new ValidationError("invalid_timestamp", 401);
    const timestamp = Number(timestampText);
    if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) throw new ValidationError("timestamp_expired", 401);
    if (!/^[a-f0-9]{32}$/i.test(nonce || "")) throw new ValidationError("invalid_nonce", 401);
    if (!/^[a-f0-9]{64}$/i.test(claimedHash || "")) throw new ValidationError("invalid_body_hash", 401);
    if (!/^[A-Za-z0-9_-]{43}$/.test(signature || "")) throw new ValidationError("invalid_signature", 401);

    const length = Number(headers["content-length"] || 0);
    const bodyBytes = method === "GET"
      ? new Uint8Array()
      : readBodyBytes(request.bodyInputStream || request.data, length);
    const actualHash = await sha256Hex(bodyBytes);
    if (!constantWorkEqual(actualHash, claimedHash.toLowerCase())) throw new ValidationError("body_hash_mismatch", 401);
    const canonical = canonicalize({ method, path, timestamp, nonce, bodyHash: actualHash });
    let verified = false;
    try {
      verified = await verifyHmac(secret, canonical, signature);
    } catch (error) {
      verified = false;
    }
    if (!verified) throw new ValidationError("invalid_signature", 401);
    let bodyText;
    try {
      bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    } catch (error) {
      throw new ValidationError("invalid_utf8", 400);
    }
    if (!replayCache.use(nonce.toLowerCase(), nowSeconds)) throw new ValidationError("nonce_replayed", 401);
    return { bodyBytes, bodyText };
  }

  function cleanString(value, maximum, field) {
    if (value == null || value === "") return "";
    if (typeof value !== "string") throw new ValidationError(`${field}_must_be_string`);
    if (value.length > maximum) throw new ValidationError(`${field}_too_long`);
    return value;
  }

  function sanitizeCandidate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("candidate_must_be_object");
    const creators = value.creators == null ? [] : value.creators;
    if (!Array.isArray(creators) || creators.length > MAX_CREATORS) throw new ValidationError("invalid_creators");
    return {
      title: cleanString(value.title, MAX_TITLE_LENGTH, "title"),
      DOI: cleanString(value.DOI || value.doi, MAX_IDENTIFIER_LENGTH, "doi"),
      PMID: cleanString(value.PMID || value.pmid, MAX_IDENTIFIER_LENGTH, "pmid"),
      ISBN: cleanString(value.ISBN || value.isbn, MAX_IDENTIFIER_LENGTH, "isbn"),
      cnkiFileID: cleanString(value.cnkiFileID || value.cnki, MAX_IDENTIFIER_LENGTH, "cnki"),
      date: cleanString(value.date || value.year, 64, "date"),
      url: cleanString(value.url, MAX_URL_LENGTH, "url"),
      creators: creators.map((creator) => {
        if (typeof creator === "string") return cleanString(creator, MAX_CREATOR_LENGTH, "creator");
        if (!creator || typeof creator !== "object" || Array.isArray(creator)) throw new ValidationError("invalid_creator");
        return {
          name: cleanString(creator.name, MAX_CREATOR_LENGTH, "creator_name"),
          firstName: cleanString(creator.firstName, MAX_CREATOR_LENGTH, "creator_first_name"),
          lastName: cleanString(creator.lastName, MAX_CREATOR_LENGTH, "creator_last_name")
        };
      })
    };
  }

  function sanitizeBatch(items, configuredLimit = MAX_BATCH_ITEMS) {
    if (!Array.isArray(items)) throw new ValidationError("items_must_be_array");
    const limit = Math.min(MAX_BATCH_ITEMS, Math.max(1, Number(configuredLimit) || MAX_BATCH_ITEMS));
    if (items.length > limit) throw new ValidationError("batch_too_large", 413);
    return items.map(sanitizeCandidate);
  }

  function minimizeResult(result) {
    return {
      status: result && result.status || "error",
      matchType: result && result.matchType || null,
      confidence: Number.isFinite(result && result.confidence) ? result.confidence : 0
    };
  }

  function redact(value) {
    const text = String(value == null ? "" : value);
    return text
      .replace(/([?&](?:token|key|secret)=)[^&#\s]+/gi, "$1[REDACTED]")
      .replace(/(authorization|x-paper-library-checker-token)\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]")
      .replace(/[a-f0-9]{64}/gi, "[REDACTED_TOKEN]");
  }

  class ValidationError extends Error {
    constructor(code, status = 422) {
      super(code);
      this.name = "ValidationError";
      this.code = code;
      this.status = status;
    }
  }

  class RateLimiter {
    constructor({ maximum = 120, windowMs = 10000 } = {}) {
      this.maximum = maximum;
      this.windowMs = windowMs;
      this.timestamps = [];
    }
    allow(now = Date.now()) {
      const cutoff = now - this.windowMs;
      while (this.timestamps.length && this.timestamps[0] <= cutoff) this.timestamps.shift();
      if (this.timestamps.length >= this.maximum) return false;
      this.timestamps.push(now);
      return true;
    }
  }

  return {
    CONTENT_TYPE,
    LEGACY_AUTH_HEADER,
    MAX_BODY_BYTES,
    MAX_BATCH_ITEMS,
    MAX_CACHE_KEY_BYTES,
    MAX_CLOCK_SKEW_SECONDS,
    MAX_JSON_DEPTH,
    MAX_JSON_NODES,
    PROTOCOL_VERSION,
    ValidationError,
    RateLimiter,
    ReplayCache,
    authenticateRequest,
    assertNoEmbeddedCredentials,
    canonicalize,
    constantWorkEqual,
    generateToken,
    isUsableToken,
    sanitizeCandidate,
    sanitizeBatch,
    minimizeResult,
    redact,
    sha256Hex,
    validateRequestSize
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ZoteroCheck.Security;
