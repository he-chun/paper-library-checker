(function () {
  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.siteAdapters = api.siteAdapters || {};

  var REFERENCE_SELECTOR = [
    ".bibliography .references .reference",
    ".references .reference"
  ].join(",");

  var BATCH_LIMIT = 80;

  function extractViewArticleURL(refEl) {
    var link = refEl.querySelector('a[href*="sciencedirect.com/science/article/pii"]');
    if (!link) return "";
    try {
      return new URL(link.href, location.href).href;
    } catch (e) {
      return "";
    }
  }

  function extractPII(url) {
    if (!url) return "";
    var match = url.match(/\/pii\/([^/?&#]+)/i);
    return match ? match[1] : "";
  }

  function extractFromGoogleScholar(refEl) {
    var link = refEl.querySelector('a[href*="scholar.google.com/scholar_lookup"]');
    if (!link) return null;

    try {
      var url = new URL(link.href);
      var title = url.searchParams.get("title") || "";
      var year = url.searchParams.get("publication_year") || "";
      var authors = url.searchParams.getAll("author") || [];

      if (!title) return null;

      return {
        itemType: "journalArticle",
        title: decodeURIComponent(title),
        date: year,
        creators: authors.map(function (name) {
          return { name: decodeURIComponent(name) };
        }),
        source: "sciencedirect-google-scholar"
      };
    } catch (e) {
      return null;
    }
  }

  function extractFromText(refEl) {
    // Clone and strip UI link containers so only citation text remains
    var clone = refEl.cloneNode(true);
    var linksEl = clone.querySelector('.ReferenceLinks');
    if (linksEl) linksEl.remove();

    // 1. Structured title element inside author-ref (journal articles)
    var titleEl = clone.querySelector('.title.text-m');
    if (titleEl) {
      var structuredTitle = (titleEl.textContent || "").replace(/\s+/g, " ").trim();
      if (structuredTitle) {
        return {
          itemType: "journalArticle",
          title: structuredTitle,
          source: "sciencedirect-reference-text"
        };
      }
    }

    // 2. Parse from citation text (other-ref or fallback)
    var citationEl = clone.querySelector('.author-ref, .other-ref');
    var text = citationEl
      ? (citationEl.textContent || "").replace(/\s+/g, " ").trim()
      : (clone.textContent || "").replace(/\s+/g, " ").trim();

    // Strip leading citation number like "[1] "
    text = text.replace(/^\[\d+\]\s*/, "");

    var title = parseTitleFromCitation(text);

    return {
      itemType: "journalArticle",
      title: title || text.substring(0, 300),
      source: "sciencedirect-reference-text"
    };
  }

  function parseTitleFromCitation(text) {
    if (!text) return "";

    // "Authors, Title, in: Journal..."  — extract content before " in:"
    var inIdx = text.search(/,\s*in\s*:\s*/i);
    var content = inIdx > 0 ? text.substring(0, inIdx) : text;

    // Strip leading author names (pattern: "Initial. LastName" or "Initial.Initial. LastName")
    var parts = content.split(/,\s*/);
    var titleParts = [];
    var foundTitle = false;

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (!foundTitle && /^[A-Z]\./.test(part) && part.length < 50) {
        continue;
      }
      foundTitle = true;
      titleParts.push(part);
    }

    if (titleParts.length > 0) {
      return titleParts.join(", ").trim();
    }

    // All parts matched the author pattern — take the longest segment
    var longest = "";
    for (var j = 0; j < parts.length; j++) {
      if (parts[j].length > longest.length) {
        longest = parts[j];
      }
    }
    return longest;
  }

  api.siteAdapters.sciencedirect = {
    id: "sciencedirect",
    label: "ScienceDirect",

    detect: function () {
      return /(^|\.)sciencedirect\.com$/i.test(location.hostname);
    },

    collectBatchTargets: function () {
      var targets = [];
      var refs = document.querySelectorAll(REFERENCE_SELECTOR);

      for (var i = 0; i < refs.length && targets.length < BATCH_LIMIT; i++) {
        var refEl = refs[i];
        var id = "zcr-sd-" + i;
        refEl.dataset.zoteroCheckId = id;

        // Primary candidate: Google Scholar first, then text-based extraction
        var candidate = extractFromGoogleScholar(refEl) || extractFromText(refEl);

        // Attach View article URL and PII to the candidate if available
        var viewUrl = extractViewArticleURL(refEl);
        if (viewUrl) {
          candidate.url = candidate.url || viewUrl;
          var pii = extractPII(viewUrl);
          if (pii) {
            candidate.pii = pii;
          }
        }

        targets.push({
          sourceId: id,
          element: refEl,
          candidate: candidate
        });
      }

      return targets;
    },

    getBatchSignature: function () {
      var refs = document.querySelectorAll(REFERENCE_SELECTOR);
      var parts = [];
      for (var i = 0; i < refs.length && i < BATCH_LIMIT; i++) {
        var refEl = refs[i];
        var scholarLink = refEl.querySelector('a[href*="scholar.google.com/scholar_lookup"]');
        if (scholarLink) {
          parts.push(scholarLink.href);
        } else {
          var viewLink = refEl.querySelector('a[href*="sciencedirect.com/science/article/pii"]');
          if (viewLink) {
            parts.push(viewLink.href);
          } else {
            parts.push((refEl.textContent || "").replace(/\s+/g, "").substring(0, 80));
          }
        }
      }
      return parts.join("|");
    },

    applyBatchResults: function (results) {
      if (!Array.isArray(results) || !results.length) return;

      var FRAME_SIZE = 12;
      var cursor = 0;

      function processFrame() {
        var end = Math.min(cursor + FRAME_SIZE, results.length);
        for (var i = cursor; i < end; i++) {
          var result = results[i];
          var el = document.querySelector(
            '[data-zotero-check-id="' + CSS.escape(result.sourceId) + '"]'
          );
          if (!el) continue;

          var status = result.status || "error";
          el.dataset.zoteroCheckState = status;

          var parts = [
            "status: " + status,
            "matchType: " + (result.matchType || "N/A"),
            "confidence: " + (result.confidence != null ? result.confidence : "N/A")
          ];
          if (result.error) {
            parts.push("error: " + result.error);
          }
          if (result.reason) {
            parts.push("reason: " + result.reason);
          }
          el.title = parts.join("\n");
        }

        cursor = end;
        if (cursor < results.length) {
          if (typeof requestIdleCallback === "function") {
            requestIdleCallback(processFrame, { timeout: 3000 });
          } else {
            setTimeout(processFrame, 16);
          }
        }
      }

      processFrame();
    }
  };
})();
