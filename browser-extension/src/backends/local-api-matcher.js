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

  function candidateTitleValues(candidate = {}) {
    const inputs = [candidate.title, ...(Array.isArray(candidate.alternateTitles)
      ? candidate.alternateTitles
      : [])];
    const seen = new Set();
    const values = [];
    for (const input of inputs) {
      const value = typeof input === "string" ? input.trim() : "";
      const key = normalizeTitle(value);
      if (!value || !key || seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    return values;
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

  function normalizeScopusCreatorPrefixes(creators) {
    if (!Array.isArray(creators)) return [];
    return creators.map((creator) => {
      const rawName = typeof creator === "string"
        ? creator
        : creator && typeof creator === "object"
          ? creator.name
          : "";
      const tokens = String(rawName || "").normalize("NFKC").match(/[\p{L}\p{N}]+/gu) || [];
      if (tokens.length < 2 || Array.from(tokens[1]).length !== 1) return "";
      return normalizePerson(`${tokens[0]}${tokens[1]}`);
    }).filter(Boolean);
  }

  function creatorsMatch(itemCreators, candidate) {
    if (candidate.creators.some((creator) => itemCreators.includes(creator))) return true;
    return (candidate.scopusCreatorPrefixes || []).some((prefix) =>
      itemCreators.some((creator) => creator.length > prefix.length && creator.startsWith(prefix))
    );
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
    const titles = candidateTitleValues(candidate).map(normalizeTitle);
    return {
      identifiers: collectIdentifiers(candidate),
      title: titles[0] || "",
      titles,
      year: extractYear(candidate.date || candidate.year),
      creators: normalizeCreators(candidate.creators),
      publicationTitle: normalizeTitle(candidate.publicationTitle),
      matchPolicy: candidate.matchPolicy === "scopus-tiered" ? "scopus-tiered" : "",
      scopusCreatorPrefixes: normalizeScopusCreatorPrefixes(candidate.creators)
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
      creators: normalizeCreators(data.creators),
      publicationTitle: normalizeTitle(
        data.publicationTitle || data.journalAbbreviation || data.proceedingsTitle || data.bookTitle
      )
    };
  }

  function scopusTieredEvidence(item, candidate) {
    if (!candidate.year || !item.year || candidate.year !== item.year) return "none";
    const authorMatched = candidate.creators.length > 0 && item.creators.length > 0 &&
      creatorsMatch(item.creators, candidate);
    const journalMatched = Boolean(
      candidate.publicationTitle && item.publicationTitle &&
      candidate.publicationTitle === item.publicationTitle
    );
    return authorMatched && journalMatched ? "full" : "title_year";
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
    if (normalizedCandidate.titles.length) {
      const titleKeys = new Set(normalizedCandidate.titles);
      const sameTitle = preparedItems.filter((item) => titleKeys.has(item.title));
      if (normalizedCandidate.matchPolicy === "scopus-tiered") {
        const evidence = sameTitle.map((item) => scopusTieredEvidence(item, normalizedCandidate));
        if (evidence.includes("full")) {
          return { status: "matched", matchType: "title", confidence: 0.95 };
        }
        if (evidence.includes("title_year")) {
          return { status: "possible_match", matchType: "title", confidence: 0.75 };
        }
        return { status: "not_found", matchType: null, confidence: 0 };
      }
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
      ...candidateTitleValues(candidate)
    ].filter(Boolean))];
  }

  function candidateKey(candidate) {
    const normalized = prepareCandidate(candidate);
    return JSON.stringify({
      identifiers: IDENTIFIER_PRIORITY.map((type) => normalized.identifiers[type] || ""),
      titles: normalized.titles,
      year: normalized.year,
      creators: [...new Set(normalized.creators)].sort(),
      publicationTitle: normalized.publicationTitle,
      matchPolicy: normalized.matchPolicy
    });
  }

  function itemFingerprint(item) {
    const prepared = prepareItem(item);
    if (!prepared) return "";
    return JSON.stringify({
      identifiers: IDENTIFIER_PRIORITY.map((type) => prepared.identifiers[type] || ""),
      title: prepared.title,
      year: prepared.year,
      creators: [...new Set(prepared.creators)].sort(),
      publicationTitle: prepared.publicationTitle
    });
  }

  return {
    IDENTIFIER_PRIORITY,
    NON_BIBLIOGRAPHIC_TYPES,
    candidateTitleValues,
    collectIdentifiers,
    candidateKey,
    extractCNKIFromURL,
    extractYear,
    identifiersFromExtra,
    itemFingerprint,
    matchCandidate,
    creatorsMatch,
    normalizeCreators,
    normalizeDOI,
    normalizeIdentifier,
    normalizePerson,
    normalizeTitle,
    prepareCandidate,
    prepareItem,
    scopusTieredEvidence,
    searchTerms
  };
});
