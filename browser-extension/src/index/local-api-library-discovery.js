(function (root, factory) {
  const api = factory();
  root.PLCLocalApiLibraryDiscovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LEGACY_SCOPE_KEY = "legacy:local-api:v3";

  function deriveScope(probe = {}) {
    const identifier = String(probe.instanceIdentifier || "").trim();
    if (/^[A-Za-z0-9._:-]{8,200}$/.test(identifier)) {
      return { scopeKey: `instance:${identifier.toLowerCase()}`, scopeConfidence: "stable" };
    }
    return { scopeKey: LEGACY_SCOPE_KEY, scopeConfidence: "legacy" };
  }

  function normalizeGroupIDs(groupIDs) {
    const seen = new Set();
    const result = [];
    for (const value of Array.isArray(groupIDs) ? groupIDs : []) {
      const id = String(value == null ? "" : value);
      if (!/^\d+$/.test(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  function createLocalApiLibraryDiscovery(source) {
    if (!source?.probe || !source?.discoverGroupIDs) throw new Error("local_api_index_source_required");
    return Object.freeze({
      async discover(options = {}) {
        const probe = await source.probe({ signal: options.signal });
        const groupIDs = normalizeGroupIDs(await source.discoverGroupIDs({ signal: options.signal }));
        const scope = deriveScope(probe);
        return {
          ...scope,
          apiVersion: probe.apiVersion,
          schemaVersion: probe.schemaVersion || "",
          libraries: [
            { libraryKey: "users/0", libraryPath: "users/0", type: "personal" },
            ...groupIDs.map((id) => ({
              libraryKey: `groups/${id}`,
              libraryPath: `groups/${id}`,
              type: "group"
            }))
          ]
        };
      }
    });
  }

  return { LEGACY_SCOPE_KEY, createLocalApiLibraryDiscovery, deriveScope, normalizeGroupIDs };
});
