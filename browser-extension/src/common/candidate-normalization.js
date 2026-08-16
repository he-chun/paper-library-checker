(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PLCCandidateNormalization = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_CREATORS = 20;
  const SUPPORTED_CREATOR_FIELDS = ["name", "firstName", "lastName"];

  function cleanCreatorField(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeCreator(creator) {
    if (typeof creator === "string") {
      const value = creator.trim();
      return value || null;
    }
    if (!creator || typeof creator !== "object" || Array.isArray(creator)) {
      return null;
    }

    const normalized = {};
    for (const field of SUPPORTED_CREATOR_FIELDS) {
      const value = cleanCreatorField(creator[field]);
      if (value) normalized[field] = value;
    }
    return Object.keys(normalized).length ? normalized : null;
  }

  function comparisonText(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[.,;，；、|]+/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
  }

  function creatorKey(creator) {
    if (typeof creator === "string") return comparisonText(creator);
    const name = comparisonText(creator.name);
    if (name) return name;
    return comparisonText([creator.firstName, creator.lastName].filter(Boolean).join(" "));
  }

  function normalizeCreatorsForLocalAPI(creators, maximum = MAX_CREATORS) {
    if (!Array.isArray(creators)) return [];
    const limit = Math.max(0, Math.min(MAX_CREATORS, Number.isFinite(maximum) ? Math.floor(maximum) : MAX_CREATORS));
    if (limit === 0) return [];
    const seen = new Set();
    const result = [];

    for (const input of creators) {
      const creator = normalizeCreator(input);
      if (!creator) continue;
      const key = creatorKey(creator);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(creator);
      if (result.length === limit) break;
    }
    return result;
  }

  function normalizeCandidateForLocalAPI(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    return {
      ...candidate,
      creators: normalizeCreatorsForLocalAPI(candidate.creators)
    };
  }

  return {
    MAX_CREATORS,
    normalizeCandidateForLocalAPI,
    normalizeCreatorsForLocalAPI
  };
});
