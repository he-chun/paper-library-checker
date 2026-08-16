var DEFAULT_OPTIONS = {
  endpoint: "http://127.0.0.1:23119/zotero-checker",
  translationServerMode: "auto",
  enablePageGlow: false,
  autoCheckReferenceLists: false,
  broadPageDetection: false
};

function validateEndpoint(value) {
  var url = new URL(value);
  if (url.protocol !== "http:" || url.username || url.password || url.search || url.hash ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname.replace(/\/$/, "") !== "/zotero-checker") {
    throw new Error("Endpoint must use 127.0.0.1 or localhost and the Paper Library Checker path");
  }
  return url.href.replace(/\/$/, "");
}

function readPairingToken() {
  var token = document.querySelector("#token").value.trim();
  if (!PLCRequestAuth.isUsableSecret(token)) {
    throw new Error("Pairing token must be the 64-character value copied from Zotero");
  }
  return token;
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
  var mode = options.translationServerMode || "auto";
  var radio = document.querySelector(`input[name="translationServerMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  document.querySelector("#enablePageGlow").checked = !!options.enablePageGlow;
  document.querySelector("#autoCheckReferenceLists").checked = !!options.autoCheckReferenceLists;
  document.querySelector("#broadPageDetection").checked = !!options.broadPageDetection;
}

async function save() {
  try {
    var endpoint = validateEndpoint(document.querySelector("#endpoint").value.trim());
    var token = readPairingToken();
    var modeRadio = document.querySelector("input[name=\"translationServerMode\"]:checked");
    await chrome.storage.sync.set({
      endpoint,
      translationServerMode: modeRadio ? modeRadio.value : "auto",
      enablePageGlow: document.querySelector("#enablePageGlow").checked,
      autoCheckReferenceLists: document.querySelector("#autoCheckReferenceLists").checked,
      broadPageDetection: document.querySelector("#broadPageDetection").checked
    });
    await chrome.storage.local.set({ token });
    await chrome.storage.sync.remove("token");
    setStatus("Saved", false);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function connectionMessage(status, payload) {
  if (status === 401 && payload.error === "protocol_incompatible") return "Protocol incompatible: update the extension and Zotero add-on together";
  if (status === 401) return "Pairing failed: the token or signed request was rejected";
  if (status === 429) return "Too many requests: wait and test again";
  if (status === 503) return payload.error === "pairing_not_configured"
    ? "Zotero add-on is not paired: copy a new token from Zotero"
    : "Zotero add-on is temporarily unavailable";
  return `Connection failed (HTTP ${status})`;
}

async function testConnection() {
  try {
    var endpoint = validateEndpoint(document.querySelector("#endpoint").value.trim());
    var token = readPairingToken();
    var path = "/zotero-checker/health";
    var headers = await PLCRequestAuth.createHeaders({ secret: token, method: "GET", path, body: "" });
    var response = await fetch(`${endpoint}/health`, { method: "GET", headers });
    var payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(connectionMessage(response.status, payload));
    if (payload.indexReady !== true) throw new Error("Connected, but the Zotero index is not ready");
    if (typeof payload.version !== "string" || !payload.version.startsWith("0.3.")) throw new Error("Protocol incompatible: unexpected add-on version");
    setStatus(`Connected to Paper Library Checker ${payload.version}`, false);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function toggleToken() {
  var input = document.querySelector("#token");
  var button = document.querySelector("#toggleToken");
  var show = input.type === "password";
  input.type = show ? "text" : "password";
  button.textContent = show ? "Hide" : "Show";
  button.setAttribute("aria-pressed", String(show));
}

if (typeof document !== "undefined") {
  document.querySelector("#save").addEventListener("click", save);
  document.querySelector("#testConnection").addEventListener("click", testConnection);
  document.querySelector("#toggleToken").addEventListener("click", toggleToken);
  load().catch((error) => setStatus(error.message, true));
}

if (typeof module !== "undefined" && module.exports) module.exports = { connectionMessage, validateEndpoint };
