(function (root, factory) {
  const api = factory();
  root.PLCSenderSecurity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function isTrustedContentScriptSender(sender, runtimeId) {
    if (!sender || sender.id !== runtimeId || !sender.tab || typeof sender.tab.url !== "string") return false;
    try {
      return ["http:", "https:"].includes(new URL(sender.tab.url).protocol);
    } catch (_error) {
      return false;
    }
  }

  function isTrustedExtensionPageSender(sender, runtime) {
    if (!sender || sender.id !== runtime?.id || typeof sender.url !== "string") return false;
    try {
      const senderUrl = new URL(sender.url);
      const extensionUrl = new URL(runtime.getURL(""));
      return senderUrl.protocol === extensionUrl.protocol &&
        senderUrl.host === extensionUrl.host &&
        ["chrome-extension:", "moz-extension:"].includes(senderUrl.protocol);
    } catch (_error) {
      return false;
    }
  }

  return { isTrustedContentScriptSender, isTrustedExtensionPageSender };
});
