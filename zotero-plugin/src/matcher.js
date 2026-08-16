var ZoteroCheck = ZoteroCheck || {};

ZoteroCheck.Matcher = (function () {
  // cnki is auxiliary — only matched after DOI/PMID/ISBN
  const IDENTIFIER_PRIORITY = ["doi", "pmid", "isbn", "cnki"];

  /**
   * @typedef {Object} MatchResult
   * @property {"matched"|"possible_match"|"not_found"|"error"} status
   * @property {"doi"|"pmid"|"isbn"|"cnki"|"title"|"fuzzy"|null} matchType
   * @property {number} confidence
   * @property {Array<Object>} matches Internal matches removed at the API boundary.
   * @property {string=} reason
   */

  function normalizeDOI(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCNKI(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function normalizeIdentifier(value, type = "") {
    const normalizedType = String(type).toLowerCase();
    if (normalizedType === "doi") {
      return normalizeDOI(value);
    }
    if (normalizedType === "cnki") {
      return normalizeCNKI(value);
    }
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

  function normalizeTokenTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/&nbsp;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function titleSimilarity(a, b) {
    const normalizedA = normalizeTitle(a);
    const normalizedB = normalizeTitle(b);
    if (!normalizedA || !normalizedB) {
      return 0;
    }
    if (normalizedA === normalizedB) {
      return 1;
    }
    if (hasCJK(normalizedA) || hasCJK(normalizedB)) {
      return ngramDice(normalizedA, normalizedB, normalizedA.length >= 6 && normalizedB.length >= 6 ? 2 : 1);
    }
    return tokenDice(normalizeTokenTitle(a), normalizeTokenTitle(b));
  }

  function hasCJK(value) {
    return /[\u3400-\u9FFF\uF900-\uFAFF]/.test(value);
  }

  function ngramDice(a, b, size) {
    const aGrams = ngrams(a, size);
    const bGrams = ngrams(b, size);
    if (!aGrams.length || !bGrams.length) {
      return 0;
    }
    return diceCoefficient(aGrams, bGrams);
  }

  function ngrams(value, size) {
    if (value.length <= size) {
      return [value];
    }
    const grams = [];
    for (let i = 0; i <= value.length - size; i += 1) {
      grams.push(value.slice(i, i + size));
    }
    return grams;
  }

  function tokenDice(a, b) {
    const aTokens = a ? a.split(" ").filter(Boolean) : [];
    const bTokens = b ? b.split(" ").filter(Boolean) : [];
    if (!aTokens.length || !bTokens.length) {
      return 0;
    }
    return diceCoefficient(aTokens, bTokens);
  }

  function diceCoefficient(aValues, bValues) {
    const bCounts = new Map();
    for (const value of bValues) {
      bCounts.set(value, (bCounts.get(value) || 0) + 1);
    }

    let intersection = 0;
    for (const value of aValues) {
      const count = bCounts.get(value) || 0;
      if (count > 0) {
        intersection += 1;
        bCounts.set(value, count - 1);
      }
    }
    return roundConfidence((2 * intersection) / (aValues.length + bValues.length));
  }

  function normalizeCandidate(candidate = {}) {
    const identifiers = collectCandidateIdentifiers(candidate);
    return {
      identifiers,
      titleRaw: candidate.title || "",
      titleKey: normalizeTitle(candidate.title),
      year: extractYear(candidate.date || candidate.year),
      creators: normalizeCreators(candidate.creators)
    };
  }

  function collectCandidateIdentifiers(candidate = {}) {
    const identifiers = new Map();
    const fields = {
      DOI: "doi",
      doi: "doi",
      PMID: "pmid",
      pmid: "pmid",
      ISBN: "isbn",
      isbn: "isbn"
    };

    for (const [field, type] of Object.entries(fields)) {
      if (candidate[field]) {
        identifiers.set(type, normalizeIdentifier(candidate[field], type));
      }
    }

    // CNKI file ID — auxiliary, matched after DOI/PMID/ISBN
    const cnkiValue = candidate.cnkiFileID || candidate.cnki;
    if (cnkiValue) {
      identifiers.set("cnki", normalizeCNKI(cnkiValue));
    }

    if (Array.isArray(candidate.identifiers)) {
      for (const identifier of candidate.identifiers) {
        const [rawType, ...rest] = String(identifier).split(":");
        const type = rawType.toLowerCase();
        const value = rest.join(":");
        if (IDENTIFIER_PRIORITY.includes(type) && value) {
          identifiers.set(type, normalizeIdentifier(value, type));
        }
      }
    }

    return Object.fromEntries([...identifiers.entries()].filter(([, value]) => value));
  }

  function normalizeCreators(creators) {
    return Array.isArray(creators)
      ? creators.map((creator) => {
          if (typeof creator === "string") {
            return normalizePerson(creator);
          }
          if (!creator || typeof creator !== "object") {
            return "";
          }
          return normalizePerson(`${creator.lastName || ""}${creator.firstName || ""}${creator.name || ""}`);
        }).filter(Boolean)
      : [];
  }

  function normalizePerson(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim()
      .toLowerCase();
  }

  function extractYear(value) {
    const match = String(value || "").match(/(?:18|19|20)\d{2}/);
    return match ? match[0] : "";
  }

  function prepareRecord(record = {}) {
    return {
      identifiers: record.identifiers || collectCandidateIdentifiers(record),
      titleRaw: record.titleRaw || record.title || "",
      titleKey: record.titleKey || normalizeTitle(record.titleRaw || record.title),
      year: record.year || extractYear(record.date),
      creators: normalizeCreators(record.creators),
      result: record.result || record
    };
  }

  function matchRecords(candidate, records, { fuzzyMatching = true } = {}) {
    const normalizedCandidate = normalizeCandidate(candidate);
    const preparedRecords = records.map(prepareRecord);

    for (const type of IDENTIFIER_PRIORITY) {
      const value = normalizedCandidate.identifiers[type];
      if (!value) {
        continue;
      }
      const matches = preparedRecords.filter((record) => record.identifiers[type] === value);
      if (matches.length) {
        return createResult("matched", type, 1, matches.map((record) => record.result), `${type}_match`);
      }
    }

    if (normalizedCandidate.titleKey) {
      const sameTitleRecords = preparedRecords.filter((record) => record.titleKey === normalizedCandidate.titleKey);
      const exactMatches = filterByHints(sameTitleRecords, normalizedCandidate);
      if (exactMatches.length) {
        return createResult("matched", "title", 0.95, exactMatches.map((record) => record.result), "title_match");
      }
      if (sameTitleRecords.length) {
        return createResult("not_found", null, 0, [], "title_hint_conflict");
      }
    }

    if (fuzzyMatching && normalizedCandidate.titleKey) {
      const fuzzyMatches = [];
      for (const record of preparedRecords) {
        const score = titleSimilarity(normalizedCandidate.titleRaw || normalizedCandidate.titleKey, record.titleRaw || record.titleKey);
        if (score >= 0.8 && filterByHints([record], normalizedCandidate).length) {
          fuzzyMatches.push({ record, score });
        }
      }
      fuzzyMatches.sort((a, b) => b.score - a.score);
      if (fuzzyMatches.length) {
        const bestScore = fuzzyMatches[0].score;
        const status = bestScore >= 0.92 ? "matched" : "possible_match";
        const bestMatches = fuzzyMatches
          .filter((match) => match.score === bestScore)
          .map((match) => match.record.result);
        return createResult(status, "fuzzy", bestScore, bestMatches, "fuzzy_title_match");
      }
    }

    return createResult(
      "not_found",
      null,
      0,
      [],
      normalizedCandidate.titleKey || Object.keys(normalizedCandidate.identifiers).length ? "no_match" : "no_metadata"
    );
  }

  function filterByHints(records, candidate) {
    return records.filter((record) => {
      if (candidate.year && record.year && candidate.year !== record.year) {
        return false;
      }
      if (candidate.creators.length && record.creators.length) {
        return candidate.creators.some((creator) => record.creators.includes(creator));
      }
      return true;
    });
  }

  function createResult(status, matchType, confidence, matches, reason) {
    const result = {
      status,
      matchType,
      confidence: roundConfidence(confidence),
      matches: Array.isArray(matches) ? matches : []
    };
    if (reason) {
      result.reason = reason;
    }
    return result;
  }

  function roundConfidence(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(0, Math.min(1, Number(number.toFixed(4))));
  }

  return {
    IDENTIFIER_PRIORITY,
    normalizeDOI,
    normalizeCNKI,
    normalizeIdentifier,
    normalizeTitle,
    normalizeTokenTitle,
    titleSimilarity,
    normalizeCandidate,
    normalizePerson,
    extractYear,
    prepareRecord,
    matchRecords,
    createResult,
    roundConfidence
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = ZoteroCheck.Matcher;
}
