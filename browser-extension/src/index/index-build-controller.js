(function (root, factory) {
  const api = factory();
  root.PLCIndexBuildController = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createIndexBuildController(dependencies = {}) {
    const builder = dependencies.builder;
    const progress = dependencies.progress;
    const repository = dependencies.repository;
    const freshness = dependencies.freshness;
    const onBuildComplete = dependencies.onBuildComplete;
    if (!builder?.build || !progress?.snapshot) throw new Error("index_build_controller_dependencies_required");
    let active = null;
    let sequence = 0;
    let hydrated = false;
    let initializing = null;

    function start(options = {}) {
      hydrated = true;
      const previous = active;
      if (previous) previous.controller.abort();
      const controller = new AbortController();
      const taskId = ++sequence;
      const entry = { controller, taskId, promise: null };
      entry.promise = (async () => {
        if (previous) await previous.promise;
        if (controller.signal.aborted) return progress.snapshot();
        try {
          const result = await builder.build({ signal: controller.signal, refreshing: options.refreshing === true });
          if (result?.ok && typeof onBuildComplete === "function") {
            try { await onBuildComplete(result); } catch (_error) {}
          }
        } catch (_error) {
          // The progress object contains the stable public failure state.
        }
        return progress.snapshot();
      })().finally(() => {
        if (active === entry) active = null;
      });
      active = entry;
      return { accepted: true, taskId, status: progress.snapshot() };
    }

    async function cancel() {
      const entry = active;
      if (!entry) return { cancelled: false, status: progress.snapshot() };
      entry.controller.abort();
      await entry.promise;
      return { cancelled: true, status: progress.snapshot() };
    }

    async function initialize(options = {}) {
      if (hydrated || active) return progress.snapshot();
      if (initializing) return initializing;
      initializing = (async () => {
        await repository?.open?.();
        let meta = await repository?.getLatestMeta?.();
        const evaluated = freshness?.evaluateIndexFreshness
          ? freshness.evaluateIndexFreshness(meta)
          : null;
        if (meta && evaluated?.state === "stale" && meta.state !== "stale") {
          meta = await repository.setState(meta.scopeKey, "stale");
        }
        progress.hydrate(meta, evaluated);
        hydrated = true;
        if (options.autoRefresh !== false && evaluated?.stale) {
          start({ refreshing: true, reason: "automatic_stale_refresh" });
        }
        return progress.snapshot();
      })().finally(() => { initializing = null; });
      return initializing;
    }

    async function getStatus() {
      if (!hydrated && !active && repository?.getLatestMeta && progress.hydrate) {
        await initialize({ autoRefresh: false });
      }
      return progress.snapshot();
    }

    async function refresh() {
      await initialize({ autoRefresh: false });
      const status = progress.snapshot();
      return start({ refreshing: status.activeGeneration != null, reason: "manual_refresh" });
    }

    async function clear() {
      await cancel();
      await repository.clearAll();
      hydrated = true;
      return { cleared: true, status: progress.clear() };
    }

    async function clearAndRebuild() {
      await clear();
      return start({ refreshing: false, reason: "clear_and_rebuild" });
    }

    async function waitForIdle() {
      const entry = active;
      if (entry) await entry.promise;
      return progress.snapshot();
    }

    return Object.freeze({ cancel, clear, clearAndRebuild, getStatus, initialize, refresh, start, waitForIdle });
  }

  return { createIndexBuildController };
});
