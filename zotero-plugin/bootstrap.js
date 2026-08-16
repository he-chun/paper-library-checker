/* global Services, Zotero */

var ZoteroCheckPlugin;
var ZoteroCheckScope;
var ZoteroCheckMenuItemID = "zotero-check-startup-marker";
var PaperLibraryCheckerCopyTokenID = "paper-library-checker-copy-token";
var PaperLibraryCheckerRotateTokenID = "paper-library-checker-rotate-token";
var PaperLibraryCheckerRevokeTokenID = "paper-library-checker-revoke-token";

function install() {}

async function startup({ id, version, rootURI }, reason) {
  await Zotero.initializationPromise;
  if (!rootURI && arguments[0].resourceURI) {
    rootURI = arguments[0].resourceURI.spec;
  }

  writeStartupLog(`startup entered version=${version} reason=${reason}`);
  Zotero.debug("[Paper Library Checker] startup");

  ZoteroCheckScope = {
    rootURI,
    _globalThis: null,
    Zotero,
    Services,
    Components,
    Array,
    atob,
    btoa,
    crypto,
    Date,
    JSON,
    Map,
    Object,
    Promise,
    RegExp,
    Set,
    String,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URLSearchParams,
    ZoteroCheck: {}
  };
  ZoteroCheckScope._globalThis = ZoteroCheckScope;

  loadSubScriptWithLog(rootURI, "src/security.js");
  loadSubScriptWithLog(rootURI, "src/utils.js");
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "utils loaded", { rootURI });
  loadSubScriptWithLog(rootURI, "src/matcher.js");
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "matcher loaded");
  loadSubScriptWithLog(rootURI, "src/indexer.js");
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "indexer loaded");
  loadSubScriptWithLog(rootURI, "src/server.js");
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "server loaded");
  writeStartupLog("subscripts loaded");

  let token = Zotero.Prefs.get("extensions.zoteroCheck.token", true) || "";
  if (!ZoteroCheckScope.ZoteroCheck.Security.isUsableToken(token)) {
    token = ZoteroCheckScope.ZoteroCheck.Security.generateToken();
    Zotero.Prefs.set("extensions.zoteroCheck.token", token, true);
  }

  ZoteroCheckPlugin = new ZoteroCheckScope.ZoteroCheck.Server({
    port: Zotero.Prefs.get("extensions.zoteroCheck.port", true) || 23119,
    token,
    fuzzyMatching:
      Zotero.Prefs.get("extensions.zoteroCheck.fuzzyMatching", true) !== false,
    batchLimit: Zotero.Prefs.get("extensions.zoteroCheck.batchLimit", true) || 200
  });

  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "server starting", {
    port: ZoteroCheckPlugin.port,
    fuzzyMatching: ZoteroCheckPlugin.indexer.fuzzyMatching
  });
  await ZoteroCheckPlugin.start();
  writeStartupLog(`server start returned ready=${ZoteroCheckPlugin.ready} indexError=${ZoteroCheckPlugin.indexError}`);
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "server start returned", {
    ready: ZoteroCheckPlugin.ready,
    indexError: ZoteroCheckPlugin.indexError
  });
  Zotero.ZoteroCheck = {
    version,
    server: ZoteroCheckPlugin,
    scope: ZoteroCheckScope
  };
  addStartupMarkerToAllWindows(version);
  Zotero.debug("[Paper Library Checker] startup complete");
}

async function shutdown() {
  Zotero.debug("[Paper Library Checker] shutdown");
  if (ZoteroCheckScope && ZoteroCheckScope.ZoteroCheck && ZoteroCheckScope.ZoteroCheck.Utils) {
    ZoteroCheckScope.ZoteroCheck.Utils.log("info", "shutdown entered");
  }
  removeStartupMarkerFromAllWindows();
  if (ZoteroCheckPlugin) {
    await ZoteroCheckPlugin.stop();
    ZoteroCheckPlugin = null;
  }
  if (typeof Zotero !== "undefined" && Zotero.ZoteroCheck) {
    delete Zotero.ZoteroCheck;
  }
  ZoteroCheckScope = null;
}

function uninstall() {}

