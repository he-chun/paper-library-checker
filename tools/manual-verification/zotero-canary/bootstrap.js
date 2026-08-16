/* global ChromeUtils, IOUtils, Zotero */

var { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");

const CANARY_ID = "paper-library-checker-canary@he-chun.github.io";
const PRODUCT_ID = "paper-library-checker@he-chun.github.io";
const MARKER_FILE = "plc-activation-canary.local.json";

function install() {}

async function startup({ version }) {
  await Zotero.initializationPromise;
  Zotero.debug("PLC_ACTIVATION_CANARY STARTUP");
  await recordEvent("startup", String(version || ""));
}

async function shutdown() {
  Zotero.debug("PLC_ACTIVATION_CANARY SHUTDOWN");
  await recordEvent("shutdown", "");
}

function uninstall() {}

async function stateFor(id) {
  const addon = await AddonManager.getAddonByID(id);
  if (!addon) return { id, installed: false };
  return {
    id: addon.id,
    version: addon.version,
    type: addon.type,
    isActive: Boolean(addon.isActive),
    appDisabled: Boolean(addon.appDisabled),
    userDisabled: Boolean(addon.userDisabled),
    softDisabled: Boolean(addon.softDisabled),
    signedState: typeof addon.signedState === "number" ? addon.signedState : String(addon.signedState || ""),
    pendingOperations: Number(addon.pendingOperations || 0),
    blocklistState: Number(addon.blocklistState || 0),
    installDatePresent: Boolean(addon.installDate),
    updateDatePresent: Boolean(addon.updateDate),
    installed: true
  };
}

async function recordEvent(event, version) {
  const file = Zotero.getProfileDirectory();
  file.append(MARKER_FILE);
  const temporary = file.clone();
  temporary.leafName = `${MARKER_FILE}.tmp`;
  let previous = {};
  try { previous = await IOUtils.readJSON(file.path); } catch (error) {
    if (error.name !== "NotFoundError") Zotero.debug("PLC_ACTIVATION_CANARY RESULT_READ_FAILED");
  }
  const now = new Date().toISOString();
  const counts = {
    startup: Number(previous.observations?.eventCounts?.startup || 0),
    shutdown: Number(previous.observations?.eventCounts?.shutdown || 0)
  };
  counts[event] += 1;
  const result = {
    schemaVersion: 1,
    testRunId: previous.testRunId || `PLC-ACTIVATION-${crypto.randomUUID()}`,
    zoteroVersion: Zotero.version,
    phase: "canary",
    startedAt: previous.startedAt || now,
    completedAt: now,
    status: "PASS",
    observations: {
      lastEvent: event,
      eventCounts: counts,
      canaryVersion: version || previous.observations?.canaryVersion || "",
      canary: await stateFor(CANARY_ID),
      product: await stateFor(PRODUCT_ID)
    },
    containsPrivatePath: false
  };
  try {
    await IOUtils.writeJSON(file.path, result, { tmpPath: temporary.path, flush: true });
  } catch (error) {
    Zotero.debug("PLC_ACTIVATION_CANARY RESULT_ATOMIC_WRITE_FAILED");
    throw error;
  }
}
