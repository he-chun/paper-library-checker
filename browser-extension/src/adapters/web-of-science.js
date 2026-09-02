(function () {
  "use strict";

  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.siteAdapters = api.siteAdapters || {};

  var RECORD_SELECTOR = '[data-test="Summary-publication-record"]';
  var TITLE_SELECTOR = '[data-ta="summary-record-title-link"][href*="/full-record/"]';
  var AUTHOR_SELECTOR = 'app-summary-authors [data-ta*="DisplayName-author-"]';
  var DATE_SELECTOR = '[data-ta="summary-record-pubdate"]';
  var SOURCE_SELECTOR = '[data-ta="jcr-link-menu"]';
  var DETAIL_ROOT_SELECTOR = '#snMainArticle';
  var DETAIL_TITLE_SELECTOR = '[data-ta^="FullRTa-fullRecordtitle-"]';
  var BATCH_LIMIT = 80;
  var MESSAGE_FALLBACKS = {
    pageSaved: "Saved",
    pagePossiblySaved: "Possibly saved"
  };

  function cleanText(value) {
    var text = value && typeof value.textContent === "string" ? value.textContent : value;
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function cleanNodeText(node) {
    if (!node) return "";
    var clone = node.cloneNode(true);
    var noise = clone.querySelectorAll(
      '#zotero-check-badge-host, .zotero-check-search-status, mat-icon, [hidden], [aria-hidden="true"]'
    );
    for (var i = 0; i < noise.length; i++) noise[i].remove();
    return cleanText(clone).replace(/\barrow_drop_down\b/gi, "").trim();
  }

  function normalizeForSignature(value) {
    var text = cleanText(value);
    try {
      text = text.normalize("NFKC");
    } catch (error) {
      // Normalization is an optional refinement in older browsers.
    }
    return text.toLowerCase().replace(/[\s,;]+/g, "");
  }

  function translated(key) {
    try {
      if (window.PLCI18n && typeof window.PLCI18n.t === "function") {
        var value = window.PLCI18n.t(key);
        if (value && value !== key) return value;
      }
    } catch (error) {
      // The adapter also runs in small standalone fixtures without i18n.
    }
    return MESSAGE_FALLBACKS[key] || key;
  }

  function stableHash(value) {
    var hash = 2166136261;
    var text = String(value || "");
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function isWebOfScienceHost(hostname) {
    var value = String(hostname || "").toLowerCase();
    return value === "webofscience.clarivate.cn" ||
      value === "webofscience.com" || value.endsWith(".webofscience.com");
  }

  function parseURL(value) {
    try {
      return new URL(value || location.href, location.href);
    } catch (error) {
      return null;
    }
  }

  function isSearchResultsPage() {
    return isWebOfScienceHost(location.hostname) &&
      /^\/wos\/[^/]+\/summary\//i.test(location.pathname);
  }

  function isFullRecordPage(urlValue) {
    var url = parseURL(urlValue);
    return Boolean(
      url && isWebOfScienceHost(url.hostname) &&
      /^\/wos\/[^/]+\/full-record\/[^/?#]+\/?$/i.test(url.pathname)
    );
  }

  function isVisible(element) {
    for (var node = element; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      var inlineStyle = String(node.getAttribute("style") || "");
      if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inlineStyle)) return false;
      if (typeof window.getComputedStyle === "function") {
        try {
          var style = window.getComputedStyle(node);
          if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        } catch (error) {
          // Small DOM fixtures may not implement computed styles completely.
        }
      }
    }
    return true;
  }

  function getDetailBadgeAnchor(doc) {
    if (!isFullRecordPage()) return null;
    var roots = (doc || document).querySelectorAll(DETAIL_ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i++) {
      if (!isVisible(roots[i])) continue;
      var title = roots[i].querySelector(DETAIL_TITLE_SELECTOR);
      if (title) return title.parentElement || title;
    }
    return null;
  }

  function absoluteURL(href) {
    var url = parseURL(href);
    return url && isWebOfScienceHost(url.hostname) ? url.href : "";
  }

  function getRecordId(urlValue) {
    var match = String(urlValue || "").match(/\/full-record\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function getOpenURLMetadata(container) {
    var links = container.querySelectorAll('a[href*="/api/gateway"]');
    for (var i = 0; i < links.length; i++) {
      try {
        var gateway = new URL(links[i].getAttribute("href"), location.href);
        var destination = gateway.searchParams.get("DestURL");
        if (!destination) continue;
        var openURL = new URL(destination);
        var identifiers = openURL.searchParams.getAll("rft_id");
        var doi = "";
        for (var j = 0; j < identifiers.length; j++) {
          if (/^info:doi\//i.test(identifiers[j])) {
            doi = identifiers[j].replace(/^info:doi\//i, "");
            break;
          }
        }
        return {
          DOI: cleanText(doi),
          genre: cleanText(openURL.searchParams.get("rft.genre")),
          date: cleanText(openURL.searchParams.get("rft.date")),
          publicationTitle: cleanText(openURL.searchParams.get("rft.jtitle")),
          firstName: cleanText(openURL.searchParams.get("rft.aufirst")),
          lastName: cleanText(openURL.searchParams.get("rft.aulast"))
        };
      } catch (error) {
        // Not every gateway link is an OpenURL link.
      }
    }
    return {};
  }

  function inferItemType(genre) {
    var value = cleanText(genre).toLowerCase();
    if (value.indexOf("conference") !== -1) return "conferencePaper";
    if (value.indexOf("book") !== -1) return "bookSection";
    if (value.indexOf("thesis") !== -1 || value.indexOf("dissertation") !== -1) return "thesis";
    if (value === "article" || value.indexOf("journal") !== -1) return "journalArticle";
    return "document";
  }

  function getCreators(container, openURL) {
    var creators = [];
    var seen = Object.create(null);

    function add(name) {
      var value = cleanText(name).replace(/[,;]+$/g, "").trim();
      var key = normalizeForSignature(value);
      if (!value || seen[key]) return;
      seen[key] = true;
      creators.push({ name: value });
    }

    if (openURL.firstName && openURL.lastName) {
      add(openURL.lastName + ", " + openURL.firstName);
    }
    var nodes = container.querySelectorAll(AUTHOR_SELECTOR);
    for (var i = 0; i < nodes.length; i++) {
      if (isVisible(nodes[i])) add(nodes[i]);
    }
    return creators;
  }

  function getPublicationYear(container, openURL) {
    var text = cleanNodeText(container.querySelector(DATE_SELECTOR)) || openURL.date || "";
    var match = text.match(/(?:18|19|20|21)\d{2}/);
    return match ? match[0] : "";
  }

  function getPublicationTitle(container, openURL) {
    return cleanNodeText(container.querySelector(SOURCE_SELECTOR)) || openURL.publicationTitle || "";
  }

  function candidateSignature(candidate) {
    return [
      normalizeForSignature(candidate.itemType),
      normalizeForSignature(candidate.DOI),
      normalizeForSignature(candidate.title),
      (candidate.creators || []).map(function (creator) {
        return normalizeForSignature(creator && creator.name);
      }).join(","),
      normalizeForSignature(candidate.date),
      normalizeForSignature(candidate.publicationTitle),
      normalizeForSignature(getRecordId(candidate.url))
    ].join("~");
  }

  function parseResults() {
    var parsed = [];
    var records = document.querySelectorAll(RECORD_SELECTOR);
    var seen = Object.create(null);
    for (var i = 0; i < records.length && parsed.length < BATCH_LIMIT; i++) {
      var container = records[i];
      if (!isVisible(container)) continue;
      var titleLink = container.querySelector(TITLE_SELECTOR);
      if (!titleLink || !isVisible(titleLink)) continue;
      var title = cleanNodeText(titleLink);
      var url = absoluteURL(titleLink.getAttribute("href"));
      if (!title || !url || !isFullRecordPage(url)) continue;

      var openURL = getOpenURLMetadata(container);
      var candidate = {
        itemType: inferItemType(openURL.genre),
        title: title,
        creators: getCreators(container, openURL),
        date: getPublicationYear(container, openURL),
        publicationTitle: getPublicationTitle(container, openURL),
        url: url,
        source: "web-of-science-search-results"
      };
      if (openURL.DOI) candidate.DOI = openURL.DOI;

      var recordId = getRecordId(url);
      var identity = normalizeForSignature(recordId) || candidateSignature(candidate);
      if (seen[identity]) continue;
      seen[identity] = true;
      parsed.push({
        anchor: titleLink,
        container: container,
        recordId: recordId,
        candidate: candidate
      });
    }
    return parsed;
  }

  function removeStatusChips(container) {
    var chips = container.querySelectorAll(".zotero-check-search-status");
    for (var i = 0; i < chips.length; i++) chips[i].remove();
  }

  function collectBatchTargets() {
    if (!isSearchResultsPage()) return [];
    return parseResults().map(function (item) {
      var identity = candidateSignature(item.candidate);
      var sourceId = "zcr-wos-search-" + stableHash(item.recordId || identity);
      item.container.dataset.zoteroCheckId = sourceId;
      item.container.dataset.zoteroCheckKind = "search-result";
      item.container.dataset.zoteroCheckState = "checking";
      item.container.dataset.zoteroCheckResultState = "checking";
      removeStatusChips(item.container);
      return {
        sourceId: sourceId,
        element: item.container,
        row: item.container,
        anchor: item.anchor,
        kind: "web-of-science-search-result",
        candidate: item.candidate
      };
    });
  }

  function getBatchSignature() {
    if (!isSearchResultsPage()) return "";
    var parsed = parseResults();
    if (!parsed.length) return "";
    return "wos-search:" + parsed.map(function (item) {
      return item.recordId || candidateSignature(item.candidate);
    }).join("|");
  }

  function mapResult(result) {
    result = result && typeof result === "object" ? result : {};
    if (result.complete === false && result.freshness === "stale") {
      return {
        state: result.status === "matched" ? "possible" : "unknown",
        resultState: result.status === "matched" ? "stale_matched" : "stale",
        positive: false
      };
    }
    if (result.status === "not_found" && result.complete === false) {
      return { state: "unknown", resultState: "incomplete", positive: false };
    }
    if (result.status === "matched") {
      return { state: "matched", resultState: "matched", positive: true };
    }
    if (result.status === "possible_match" || result.status === "possible") {
      return { state: "possible", resultState: "possible_match", positive: true };
    }
    if (result.status === "error") {
      return { state: "error", resultState: "error", positive: false };
    }
    return { state: "missing", resultState: result.status || "not_found", positive: false };
  }

  function findTargetElement(sourceId) {
    var elements = document.querySelectorAll("[data-zotero-check-id]");
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].dataset.zoteroCheckId === sourceId) return elements[i];
    }
    return null;
  }

  function resultTooltip(result, mapped) {
    var matchTitle = result.matches && result.matches[0] ? result.matches[0].title : "";
    var parts = [
      "status: " + mapped.resultState,
      "matchType: " + (result.matchType || "N/A"),
      "confidence: " + (result.confidence != null ? result.confidence : "N/A")
    ];
    if (matchTitle) parts.push("matched item: " + matchTitle);
    if (result.error) parts.push("error: " + cleanText(result.error));
    if (result.reason) parts.push("reason: " + cleanText(result.reason));
    return parts.join("\n");
  }

  function renderStatus(container, result, mapped) {
    var titleLink = container.querySelector(TITLE_SELECTOR);
    if (!titleLink) return;
    if (!mapped.positive) {
      removeStatusChips(container);
      return;
    }
    var chip = container.querySelector(".zotero-check-search-status");
    if (!chip) {
      chip = document.createElement("span");
      chip.className = "zotero-check-search-status";
      chip.dataset.zoteroCheckOwner = "web-of-science";
    }
    titleLink.insertAdjacentElement("afterend", chip);
    chip.dataset.state = mapped.state;
    chip.dataset.zoteroCheckResultState = mapped.resultState;
    chip.textContent = translated(mapped.state === "matched" ? "pageSaved" : "pagePossiblySaved");
    chip.setAttribute("aria-label", chip.textContent);
    chip.title = resultTooltip(result, mapped);
  }

  function applyBatchResults(results) {
    if (!Array.isArray(results) || !results.length) return;
    for (var i = 0; i < results.length; i++) {
      var result = results[i] || {};
      var container = findTargetElement(result.sourceId || "");
      if (!container) continue;
      var mapped = mapResult(result);
      container.dataset.zoteroCheckKind = "search-result";
      container.dataset.zoteroCheckState = mapped.state;
      container.dataset.zoteroCheckResultState = mapped.resultState;
      renderStatus(container, result, mapped);
    }
  }

  api.siteAdapters.webOfScience = {
    id: "web-of-science",
    label: "Web of Science",
    supportsBatchCheck: true,

    detect: function () {
      return isWebOfScienceHost(location.hostname);
    },

    isSearchResultsPage: isSearchResultsPage,
    isDetailPage: isFullRecordPage,
    getDetailBadgeAnchor: getDetailBadgeAnchor,
    getBatchMutationContainers: function () {
      return Array.from(document.querySelectorAll("app-records-list, app-record"));
    },
    collectBatchTargets: collectBatchTargets,
    getBatchSignature: getBatchSignature,
    applyBatchResults: applyBatchResults
  };
})();
