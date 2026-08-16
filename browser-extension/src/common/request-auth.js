(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PLCRequestAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PROTOCOL_VERSION = "1";
  const CONTENT_TYPE = "application/vnd.paper-library-checker+json";
  const EMPTY_BODY = "";

  function isUsableSecret(secret) {
    return typeof secret === "string" && /^[a-f0-9]{64}$/i.test(secret);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hexToBytes(value) {
    if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) throw new Error("invalid_hex");
    return Uint8Array.from(value.match(/../g), (byte) => parseInt(byte, 16));
  }

  function base64Url(bytes) {
    let encoded;
    if (typeof Buffer !== "undefined") encoded = Buffer.from(bytes).toString("base64");
    else encoded = btoa(String.fromCharCode(...bytes));
    return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }

  function canonicalize({ method, path, timestamp, nonce, bodyHash }) {
    return [PROTOCOL_VERSION, String(method).toUpperCase(), path, String(timestamp), nonce, bodyHash].join("\n");
  }

  function randomNonce(cryptoProvider = globalThis.crypto) {
    if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== "function") throw new Error("secure_random_unavailable");
    const bytes = new Uint8Array(16);
    cryptoProvider.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  async function sha256Hex(bytes, cryptoProvider = globalThis.crypto) {
    if (!cryptoProvider || !cryptoProvider.subtle) throw new Error("webcrypto_unavailable");
    return bytesToHex(new Uint8Array(await cryptoProvider.subtle.digest("SHA-256", bytes)));
  }

  async function hmacBase64Url(secret, message, cryptoProvider = globalThis.crypto) {
    if (!isUsableSecret(secret)) throw new Error("invalid_pairing_token");
    if (!cryptoProvider || !cryptoProvider.subtle) throw new Error("webcrypto_unavailable");
    const key = await cryptoProvider.subtle.importKey(
      "raw",
      hexToBytes(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await cryptoProvider.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    return base64Url(new Uint8Array(signature));
  }

  async function createHeaders({ secret, method, path, body = EMPTY_BODY, timestamp, nonce, cryptoProvider = globalThis.crypto }) {
    if (!isUsableSecret(secret)) throw new Error("invalid_pairing_token");
    const seconds = timestamp == null ? Math.floor(Date.now() / 1000) : Number(timestamp);
    const requestNonce = nonce || randomNonce(cryptoProvider);
    const bodyBytes = new TextEncoder().encode(body);
    const bodyHash = await sha256Hex(bodyBytes, cryptoProvider);
    const canonical = canonicalize({ method, path, timestamp: seconds, nonce: requestNonce, bodyHash });
    const signature = await hmacBase64Url(secret, canonical, cryptoProvider);
    return {
      "Content-Type": CONTENT_TYPE,
      "X-Zotero-Connector-API-Version": "3",
      "X-PLC-Protocol": PROTOCOL_VERSION,
      "X-PLC-Timestamp": String(seconds),
      "X-PLC-Nonce": requestNonce,
      "X-PLC-Body-SHA256": bodyHash,
      "X-PLC-Signature": signature
    };
  }

  return {
    PROTOCOL_VERSION,
    CONTENT_TYPE,
    canonicalize,
    createHeaders,
    hmacBase64Url,
    isUsableSecret,
    randomNonce,
    sha256Hex
  };
});
