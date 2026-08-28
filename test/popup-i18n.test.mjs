import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const i18n = require("../browser-extension/src/common/i18n.js");
const uiState = require("../browser-extension/src/common/ui-state.js");
const controller = require("../browser-extension/src/common/page-controller.js");
const senderSecurity = require("../browser-extension/src/common/sender-security.js");
const popup = require("../browser-extension/src/popup.js");
const zoteroI18n = require("../zotero-plugin/src/i18n.js");

async function popupDocument() {
  const html = await readFile(new URL("../browser-extension/src/popup.html", import.meta.url), "utf8");
  return new JSDOM(html).window.document;
}

test("popup renders connection, actual mode, and matching capabilities", async () => {
  const document = await popupDocument();
  popup.renderHealth(document, { connected: true, indexReady: true, mode: "enhanced" });
  assert.equal(document.querySelector("#zoteroState").textContent, "Connected");
  assert.equal(document.querySelector("#modeState").textContent, "Enhanced");
  assert.equal(document.querySelector("#indexState").textContent, "Full matching and real-time index");
  popup.renderHealth(document, { connected: false, indexReady: false });
  assert.equal(document.querySelector("#zoteroState").textContent, "Offline");
  assert.equal(document.querySelector("#modeState").textContent, "Unavailable");
  assert.equal(document.querySelector("#indexState").textContent, "Unavailable");
});

test("popup renders standard capability, automatic fallback, and a repair action", async () => {
  const document = await popupDocument();
  popup.renderHealth(document, {
    connected: true,
    indexReady: true,
    mode: "standard",
    capabilities: { engine: "direct", completeNegativeResults: false },
    degradedReason: "enhanced_backend_unavailable"
  });
  assert.equal(document.querySelector("#modeState").textContent, "Standard");
  assert.equal(document.querySelector("#indexState").textContent, "Direct fallback; unmatched results may be incomplete");
  assert.equal(document.querySelector("#indexState").dataset.state, "warning");
  assert.equal(document.querySelector("#fallbackState").textContent, "Enhanced mode unavailable");
  assert.equal(document.querySelector("#fallbackState").hidden, false);
  assert.equal(document.querySelector("#repairConnection").hidden, false);
});

test("popup renders supported, unchecked, and unsupported page states", async () => {
  const document = await popupDocument();
  popup.renderPageState(document, uiState.PAGE_STATES.SAVED);
  assert.equal(document.querySelector("#pageState").textContent, "Saved");
  popup.renderPageState(document, uiState.PAGE_STATES.NOT_CHECKED);
  assert.equal(document.querySelector("#pageState").textContent, "Not checked");
  popup.renderPageState(document, uiState.PAGE_STATES.UNSUPPORTED);
  assert.equal(document.querySelector("#pageState").textContent, "Unsupported page");
  assert.equal(document.querySelector("#checkPage").disabled, true);
});

