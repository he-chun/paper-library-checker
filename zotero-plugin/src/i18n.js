/* global Services, Zotero */

var ZoteroCheck = ZoteroCheck || {};

ZoteroCheck.I18n = (function () {
  const MESSAGES = Object.freeze({
    en: Object.freeze({
      loadedVersion: "Paper Library Checker ($1)",
      copyPairingToken: "Paper Library Checker: Copy pairing token",
      resetPairingToken: "Paper Library Checker: Reset pairing token",
      revokePairingToken: "Paper Library Checker: Revoke pairing token"
    }),
    "zh-CN": Object.freeze({
      loadedVersion: "文献库检查器（$1）",
      copyPairingToken: "文献库检查器：复制配对令牌",
      resetPairingToken: "文献库检查器：重置配对令牌",
      revokePairingToken: "文献库检查器：撤销配对令牌"
    })
  });

  function resolveLanguage(locale) {
    const normalized = String(locale || "").replace(/_/g, "-").toLowerCase();
    if (normalized === "zh" || /^zh-(?:cn|sg|hans|chs)(?:-|$)/.test(normalized)) return "zh-CN";
    return "en";
  }

  function getCurrentLocale() {
    if (typeof Zotero !== "undefined" && Zotero.locale) return Zotero.locale;
    if (typeof Services !== "undefined" && Services.locale?.appLocaleAsBCP47) {
      return Services.locale.appLocaleAsBCP47;
    }
    return "en";
  }

  function t(key, substitutions, locale = getCurrentLocale()) {
    const language = resolveLanguage(locale);
    const value = MESSAGES[language][key] || MESSAGES.en[key] || key;
    const values = Array.isArray(substitutions) ? substitutions : substitutions == null ? [] : [substitutions];
    return value.replace(/\$(\d+)/g, (_match, number) => String(values[Number(number) - 1] ?? ""));
  }

  return { MESSAGES, getCurrentLocale, resolveLanguage, t };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ZoteroCheck.I18n;
