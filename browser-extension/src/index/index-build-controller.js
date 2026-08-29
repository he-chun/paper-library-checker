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
    if (!builder?.build || !progress?.snapshot) throw new Error("index_build_controller_dependencies_required");
    let active = null;
    let sequence = 0;
    let hydrated = false;

    function start() {
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
          await builder.build({ signal: controller.signal });
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

    async function getStatus() {
      if (!hydrated && !active && repository?.getLatestMeta && progress.hydrate) {
        progress.hydrate(await repository.getLatestMeta());
        hydrated = true;
      }
      return progress.snapshot();
    }

    async function waitForIdle() {
      const entry = active;
      if (entry) await entry.promise;
      return progress.snapshot();
    }

    return Object.freeze({ cancel, getStatus, start, waitForIdle });
  }

  return { createIndexBuildController };
});
