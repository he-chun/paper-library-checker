(function () {
  // CSS.escape polyfill — required by generic.js extractor
  if (!window.CSS) { window.CSS = {}; }
  if (!window.CSS.escape) {
    window.CSS.escape = function (value) {
      return String(value).replace(/[^\w-]/g, "\\$&");
    };
  }

  const api = (window.ZoteroCheck = window.ZoteroCheck || {});

  api.normalizeTitle = function normalizeTitle(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/&nbsp;/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u3002\uFF0E.]/g, ".")
      .replace(/[\uFF0C,]/g, ",")
      .replace(/[\uFF1A:]/g, ":")
      .replace(/[\uFF1B;]/g, ";")
      .replace(/[\uFF01!]/g, "!")
      .replace(/[\uFF1F?]/g, "?")
      .replace(/[\s\u00A0]+/g, "")
      .replace(/[\p{P}\p{S}]/gu, "");
  };

  api.normalizeIdentifier = function normalizeIdentifier(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^doi:\s*/i, "")
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/\s+/g, "");
  };

  api.visibleText = function visibleText(element) {
    if (!element) {
      return "";
    }

    let text = "";
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const style = window.getComputedStyle(node);
        if (style.display !== "none" && style.visibility !== "hidden") {
          text += " " + visibleText(node);
        }
      }
    }
    return text.trim().replace(/\s+/g, " ");
  };

  api.uniqueCandidates = function uniqueCandidates(candidates) {
    const seen = new Set();
    const unique = [];
    for (const candidate of candidates) {
      const key = [
        candidate.DOI || candidate.doi || "",
        candidate.cnkiFileID || "",
        api.normalizeTitle(candidate.title || "")
      ].join("|");
      if (!candidate.title && !candidate.DOI && !candidate.doi) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(candidate);
    }
    return unique;
  };
})();
