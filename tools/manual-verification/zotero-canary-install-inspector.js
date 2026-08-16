/* global ChromeUtils, IOUtils, Zotero */

// Run once in Zotero's Run JavaScript window before the maintainer manually
// chooses an XPI. The listener records only allowlisted Add-on Manager state.
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const expectedID = "paper-library-checker-canary@he-chun.github.io";
const output = Zotero.getProfileDirectory();
output.append("canary-install-error.local.json");
const temporary = output.clone();
temporary.leafName = `${output.leafName}.tmp`;

const unavailable = (value) => value === undefined || value === null ? "UNAVAILABLE" : value;
const safeAddon = (addon) => addon ? {
  id: unavailable(addon.id),
  version: unavailable(addon.version),
  type: unavailable(addon.type),
  appDisabled: unavailable(addon.appDisabled),
  isCompatible: unavailable(addon.isCompatible),
  signedState: unavailable(addon.signedState)
} : "UNAVAILABLE";

async function record(event, install) {
  const result = {
    schemaVersion: 1,
    appVersion: Zotero.version,
    expectedAddonID: expectedID,
    event,
    installUIResult: event === "onInstallEnded" ? "INSTALL_ACCEPTED" : "INSTALL_REJECTED",
    installState: unavailable(install?.state),
    installError: unavailable(install?.error),
    addonPresent: Boolean(install?.addon),
    addon: safeAddon(install?.addon),
    containsPrivatePath: false
  };
  await IOUtils.writeJSON(output.path, result, { tmpPath: temporary.path, flush: true });
  Zotero.debug(`PLC_CANARY_INSTALL_INSPECTION_${event}`);
}

const listener = {
  onNewInstall: (install) => record("onNewInstall", install),
  onDownloadFailed: (install) => record("onDownloadFailed", install),
  onInstallFailed: (install) => record("onInstallFailed", install),
  onInstallEnded: (install) => record("onInstallEnded", install),
  onDownloadCancelled: (install) => record("onDownloadCancelled", install),
  onInstallCancelled: (install) => record("onInstallCancelled", install)
};

AddonManager.addInstallListener(listener);
Zotero.debug("PLC_CANARY_INSTALL_INSPECTION_READY");
return "PLC_CANARY_INSTALL_INSPECTION_READY";
