(function () {
  "use strict";

  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.siteAdapters = api.siteAdapters || {};

  var TITLE_SELECTOR = 'a[href*="/pages/publications/"][href*="origin=resultslist"]';
  var LIST_ITEM_SELECTOR = 'li[data-component="results-list-item"]';
  var AUTHOR_SELECTOR = '[data-testid="author-list"] button';
  var SOURCE_SELECTOR = '[data-component="document-source"]';
  var SOURCE_LINK_SELECTOR = SOURCE_SELECTOR + ' a[href*="/sourceid/"]';
  var YEAR_SELECTOR = '[data-testid="document-publication-year"]';
  var DETAIL_ROOT_SELECTOR = '[data-testid="publication-page-header"]';
  var DETAIL_TITLE_SELECTOR = '[data-testid="publication-titles"]';
  var BATCH_LIMIT = 80;
  var MESSAGE_FALLBACKS = {
    pageSaved: "Saved",
    pagePossiblySaved: "Possibly saved"
  };

  function cleanText(value) {
    var text = value && typeof value.textContent === "string" ? value.textContent : value;
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function splitTitleVariants(value) {
    var displayTitle = cleanText(value);
    var divider = displayTitle.indexOf(" | ");
    if (divider <= 0) return { title: displayTitle, alternateTitles: [] };
    var title = cleanText(displayTitle.slice(0, divider));
    var alternateTitle = cleanText(displayTitle.slice(divider + 3));
    if (!title || !alternateTitle || normalizeForSignature(title) === normalizeForSignature(alternateTitle)) {
      return { title: displayTitle, alternateTitles: [] };
    }
    return { title: title, alternateTitles: [alternateTitle] };
  }

  function normalizeForSignature(value) {
    var text = cleanText(value);
    try {
      text = text.normalize("NFKC");
    } catch (error) {
      // Normalization is an optional refinement in older browsers.
    }
    return text.toLowerCase().replace(/\s+/g, "");
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

  function isScopusHost(hostname) {
    return /(^|\.)scopus\.com$/i.test(String(hostname || ""));
  }

  function isSearchResultsPage() {
    return isScopusHost(location.hostname) &&
      /^\/pages\/search\/publications\/?$/i.test(location.pathname);
  }

  function isPublicationDetailsPage(urlValue) {
    try {
      var url = new URL(urlValue || location.href, location.href);
      return isScopusHost(url.hostname) &&
        /^\/pages\/publications\/[^/?#]+\/?$/i.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function getDetailBadgeAnchor(doc) {
    if (!isPublicationDetailsPage()) return null;
    var roots = (doc || document).querySelectorAll(DETAIL_ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i++) {
      if (!isVisible(roots[i])) continue;
      var title = roots[i].querySelector(DETAIL_TITLE_SELECTOR);
      if (title) return title.parentElement || title;
    }
    return null;
  }

  function absoluteURL(href) {
    try {
      var url = new URL(href, location.href);
      return isScopusHost(url.hostname) ? url.href : "";
    } catch (error) {
      return "";
    }
  }

  function getScopusId(url) {
    var match = String(url || "").match(/\/pages\/publications\/([^/?#]+)/i);
    return match ? match[1] : "";
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

  function getResultContainer(titleLink) {
    return titleLink.closest(LIST_ITEM_SELECTOR) || titleLink.closest("tr");
  }

  function getResultMode(container) {
    return container && container.matches(LIST_ITEM_SELECTOR) ? "list" : "table";
  }

  function getItemTypeLabel(container, titleLink) {
    if (getResultMode(container) === "list") {
      var titleBlock = titleLink.closest("h3");
      var label = titleBlock && titleBlock.parentElement
        ? titleBlock.parentElement.previousElementSibling
        : null;
      return cleanText(label).split("\u2022")[0];
    }
    return cleanText(container.previousElementSibling).split("\u2022")[0];
  }

  function inferItemType(label) {
    var value = cleanText(label).toLowerCase();
    if (value.indexOf("conference") !== -1) return "conferencePaper";
    if (value.indexOf("book chapter") !== -1) return "bookSection";
    if (value === "book") return "book";
    if (value.indexOf("editorial") !== -1) return "journalArticle";
    if (value.indexOf("article") !== -1 || value.indexOf("review") !== -1) {
      return "journalArticle";
    }
    return "document";
  }

  function getCreators(container) {
    var buttons = container.querySelectorAll(AUTHOR_SELECTOR);
    var creators = [];
    var seen = Object.create(null);
    for (var i = 0; i < buttons.length; i++) {
      if (!isVisible(buttons[i])) continue;
      var name = cleanText(buttons[i]).replace(/[,;]+$/g, "").trim();
      var key = normalizeForSignature(name);
      if (!name || seen[key]) continue;
      seen[key] = true;
      creators.push({ name: name });
    }
    return creators;
  }

  function getPublicationTitle(container) {
    return cleanText(container.querySelector(SOURCE_LINK_SELECTOR));
  }

  function getPublicationYear(container) {
    var yearElement = container.querySelector(YEAR_SELECTOR);
    var sourceElement = container.querySelector(SOURCE_SELECTOR);
    var text = cleanText(yearElement || sourceElement);
    var match = text.match(/(?:18|19|20|21)\d{2}/);
    return match ? match[0] : "";
  }

  function candidateSignature(candidate) {
    return [
      normalizeForSignature(candidate.itemType),
      normalizeForSignature(candidate.title),
      (candidate.alternateTitles || []).map(normalizeForSignature).join(","),
      (candidate.creators || []).map(function (creator) {
        return normalizeForSignature(creator && creator.name);
      }).join(","),
      normalizeForSignature(candidate.date),
      normalizeForSignature(candidate.publicationTitle),
      normalizeForSignature(getScopusId(candidate.url))
    ].join("~");
  }

  function parseResults() {
    var parsed = [];
    var links = document.querySelectorAll(TITLE_SELECTOR);
    var seenContainers = [];
    var seenPublications = Object.create(null);

    for (var i = 0; i < links.length && parsed.length < BATCH_LIMIT; i++) {
      var titleLink = links[i];
      var container = getResultContainer(titleLink);
      if (!container || !isVisible(titleLink) || seenContainers.indexOf(container) !== -1) {
        continue;
      }
      seenContainers.push(container);

      var titleVariants = splitTitleVariants(titleLink);
      var url = absoluteURL(titleLink.getAttribute("href"));
      if (!titleVariants.title || !url) continue;

      var candidate = {
        itemType: inferItemType(getItemTypeLabel(container, titleLink)),
        title: titleVariants.title,
        creators: getCreators(container),
        date: getPublicationYear(container),
        publicationTitle: getPublicationTitle(container),
        url: url,
        source: "scopus-search-results",
        matchPolicy: "scopus-tiered"
      };
      if (titleVariants.alternateTitles.length) {
        candidate.alternateTitles = titleVariants.alternateTitles;
      }
      var scopusId = getScopusId(url);
      var publicationKey = normalizeForSignature(scopusId) || candidateSignature(candidate);
      if (seenPublications[publicationKey]) continue;
      seenPublications[publicationKey] = true;

      parsed.push({
        anchor: titleLink,
        container: container,
        mode: getResultMode(container),
        scopusId: scopusId,
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

    var targets = [];
    var parsed = parseResults();
    for (var i = 0; i < parsed.length; i++) {
      var item = parsed[i];
      var identity = candidateSignature(item.candidate);
      var sourceId = "zcr-scopus-search-" + (item.scopusId || stableHash(identity));
      item.container.classList.add("zotero-check-search-result-row");
      item.container.dataset.zoteroCheckId = sourceId;
      item.container.dataset.zoteroCheckKind = "search-result";
      item.container.dataset.zoteroCheckState = "checking";
      item.container.dataset.zoteroCheckResultState = "checking";
      removeStatusChips(item.container);

      targets.push({
        sourceId: sourceId,
        element: item.container,
        row: item.container,
        anchor: item.anchor,
        kind: "scopus-search-result",
        candidate: item.candidate
      });
    }
    return targets;
  }

  function getBatchSignature() {
    if (!isSearchResultsPage()) return "";

    var parsed = parseResults();
    if (!parsed.length) return "";
    var hasTable = false;
    var hasList = false;
    var parts = [];
    for (var i = 0; i < parsed.length; i++) {
      parsed[i].container.classList.add("zotero-check-search-result-row");
      hasTable = hasTable || parsed[i].mode === "table";
      hasList = hasList || parsed[i].mode === "list";
      parts.push(parsed[i].scopusId || candidateSignature(parsed[i].candidate));
    }
    var view = hasTable && hasList ? "mixed" : hasList ? "list" : "table";
    return view + "|" + parts.join("|");
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
      chip.dataset.zoteroCheckOwner = "scopus";
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
      container.classList.add("zotero-check-search-result-row");
      container.dataset.zoteroCheckKind = "search-result";
      container.dataset.zoteroCheckState = mapped.state;
      container.dataset.zoteroCheckResultState = mapped.resultState;
      renderStatus(container, result, mapped);
    }
  }

  api.siteAdapters.scopus = {
    id: "scopus",
    label: "Scopus",
    supportsBatchCheck: true,
    detailPossibleLabelKey: "badgePossiblySaved",

    detect: function () {
      return isScopusHost(location.hostname);
    },

    isSearchResultsPage: isSearchResultsPage,
    isDetailPage: isPublicationDetailsPage,
    getDetailBadgeAnchor: getDetailBadgeAnchor,
    collectBatchTargets: collectBatchTargets,
    getBatchSignature: getBatchSignature,
    applyBatchResults: applyBatchResults
  };
})();
