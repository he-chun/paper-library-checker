(() => {
  "use strict";

  const HANDLE_KEY = "__PLC_ZOTERO_CORE_CAPTURE_V4__";
  const EXPECTED_ZOTERO_VERSION = "9.0.6";
  const MAX_MESSAGES = 100000;

  function blocked(code, observations = {}) {
    return { status: "BLOCKED", code, observations };
  }

  function randomRunId() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return `PLC-CORE-${Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function debugLevel() {
    const value = Number(globalThis.Zotero?.Prefs?.get?.("debug.level"));
    return Number.isFinite(value) ? value : null;
  }

  function stringifyDebugArguments(args) {
    return args.map(value => {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    }).join(" ");
  }

  async function atomicWriteJson(outputPath, value) {
    if (typeof outputPath !== "string" || !outputPath.endsWith(".local.json")) {
      throw new Error("CAPTURE_OUTPUT_MUST_BE_LOCAL_JSON");
    }
    if (!globalThis.IOUtils?.writeUTF8 || !globalThis.IOUtils?.move) {
      throw new Error("IOUTILS_UNAVAILABLE");
    }
    const temporaryPath = `${outputPath}.tmp-${value.captureRunId}`;
    try {
      await globalThis.IOUtils.writeUTF8(temporaryPath, `${JSON.stringify(value)}\n`);
      await globalThis.IOUtils.move(temporaryPath, outputPath, { noOverwrite: false });
    } catch (error) {
      try { await globalThis.IOUtils.remove?.(temporaryPath, { ignoreAbsent: true }); } catch {}
      throw error;
    }
  }

  async function start(options = {}) {
    if (globalThis[HANDLE_KEY]) return blocked("CAPTURE_ALREADY_ACTIVE");
    if (globalThis.Zotero?.version !== EXPECTED_ZOTERO_VERSION) {
      return blocked("WRONG_ZOTERO_VERSION", {
        expected: EXPECTED_ZOTERO_VERSION,
        actual: String(globalThis.Zotero?.version || "unknown")
      });
    }
    if (typeof globalThis.Zotero?.Debug?.addListener !== "function" ||
        typeof globalThis.Zotero?.Debug?.removeListener !== "function") {
      return blocked("DEBUG_LISTENER_UNAVAILABLE");
    }
    const level = debugLevel();
    if (level === null || level < 5) return blocked("DEBUG_LEVEL_BELOW_5", { debugLevel: level });
    if (!/^[a-f0-9]{40}$/i.test(options.reviewedCommitSha || "") ||
        !/^[a-f0-9]{64}$/i.test(options.xpiSha256 || "") ||
        !/^[a-f0-9]{64}$/i.test(options.extensionZipSha256 || "")) {
      return blocked("ARTIFACT_BINDING_INVALID");
    }

    const captureRunId = randomRunId();
    const messages = [];
    const listener = (...args) => {
      if (messages.length >= MAX_MESSAGES) return;
      messages.push({ capturedAt: new Date().toISOString(), message: stringifyDebugArguments(args) });
    };
    const handle = {
      captureRunId,
      startedAt: new Date().toISOString(),
      listener,
      messages,
      outputPath: options.outputPath,
      reviewedCommitSha: options.reviewedCommitSha.toLowerCase(),
      xpiSha256: options.xpiSha256.toLowerCase(),
      extensionZipSha256: options.extensionZipSha256.toLowerCase()
    };
    globalThis.Zotero.Debug.addListener(listener);
    globalThis[HANDLE_KEY] = handle;
    return {
      status: "PASS",
      code: "CAPTURE_STARTED",
      captureRunId,
      zoteroVersion: EXPECTED_ZOTERO_VERSION,
      debugLevel: level
    };
  }

  async function stop() {
    const handle = globalThis[HANDLE_KEY];
    if (!handle) return blocked("CAPTURE_NOT_ACTIVE");
    globalThis.Zotero.Debug.removeListener(handle.listener);
    const completedAt = new Date().toISOString();
    const result = {
      schemaVersion: 1,
      captureRunId: handle.captureRunId,
      zoteroVersion: EXPECTED_ZOTERO_VERSION,
      startedAt: handle.startedAt,
      completedAt,
      reviewedCommitSha: handle.reviewedCommitSha,
      xpiSha256: handle.xpiSha256,
      extensionZipSha256: handle.extensionZipSha256,
      messageCount: handle.messages.length,
      truncated: handle.messages.length >= MAX_MESSAGES,
      messages: handle.messages
    };
    try {
      await atomicWriteJson(handle.outputPath, result);
    } catch {
      return blocked("CAPTURE_ATOMIC_WRITE_FAILED", { captureRunId: handle.captureRunId });
    } finally {
      handle.messages.length = 0;
      delete globalThis[HANDLE_KEY];
    }
    return {
      status: "PASS",
      code: "CAPTURE_STOPPED",
      captureRunId: result.captureRunId,
      messageCount: result.messageCount,
      completedAt
    };
  }

  globalThis.PLCZoteroCoreDebugCapture = Object.freeze({ start, stop });
})();
