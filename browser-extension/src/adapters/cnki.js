(function () {
  "use strict";

  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.siteAdapters = api.siteAdapters || {};

  var SEARCH_TABLE_SELECTOR = "table.result-table-list";
  var SEARCH_ROW_SELECTOR = SEARCH_TABLE_SELECTOR + " > tbody > tr, " + SEARCH_TABLE_SELECTOR + " > tr";
  var REFERENCE_CONTAINER_SELECTORS = [
    "#literature-recommend",
    "#kcms-data-similar",
    "#kcms-data-reader-recommend",
    "#kcms-related-fund-literature",
    "#kcms-study-period-results",
    "#div-literatureRef",
    "#quoted-references",
    "#quoted-citations",
    "#quoted-coreferences",
    "#quoted-cocitations",
    "#quoted-secondreferences",
    "#quoted-secondcitations",
    "#refpartdiv",
    ".essayBox"
  ];
  var REFERENCE_LINK_SELECTOR = REFERENCE_CONTAINER_SELECTORS.map(function (selector) {
    return selector + " a[href]";
  }).join(",");
  var BATCH_LIMIT = 80;
  var SEARCH_RESULT_CACHE_LIMIT = 240;
  var SEARCH_IDENTITY_CACHE_LIMIT = 320;
  var searchIdentityBySourceId = new Map();
  var searchResultCache = new Map();
  var MESSAGE_FALLBACKS = {
    pageSaved: "Saved",
    pagePossibleMatch: "Possible match",
    savedInStaleIndex: "Found in the previous local index; refresh is in progress",
    staleIndexNoMatch: "No match in the previous index; awaiting refresh",
    incompleteNotFoundInLibrary: "No match found; the result may be incomplete",
    noMatchingItem: "No matching Zotero item.",
    checkerError: "Paper Library Checker error"
  };

  function cleanText(value) {
    var text = value && typeof value.textContent === "string" ? value.textContent : value;
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function normalizeForSignature(value) {
    var text = cleanText(value);
    try {
      text = text.normalize("NFKC");
    } catch (error) {
      // String normalization is an optional refinement for older browsers.
    }
    return text.toLowerCase().replace(/[\s\u3000]+/g, "");
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

  function searchSourceId(index, identity) {
    return "zcr-cnki-search-" + index + "-" + stableHash(identity);
  }

  function rememberSearchIdentity(sourceId, identity) {
    if (searchIdentityBySourceId.has(sourceId)) searchIdentityBySourceId.delete(sourceId);
    searchIdentityBySourceId.set(sourceId, identity);
    while (searchIdentityBySourceId.size > SEARCH_IDENTITY_CACHE_LIMIT) {
      searchIdentityBySourceId.delete(searchIdentityBySourceId.keys().next().value);
    }
  }

  function rememberSearchResult(sourceId, result) {
    var identity = searchIdentityBySourceId.get(sourceId);
    if (!identity) return;
    if (searchResultCache.has(identity)) searchResultCache.delete(identity);
    searchResultCache.set(identity, Object.assign({}, result));
    while (searchResultCache.size > SEARCH_RESULT_CACHE_LIMIT) {
      searchResultCache.delete(searchResultCache.keys().next().value);
    }
  }

  function isCNKIHost(hostname) {
    return /(^|\.)cnki\.net$/i.test(String(hostname || ""));
  }

  function absoluteURL(href) {
    try {
      return new URL(href, location.href).href;
    } catch (error) {
      return "";
    }
  }

  function isCNKIArticleURL(href) {
    try {
      var url = new URL(href, location.href);
      return isCNKIHost(url.hostname) &&
        /\/kcms(?:2)?\/(?:article\/abstract|detail\/detail\.aspx|detail)/i.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function findTitleLink(row) {
    var links = row.querySelectorAll("td.name > a[href]");
    for (var i = 0; i < links.length; i++) {
      if (isCNKIArticleURL(links[i].getAttribute("href"))) return links[i];
    }
    return null;
  }

  function getAnchorTitle(anchor) {
    if (!anchor) return "";
    var titleNode = anchor.querySelector(".title[title], [data-title]");
    return cleanText(
      anchor.dataset.zoteroCheckOriginalTitle ||
      anchor.getAttribute("title") ||
      (titleNode && (titleNode.getAttribute("title") || titleNode.getAttribute("data-title"))) ||
      anchor
    );
  }

  function isVisibleWithin(element, boundary) {
    for (var node = element; node && node !== boundary.parentElement; node = node.parentElement) {
      if (node.nodeType !== 1) continue;
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return false;
      var inlineStyle = String(node.getAttribute("style") || "");
      if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inlineStyle)) return false;
      if (typeof window.getComputedStyle === "function") {
        var style = window.getComputedStyle(node);
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      }
      if (node === boundary) break;
    }
    return true;
  }

  function getSearchCreators(row) {
    var cell = row.querySelector("td.author, .author");
    if (!cell) return [];

    var creators = [];
    var seen = Object.create(null);
    for (var i = 0; i < cell.children.length; i++) {
      var child = cell.children[i];
      if (child.tagName !== "A" || !isVisibleWithin(child, cell)) continue;
      var name = cleanText(child).replace(/[*,;；，,]+$/g, "").trim();
      var key = normalizeForSignature(name);
      if (!name || seen[key]) continue;
      seen[key] = true;
      creators.push({ name: name });
    }
    return creators;
  }

  function getCellText(row, selector, preferLink) {
    var cell = row.querySelector(selector);
    if (!cell) return "";
    if (preferLink) {
      var link = cell.querySelector(":scope > a, a");
      if (link) return cleanText(link);
    }
    return cleanText(cell);
  }

  function inferItemType(row) {
    var databaseType = getCellText(row, "td.data, td.database, td.type, .data, .database, .type", false);
    if (/博士|硕士|学位/.test(databaseType)) return "thesis";
    if (/会议/.test(databaseType)) return "conferencePaper";
    if (/报纸/.test(databaseType)) return "newspaperArticle";
    if (/专利/.test(databaseType)) return "patent";
    if (/标准/.test(databaseType)) return "standard";
    if (/图书|专著/.test(databaseType)) return "book";
    return "journalArticle";
  }

  function dataFilename(node) {
    if (!node || node.nodeType !== 1) return "";
    return cleanText(node.getAttribute("data-filename") || "");
  }

  function filenameFromURL(href) {
    try {
      var url = new URL(href, location.href);
      var entries = Array.from(url.searchParams.entries());
      for (var i = 0; i < entries.length; i++) {
        if (String(entries[i][0]).toLowerCase() === "filename") {
          return cleanText(entries[i][1]);
        }
      }
    } catch (error) {
      // An invalid result URL is still usable as title-only metadata.
    }
    return "";
  }

  function getExplicitFilename(row, anchor) {
    var descendant = row && row.querySelector("[data-filename]");
    return dataFilename(anchor) || dataFilename(row) || dataFilename(descendant) ||
      filenameFromURL(anchor && anchor.getAttribute("href"));
  }

  function makeSearchCandidate(row) {
    var anchor = findTitleLink(row);
    if (!anchor) return null;
    var title = getAnchorTitle(anchor);
    var url = absoluteURL(anchor.getAttribute("href"));
    if (!title || !url || !isCNKIArticleURL(url)) return null;

    var candidate = {
      itemType: inferItemType(row),
      title: title,
      creators: getSearchCreators(row),
      date: getCellText(row, "td.date, .date", false),
      publicationTitle: getCellText(row, "td.source, .source", true),
      url: url,
      source: "cnki-search-results"
    };
    var filename = getExplicitFilename(row, anchor);
    if (filename) candidate.cnkiFileID = filename;
    return { anchor: anchor, candidate: candidate };
  }

  function searchRows() {
    return Array.from(document.querySelectorAll(SEARCH_ROW_SELECTOR));
  }

  function markChecking(element, row, kind) {
    element.dataset.zoteroCheckId = element.dataset.zoteroCheckId || "";
    element.dataset.zoteroCheckKind = kind;
    element.dataset.zoteroCheckState = "checking";
    element.dataset.zoteroCheckResultState = "checking";
    if (row && row !== element) {
      row.dataset.zoteroCheckState = "checking";
      row.dataset.zoteroCheckResultState = "checking";
    }
  }

  function collectSearchTargets() {
    var targets = [];
    var rows = searchRows();
    for (var i = 0; i < rows.length && targets.length < BATCH_LIMIT; i++) {
      var parsed = makeSearchCandidate(rows[i]);
      if (!parsed) continue;
      var identity = candidateSignature(parsed.candidate);
      var sourceId = searchSourceId(targets.length, identity);
      rememberSearchIdentity(sourceId, identity);
      rows[i].classList.add("zotero-check-search-result-row");
      rows[i].dataset.zoteroCheckId = sourceId;
      markChecking(rows[i], rows[i], "search");
      var oldStatus = (rows[i].querySelector("td.name") || rows[i]).querySelector(
        ".zotero-check-search-status"
      );
      if (oldStatus) oldStatus.remove();
      targets.push({
        sourceId: sourceId,
        element: rows[i],
        row: rows[i],
        anchor: parsed.anchor,
        kind: "cnki-search-result",
        candidate: parsed.candidate
      });
    }
    return targets;
  }

  function referenceAnchors() {
    return Array.from(document.querySelectorAll(REFERENCE_LINK_SELECTOR));
  }

  function collectReferenceTargets() {
    var targets = [];
    var anchors = referenceAnchors();
    for (var i = 0; i < anchors.length && targets.length < BATCH_LIMIT; i++) {
      var anchor = anchors[i];
      var href = anchor.getAttribute("href") || "";
      var title = getAnchorTitle(anchor);
      if (!href || href.indexOf("javascript:") === 0 || !isCNKIArticleURL(href) || title.length < 4 ||
          anchor.closest(".zotero-check-badge, .zotero-check-search-status")) {
        continue;
      }

      if (!anchor.dataset.zoteroCheckOriginalTitle) {
        anchor.dataset.zoteroCheckOriginalTitle = title;
      }
      var row = anchor.closest("li, tr, .essayBox, .result, .result-item, .doc-item");
      var candidate = {
        itemType: "journalArticle",
        title: title,
        url: absoluteURL(href),
        source: "cnki-list"
      };
      var filename = getExplicitFilename(row || anchor, anchor);
      if (filename) candidate.cnkiFileID = filename;
      var identity = candidateSignature(candidate);
      var sourceId = "zcr-cnki-list-" + targets.length + "-" + stableHash(identity);
      anchor.dataset.zoteroCheckId = sourceId;
      markChecking(anchor, row, "reference");
      anchor.classList.add("zotero-check-link");
      targets.push({
        sourceId: sourceId,
        element: anchor,
        anchor: anchor,
        row: row,
        kind: "cnki-list",
        candidate: candidate
      });
    }
    return targets;
  }

  function candidateSignature(candidate) {
    return [
      normalizeForSignature(candidate.itemType),
      normalizeForSignature(candidate.title),
      normalizeForSignature(candidate.date),
      normalizeForSignature(candidate.publicationTitle),
      (candidate.creators || []).map(function (creator) {
        return normalizeForSignature(creator && creator.name);
      }).join(","),
      normalizeForSignature(candidate.cnkiFileID)
    ].join("~");
  }

  function getSearchSignature() {
    var parts = [];
    var rows = searchRows();
    for (var i = 0; i < rows.length && parts.length < BATCH_LIMIT; i++) {
      var parsed = makeSearchCandidate(rows[i]);
      if (parsed) {
        var identity = candidateSignature(parsed.candidate);
        var sourceId = searchSourceId(parts.length, identity);
        rows[i].classList.add("zotero-check-search-result-row");
        var shouldRehydrate = rows[i].dataset.zoteroCheckId !== sourceId;
        rows[i].dataset.zoteroCheckId = sourceId;
        rows[i].dataset.zoteroCheckKind = "search";
        rememberSearchIdentity(sourceId, identity);
        if (searchResultCache.has(identity) &&
            rows[i].dataset.zoteroCheckResultState !== "checking") {
          var cached = searchResultCache.get(identity);
          var mapped = mapResult(cached);
          var status = rows[i].querySelector(".zotero-check-search-status");
          var statusMismatch = mapped.positive
            ? !status || status.dataset.zoteroCheckResultState !== mapped.resultState
            : Boolean(status);
          if (shouldRehydrate ||
              rows[i].dataset.zoteroCheckState !== mapped.state ||
              rows[i].dataset.zoteroCheckResultState !== mapped.resultState ||
              statusMismatch) {
            renderSearchResult(rows[i], cached, mapped);
          }
        }
        parts.push(identity);
      }
    }
    return parts.length ? "cnki-search:" + parts.join("|") : "";
  }

  function rehydrateSearchRows() {
    getSearchSignature();
  }

  function getBatchMutationContainers() {
    var selectors = REFERENCE_CONTAINER_SELECTORS.concat([SEARCH_TABLE_SELECTOR]);
    var containers = [];
    var seen = new Set();
    for (var i = 0; i < selectors.length; i++) {
      var matches = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < matches.length; j++) {
        if (seen.has(matches[j])) continue;
        seen.add(matches[j]);
        containers.push(matches[j]);
      }
    }
    return containers;
  }

  function isBatchNavigationEvent(event) {
    var target = event && event.target;
    if (!target || typeof target.closest !== "function") return false;
    var text = cleanText(target).replace(/\s+/g, "");
    if (/^(下一页|上一页|首页|尾页|末页|上页|下页|跳转|转到|确定)$/.test(text)) return true;
    if (/^(Next|Prev|Previous|First|Last)$/i.test(text)) return true;
    if (/^[»«›‹▶◀▲▼]$/.test(text) || /^(>>|<<|>|<)$/.test(text)) return true;
    if (!/^\d+$/.test(text) || target.closest("input, textarea, select")) return false;
    return Boolean(
      target.closest(
        ".pager, .pagination, #paginate, .pagebar, .turn_page, " +
        "[class*=\"paging\"], [class*=\"page-list\"], .countPage, #cpPage, " +
        ".TurnPage, .sabrosus, #pe100_page_有, [id*=\"page\"], [class*=\"page\"], " +
        "[id*=\"pager\"], [class*=\"pager\"], [id*=\"paging\"], [class*=\"paging\"]"
      )
    );
  }

  function getReferenceSignature() {
    var parts = [];
    var anchors = referenceAnchors();
    for (var i = 0; i < anchors.length && parts.length < BATCH_LIMIT; i++) {
      var anchor = anchors[i];
      var title = getAnchorTitle(anchor);
      var href = anchor.getAttribute("href") || "";
      if (!title || !isCNKIArticleURL(href)) continue;
      var explicitFilename = getExplicitFilename(anchor.closest("li, tr, .essayBox, .result, .result-item, .doc-item") || anchor, anchor);
      parts.push(normalizeForSignature(title) + "~" + normalizeForSignature(explicitFilename));
    }
    return parts.length ? "cnki-list:" + parts.join("|") : "";
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

  function resultTitle(result, mapped) {
    if (result.error || result.reason) return cleanText(result.error || result.reason);
    if (mapped.resultState === "matched") return translated("pageSaved");
    if (mapped.resultState === "possible_match") return translated("pagePossibleMatch");
    if (mapped.resultState === "stale_matched") return translated("savedInStaleIndex");
    if (mapped.resultState === "stale") return translated("staleIndexNoMatch");
    if (mapped.resultState === "incomplete") return translated("incompleteNotFoundInLibrary");
    if (mapped.resultState === "error") return translated("checkerError");
    return translated("noMatchingItem");
  }

  function renderSearchResult(row, result, mapped) {
    var anchor = findTitleLink(row);
    if (!anchor) return;
    row.classList.add("zotero-check-search-result-row");
    row.dataset.zoteroCheckState = mapped.state;
    row.dataset.zoteroCheckResultState = mapped.resultState;

    var cell = anchor.closest("td.name") || anchor.parentElement;
    if (!cell) return;
    var status = cell.querySelector(".zotero-check-search-status");
    if (!mapped.positive) {
      if (status) status.remove();
      return;
    }
    if (!status) {
      status = document.createElement("span");
      status.className = "zotero-check-search-status";
      anchor.insertAdjacentElement("afterend", status);
    }
    status.dataset.state = mapped.state;
    status.dataset.zoteroCheckResultState = mapped.resultState;
    status.textContent = translated(mapped.state === "matched" ? "pageSaved" : "pagePossibleMatch");
    status.setAttribute("aria-label", status.textContent);
    status.title = resultTitle(result, mapped);
  }

  function renderReferenceResult(anchor, result, mapped) {
    var row = anchor.closest("li, tr, .essayBox, .result, .result-item, .doc-item");
    anchor.dataset.zoteroCheckState = mapped.state;
    anchor.dataset.zoteroCheckResultState = mapped.resultState;
    anchor.classList.add("zotero-check-link");
    anchor.setAttribute("title", resultTitle(result, mapped));
    if (row) {
      row.dataset.zoteroCheckState = mapped.state;
      row.dataset.zoteroCheckResultState = mapped.resultState;
    }
  }

  api.siteAdapters.cnki = {
    id: "cnki",
    label: "CNKI",
    supportsBatchCheck: true,

    detect: function () {
      return isCNKIHost(location.hostname);
    },

    isSearchResultsPage: function () {
      if (!isCNKIHost(location.hostname)) return false;
      if (/\/kcms(?:2)?\/(?:article\/abstract|detail\/detail\.aspx|detail)/i.test(location.pathname)) {
        return false;
      }
      if (/\/kns(?:8s)?\/(?:defaultresult|advsearch|brief|result)(?:\/|$)/i.test(location.pathname)) {
        return true;
      }
      return Boolean(
        document.querySelector(SEARCH_TABLE_SELECTOR) &&
        document.querySelector(".pages, .pagesnums, .pager, .pagination")
      );
    },

    getBatchMutationContainers: getBatchMutationContainers,

    isBatchNavigationEvent: isBatchNavigationEvent,

    collectBatchTargets: function () {
      return this.isSearchResultsPage() ? collectSearchTargets() : collectReferenceTargets();
    },

    getBatchSignature: function () {
      return this.isSearchResultsPage() ? getSearchSignature() : getReferenceSignature();
    },

    applyBatchResults: function (results) {
      if (!Array.isArray(results) || !results.length) return;
      for (var i = 0; i < results.length; i++) {
        var result = results[i] || {};
        var sourceId = result.sourceId || "";
        if (searchIdentityBySourceId.has(sourceId)) rememberSearchResult(sourceId, result);
        var element = findTargetElement(sourceId);
        if (!element) continue;
        var mapped = mapResult(result);
        if (element.dataset.zoteroCheckKind === "search") {
          renderSearchResult(element, result, mapped);
        } else {
          renderReferenceResult(element, result, mapped);
        }
      }
      if (this.isSearchResultsPage()) rehydrateSearchRows();
    }
  };
})();