function writeStartupLog(message) {
  try {
    const file = Zotero.getProfileDirectory();
    file.append("zotero-check.log");
    const stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Components.interfaces.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);
    const converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
      .createInstance(Components.interfaces.nsIConverterOutputStream);
    converter.init(stream, "UTF-8");
    converter.writeString(`[${new Date().toISOString()}] [BOOTSTRAP] ${message}\n`);
    converter.close();
  } catch (error) {
    Zotero.debug(`[Paper Library Checker] failed to write startup log: ${error}`);
  }
}

function loadSubScriptWithLog(rootURI, scriptPath) {
  try {
    writeStartupLog(`loading ${scriptPath}`);
    Services.scriptloader.loadSubScript(rootURI + scriptPath, ZoteroCheckScope);
    writeStartupLog(`loaded ${scriptPath}`);
  } catch (error) {
    writeStartupLog(`failed loading ${scriptPath}: ${error}`);
    Zotero.logError(error);
    throw error;
  }
}

function onMainWindowLoad({ window }) {
  addStartupMarker(window, ZoteroCheckPlugin ? "ready" : "loaded");
}

function onMainWindowUnload({ window }) {
  removeStartupMarker(window);
}

function addStartupMarkerToAllWindows(version) {
  for (const win of Zotero.getMainWindows()) {
    addStartupMarker(win, version);
  }
}

function removeStartupMarkerFromAllWindows() {
  for (const win of Zotero.getMainWindows()) {
    removeStartupMarker(win);
  }
}

function addStartupMarker(win, version) {
  const doc = win.document;
  if (doc.getElementById(ZoteroCheckMenuItemID)) {
    return;
  }

  const menu = doc.getElementById("menu_ToolsPopup") || doc.getElementById("menu_ToolsPopupPopup");
  if (!menu) {
    return;
  }

  const item = doc.createXULElement("menuitem");
  item.id = ZoteroCheckMenuItemID;
  item.setAttribute("label", `Paper Library Checker (${version})`);
  item.setAttribute("disabled", "true");
  menu.appendChild(item);

  const copyToken = doc.createXULElement("menuitem");
  copyToken.id = PaperLibraryCheckerCopyTokenID;
  copyToken.setAttribute("label", "Paper Library Checker: Copy pairing token");
  copyToken.addEventListener("command", copyPairingToken);
  menu.appendChild(copyToken);

  const rotateToken = doc.createXULElement("menuitem");
  rotateToken.id = PaperLibraryCheckerRotateTokenID;
  rotateToken.setAttribute("label", "Paper Library Checker: Reset pairing token");
  rotateToken.addEventListener("command", rotatePairingToken);
  menu.appendChild(rotateToken);

  const revokeToken = doc.createXULElement("menuitem");
  revokeToken.id = PaperLibraryCheckerRevokeTokenID;
  revokeToken.setAttribute("label", "Paper Library Checker: Revoke pairing token");
  revokeToken.addEventListener("command", revokePairingToken);
  menu.appendChild(revokeToken);
}

function removeStartupMarker(win) {
  win.document.getElementById(ZoteroCheckMenuItemID)?.remove();
  win.document.getElementById(PaperLibraryCheckerCopyTokenID)?.remove();
  win.document.getElementById(PaperLibraryCheckerRotateTokenID)?.remove();
  win.document.getElementById(PaperLibraryCheckerRevokeTokenID)?.remove();
}

function copyPairingToken() {
  const token = Zotero.Prefs.get("extensions.zoteroCheck.token", true) || "";
  if (!ZoteroCheckScope.ZoteroCheck.Security.isUsableToken(token)) return;
  const clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Components.interfaces.nsIClipboardHelper);
  clipboard.copyString(token);
}

function rotatePairingToken() {
  const token = ZoteroCheckScope.ZoteroCheck.Security.generateToken();
  Zotero.Prefs.set("extensions.zoteroCheck.token", token, true);
  ZoteroCheckPlugin.setToken(token);
  copyPairingToken();
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "pairing token rotated");
}

function revokePairingToken() {
  Zotero.Prefs.set("extensions.zoteroCheck.token", "", true);
  ZoteroCheckPlugin.setToken("");
  ZoteroCheckScope.ZoteroCheck.Utils.log("info", "pairing token revoked");
}