test("popup page-state colors preserve saved, possible-match, not-saved, and error semantics", async () => {
  const document = await popupDocument();
  const pageState = document.querySelector("#pageState");
  for (const [state, expectedTone] of [
    [uiState.PAGE_STATES.SAVED, "good"],
    [uiState.PAGE_STATES.POSSIBLE_MATCH, "warning"],
    [uiState.PAGE_STATES.NOT_SAVED, "missing"],
    [uiState.PAGE_STATES.UNRECOGNIZED, "error"],
    [uiState.PAGE_STATES.ERROR, "error"]
  ]) {
    popup.renderPageState(document, state);
    assert.equal(pageState.dataset.state, expectedTone, state);
  }
  const popupCss = await readFile(new URL("../browser-extension/src/popup.css", import.meta.url), "utf8");
  const contentCss = await readFile(new URL("../browser-extension/src/content.css", import.meta.url), "utf8");
  assert.match(popupCss, /dd\[data-state="missing"\]\s*\{\s*color:\s*#164b86;\s*\}/i);
  assert.match(contentCss, /\.zotero-check-badge\[data-state="missing"\][^{]*\{\s*color:\s*#164b86;/i);
});

test("popup follows a checking page through to its final state", async () => {
  const document = await popupDocument();
  let reads = 0;
  const chromeObject = {
    runtime: {
      sendMessage: async () => ({ connected: true, indexReady: true, mode: "standard" })
    },
    tabs: {
      query: async () => [{ id: 42 }],
      sendMessage: async (_tabId, message) => {
        assert.equal(message.type, "zotero-check:get-page-state");
        reads += 1;
        return {
          ok: true,
          pageState: { state: reads === 1 ? uiState.PAGE_STATES.CHECKING : uiState.PAGE_STATES.NOT_SAVED }
        };
      }
    }
  };

  await popup.refresh(document, chromeObject);

  assert.equal(reads, 2);
  assert.equal(document.querySelector("#pageState").textContent, "Not saved");
  assert.equal(document.querySelector("#pageState").dataset.state, "missing");
  assert.equal(document.querySelector("#checkPage").disabled, false);
});

test("Check this page targets the active tab and Open options uses the standard API", async () => {
  const document = await popupDocument();
  const messages = [];
  let optionsOpened = false;
  let manualStarted = false;
  const chromeObject = {
    runtime: {
      sendMessage: async () => ({ connected: true, indexReady: true }),
      openOptionsPage: () => { optionsOpened = true; }
    },
    tabs: {
      query: async () => [{ id: 42 }],
      sendMessage: async (tabId, message) => {
        messages.push({ tabId, message });
        if (message.type === "zotero-check:get-page-state") {
          return { ok: true, pageState: { state: manualStarted ? "not_saved" : "not_checked" } };
        }
        manualStarted = true;
        return { ok: true, pageState: { state: "checking" } };
      }
    }
  };
  await popup.initialize(document, chromeObject);
  document.querySelector("#checkPage").click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  document.querySelector("#openOptions").click();
  assert(messages.some(({ tabId, message }) => tabId === 42 && message.type === "zotero-check:manual-page-check"));
  assert.equal(document.querySelector("#pageState").textContent, "Not saved");
  assert.equal(document.querySelector("#checkPage").disabled, false);
  assert.equal(optionsOpened, true);
});

test("popup source neither reads nor displays the pairing token", async () => {
  const source = await readFile(new URL("../browser-extension/src/popup.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../browser-extension/src/popup.html", import.meta.url), "utf8");
  assert.doesNotMatch(source, /storage|pairing.?token/i);
  assert.doesNotMatch(html, /pairing.?token/i);
});

test("extension pages and content scripts use separate trust predicates", () => {
  const runtime = { id: "id", getURL: (value) => `chrome-extension://id/${value}` };
  const extensionSender = { id: "id", url: "chrome-extension://id/src/popup.html" };
  const contentSender = { id: "id", tab: { url: "https://journal.example/article" } };
  assert.equal(senderSecurity.isTrustedExtensionPageSender(extensionSender, runtime), true);
  assert.equal(senderSecurity.isTrustedContentScriptSender(extensionSender, runtime.id), false);
  assert.equal(senderSecurity.isTrustedContentScriptSender(contentSender, runtime.id), true);
  assert.equal(senderSecurity.isTrustedExtensionPageSender(contentSender, runtime), false);
  assert.equal(senderSecurity.isTrustedExtensionPageSender({ id: "id", url: "https://evil.example/" }, runtime), false);
  assert.equal(senderSecurity.isTrustedExtensionPageSender({ id: "id", url: "chrome-extension://evil/src/popup.html" }, runtime), false);
  assert.equal(senderSecurity.isTrustedExtensionContextSender({ id: "id" }, runtime), true);
  assert.equal(senderSecurity.isTrustedExtensionContextSender(extensionSender, runtime), true);
  assert.equal(senderSecurity.isTrustedExtensionContextSender(contentSender, runtime), false);
  assert.equal(senderSecurity.isTrustedExtensionContextSender({ id: "evil" }, runtime), false);
});

test("floating control and popup manual checks share the page controller entry point", () => {
  let calls = 0;
  const page = controller.createPageController({ onManualCheck: () => { calls += 1; } });
  assert.equal(page.getState().state, uiState.PAGE_STATES.NOT_CHECKED);
  assert.equal(page.manualCheck().state, uiState.PAGE_STATES.CHECKING);
  assert.equal(page.manualCheck().state, uiState.PAGE_STATES.CHECKING);
  assert.equal(calls, 2);
});

test("English and Simplified Chinese browser locale keys are identical", async () => {
  const en = JSON.parse(await readFile(new URL("../browser-extension/_locales/en/messages.json", import.meta.url)));
  const zh = JSON.parse(await readFile(new URL("../browser-extension/_locales/zh_CN/messages.json", import.meta.url)));
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  assert.deepEqual(Object.keys(i18n.EN_MESSAGES).sort(), Object.keys(en).sort());
});

test("popup manifest adds no tabs, activeTab, all-URLs, or broader hosts", async () => {
  const manifest = JSON.parse(await readFile(new URL("../browser-extension/manifest.json", import.meta.url)));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions.some((value) => value.includes("<all_urls>") || value === "*://*/*"), false);
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.action.default_popup, "src/popup.html");
});

test("missing browser messages fall back to English", () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = { i18n: { getMessage: () => "" } };
  try {
    assert.equal(i18n.t("checkThisPage"), "Check this page");
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("options, popup, and page badge primary UI strings are locale-backed", async () => {
  const optionsHtml = await readFile(new URL("../browser-extension/src/options.html", import.meta.url), "utf8");
  const popupHtml = await readFile(new URL("../browser-extension/src/popup.html", import.meta.url), "utf8");
  const content = await readFile(new URL("../browser-extension/src/content.js", import.meta.url), "utf8");
  assert.match(optionsHtml, /data-i18n="testConnection"/);
  assert.match(popupHtml, /data-i18n="checkThisPage"/);
  assert.match(content, /i18n\.t\("badgeNotSaved"\)/);
  assert.doesNotMatch(content, /"Library: saved"/);
});

test("Zotero menu locale supports English, Simplified Chinese, and fallback", () => {
  assert.equal(zoteroI18n.resolveLanguage("zh-CN"), "zh-CN");
  assert.equal(zoteroI18n.resolveLanguage("zh-Hans-CN"), "zh-CN");
  assert.equal(zoteroI18n.resolveLanguage("zh_TW"), "en");
  assert.equal(zoteroI18n.resolveLanguage("fr-FR"), "en");
  assert.equal(zoteroI18n.t("copyPairingToken", null, "zh-CN"), "文献库检查器：复制配对令牌");
  assert.equal(zoteroI18n.t("resetPairingToken", null, "en"), "Paper Library Checker: Reset pairing token");
});

test("Zotero i18n attaches to the loadSubScript target scope", async () => {
  const source = await readFile(new URL("../zotero-plugin/src/i18n.js", import.meta.url), "utf8");
  const scope = { Object, String, Array, Services: { locale: { appLocaleAsBCP47: "zh-CN" } }, ZoteroCheck: {} };
  vm.runInNewContext(source, scope);
  assert.equal(typeof scope.ZoteroCheck.I18n.t, "function");
  assert.equal(scope.ZoteroCheck.I18n.t("loadedVersion", "0.4.0"), "文献库检查器（0.4.0）");
});
