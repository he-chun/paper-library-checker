(function (root, factory) {
  const api = factory();
  root.PLCLocalApiMatcher = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const IDENTIFIER_PRIORITY = ["doi", "pmid", "isbn", "cnki"];
  const NON_BIBLIOGRAPHIC_TYPES = new Set(["attachment", "note", "annotation"]);

  function normalizeDOI(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim()
      .toLowerCase();
  }

  function normalizeIdentifier(value, type = "") {
    if (String(type).toLowerCase() === "doi") return normalizeDOI(value);
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/-/g, "");
  }

  function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/&nbsp;/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[“”„‟]/g, "\"")
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[。．.]/g, ".")
      .replace(/[，,]/g, ",")
      .replace(/[：:]/g, ":")
      .replace(/[；;]/g, ";")
      .replace(/[！!]/g, "!")
      .replace(/[？?]/g, "?")
      .replace(/[\s\u00A0]+/g, "")
      .replace(/[\p{P}\p{S}]/gu, "");
  }

  function normalizePerson(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCreators(creators) {
    return Array.isArray(creators)
      ? creators.map((creator) => {
          if (typeof creator === "string") return normalizePerson(creator);
          if (!creator || typeof creator !== "object") return "";
          return normalizePerson(`${creator.lastName || ""}${creator.firstName || ""}${creator.name || ""}`);
        }).filter(Boolean)
      : [];
  }

  function extractYear(value) {
    const match = String(value || "").match(/(?:18|19|20)\d{2}/);
    return match ? match[0] : "";
  }

  function extractCNKIFromURL(value) {
    try {
      const url = new URL(String(value || ""));
      if (!(url.hostname === "cnki.net" || url.hostname.endsWith(".cnki.net"))) return "";
      for (const [key, item] of url.searchParams) {
        if (key.toLowerCase() === "filename") return normalizeIdentifier(item, "cnki");
      }
      return "";
    } catch (_error) {
      return "";
    }
  }

  function identifiersFromExtra(extra) {
    const text = String(extra || "");
    const patterns = {
      doi: /(?:^|\n)\s*doi:\s*([^\s]+)/i,
      pmid: /(?:^|\n)\s*pmid:\s*(\d+)/i,
      isbn: /(?:^|\n)\s*isbn:\s*([0-9Xx -]+)/i,
      cnki: /(?:^|\n)\s*cnki(?:\s*(?:file\s*)?id)?\s*:\s*(\S+)/i
    };
    return Object.fromEntries(Object.entries(patterns).map(([type, pattern]) => {
      const match = text.match(pattern);
      return [type, match ? normalizeIdentifier(match[1], type) : ""];
    }).filter(([, value]) => value));
  }

  function collectIdentifiers(value = {}) {
    const identifiers = {
      doi: normalizeIdentifier(value.DOI || value.doi, "doi"),
      pmid: normalizeIdentifier(value.PMID || value.pmid, "pmid"),
      isbn: normalizeIdentifier(value.ISBN || value.isbn, "isbn"),
      cnki: normalizeIdentifier(value.cnkiFileID || value.cnki, "cnki") || extractCNKIFromURL(value.url)
    };
    if (Array.isArray(value.identifiers)) {
      for (const entry of value.identifiers) {
        const [rawType, ...rest] = String(entry).split(":");
        const type = rawType.toLowerCase();
        if (IDENTIFIER_PRIORITY.includes(type) && rest.length) {
          identifiers[type] = normalizeIdentifier(rest.join(":"), type);
        }
      }
    }
    return Object.fromEntries(Object.entries(identifiers).filter(([, identifier]) => identifier));
  }

  function prepareCandidate(candidate = {}) {
    return {
      identifiers: collectIdentifiers(candidate),
      title: normalizeTitle(candidate.title),
      year: extractYear(candidate.date || candidate.year),
      creators: normalizeCreators(candidate.creators)
    };
  }

  function prepareItem(item = {}) {
    const data = item && typeof item.data === "object" && item.data ? item.data : item;
    const itemType = typeof data?.itemType === "string" ? data.itemType.toLowerCase() : "";
    if (!itemType || NON_BIBLIOGRAPHIC_TYPES.has(itemType)) return null;
    const extraIdentifiers = identifiersFromExtra(data.extra);
    const identifiers = {
      ...extraIdentifiers,
      ...collectIdentifiers(data)
    };
    if (!identifiers.cnki) identifiers.cnki = extractCNKIFromURL(data.url);
    return {
      identifiers,
      title: normalizeTitle(data.title),
      year: extractYear(data.date || data.year),
      creators: normalizeCreators(data.creators)
    };
  }

  function hintsMatch(item, candidate) {
    if (candidate.year && item.year && candidate.year !== item.year) return false;
    if (candidate.creators.length && item.creators.length) {
      return candidate.creators.some((creator) => item.creators.includes(creator));
    }
    return true;
  }

  function matchCandidate(candidate, items) {
    const normalizedCandidate = prepareCandidate(candidate);
    const preparedItems = (Array.isArray(items) ? items : []).map(prepareItem).filter(Boolean);
    for (const type of IDENTIFIER_PRIORITY) {
      const identifier = normalizedCandidate.identifiers[type];
      if (identifier && preparedItems.some((item) => item.identifiers[type] === identifier)) {
        return { status: "matched", matchType: type, confidence: 1 };
      }
    }
    if (normalizedCandidate.title) {
      const sameTitle = preparedItems.filter((item) => item.title === normalizedCandidate.title);
      if (sameTitle.some((item) => hintsMatch(item, normalizedCandidate))) {
        return { status: "matched", matchType: "title", confidence: 0.95 };
      }
    }
    return { status: "not_found", matchType: null, confidence: 0 };
  }

  function searchTerms(candidate) {
    const normalized = prepareCandidate(candidate);
    return [...new Set([
      ...IDENTIFIER_PRIORITY.map((type) => normalized.identifiers[type]),
      String(candidate?.title || "").trim()
    ].filter(Boolean))];
  }

  function candidateKey(candidate) {
    const normalized = prepareCandidate(candidate);
    return JSON.stringify({
      identifiers: IDENTIFIER_PRIORITY.map((type) => normalized.identifiers[type] || ""),
      title: normalized.title,
      year: normalized.year,
      creators: [...new Set(normalized.creators)].sort()
    });
  }

  function itemFingerprint(item) {
    const prepared = prepareItem(item);
    if (!prepared) return "";
    return JSON.stringify({
      identifiers: IDENTIFIER_PRIORITY.map((type) => prepared.identifiers[type] || ""),
      title: prepared.title,
      year: prepared.year,
      creators: [...new Set(prepared.creators)].sort()
    });
  }

  return {
    IDENTIFIER_PRIORITY,
    NON_BIBLIOGRAPHIC_TYPES,
    collectIdentifiers,
    candidateKey,
    extractCNKIFromURL,
    extractYear,
    identifiersFromExtra,
    itemFingerprint,
    matchCandidate,
    normalizeCreators,
    normalizeDOI,
    normalizeIdentifier,
    normalizePerson,
    normalizeTitle,
    prepareCandidate,
    prepareItem,
    searchTerms
  };
});
