(function (root, factory) {
  const api = factory(
    root.PLCLocalApiMatcher ||
      (typeof require === "function" ? require("../backends/local-api-matcher.js") : null)
  );
  root.PLCIndexRecordNormalizer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (matcher) {
  "use strict";

  const MAX_KEY_LENGTH = 256;
  const MAX_TITLE_KEY_LENGTH = 4096;
  const MAX_CREATOR_KEYS = 20;
  const MAX_CREATOR_KEY_LENGTH = 512;
  const MAX_IDENTIFIER_KEY_LENGTH = 1024;

  function makeNormalizationError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function boundedText(value, maximum, required = false) {
    const text = String(value == null ? "" : value).trim();
    if ((required && !text) || text.length > maximum) throw makeNormalizationError("invalid_index_record");
    return text;
  }

  function dataOf(record) {
    return record && typeof record.data === "object" && record.data ? record.data : record || {};
  }

  function normalizeVersion(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
  }

  function normalizeIdentifierKeys(record, prepared) {
    const result = [];
    const seen = new Set();
    if (Array.isArray(record?.identifierKeys)) {
      for (const entry of record.identifierKeys) {
        const [rawType, ...rest] = String(entry).split(":");
        const type = rawType.toLowerCase();
        if (!matcher.IDENTIFIER_PRIORITY.includes(type) || !rest.length) continue;
        const value = matcher.normalizeIdentifier(rest.join(":"), type);
        const key = value ? `${type}:${value}` : "";
        if (key && key.length <= MAX_IDENTIFIER_KEY_LENGTH && !seen.has(key)) {
          seen.add(key);
          result.push(key);
        }
      }
    } else {
      for (const type of matcher.IDENTIFIER_PRIORITY) {
        const value = prepared.identifiers[type];
        const key = value ? `${type}:${value}` : "";
        if (key && key.length <= MAX_IDENTIFIER_KEY_LENGTH && !seen.has(key)) {
          seen.add(key);
          result.push(key);
        }
      }
    }
    return result;
  }

  function normalizeCreatorKeys(record, prepared) {
    const source = Array.isArray(record?.creatorKeys)
      ? record.creatorKeys.map(matcher.normalizePerson)
      : prepared.creators;
    return [...new Set(source.filter((value) => value && value.length <= MAX_CREATOR_KEY_LENGTH))]
      .slice(0, MAX_CREATOR_KEYS);
  }

  function normalizeIndexRecord(scopeKey, generation, record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw makeNormalizationError("invalid_index_record");
    }
    const data = dataOf(record);
    const prepared = matcher.prepareItem(record);
    if (!prepared) throw makeNormalizationError("non_bibliographic_index_record");
    const normalizedScope = boundedText(scopeKey, MAX_KEY_LENGTH, true);
    const normalizedGeneration = Number(generation);
    if (!Number.isSafeInteger(normalizedGeneration) || normalizedGeneration < 1) {
      throw makeNormalizationError("invalid_index_generation");
    }
    const libraryKey = boundedText(record.libraryKey, MAX_KEY_LENGTH, true);
    const itemKey = boundedText(record.itemKey || record.key || data.key, MAX_KEY_LENGTH, true);
    const itemType = boundedText(data.itemType, 64, true).toLowerCase();
    const titleKey = boundedText(record.titleKey || prepared.title, MAX_TITLE_KEY_LENGTH);
    const year = matcher.extractYear(record.year || prepared.year);
    return {
      scopeKey: normalizedScope,
      generation: normalizedGeneration,
      libraryKey,
      itemKey,
      itemVersion: normalizeVersion(record.itemVersion ?? record.version ?? data.version),
      identifierKeys: normalizeIdentifierKeys(record, prepared),
      titleKey,
      year,
      creatorKeys: normalizeCreatorKeys(record, prepared),
      itemType
    };
  }

  function normalizeLibraryMetadata(scopeKey, generation, metadata) {
    const normalizedGeneration = Number(generation);
    if (!Number.isSafeInteger(normalizedGeneration) || normalizedGeneration < 1) {
      throw makeNormalizationError("invalid_index_generation");
    }
    const itemCount = Number(metadata?.itemCount);
    const indexedAt = Number(metadata?.indexedAt);
    return {
      scopeKey: boundedText(scopeKey, MAX_KEY_LENGTH, true),
      generation: normalizedGeneration,
      libraryKey: boundedText(metadata?.libraryKey, MAX_KEY_LENGTH, true),
      itemCount: Number.isSafeInteger(itemCount) && itemCount >= 0 ? itemCount : 0,
      sourceVersion: normalizeVersion(metadata?.sourceVersion),
      indexedAt: Number.isFinite(indexedAt) && indexedAt >= 0 ? Math.floor(indexedAt) : null
    };
  }

  return {
    MAX_CREATOR_KEYS,
    normalizeIndexRecord,
    normalizeLibraryMetadata
  };
});
