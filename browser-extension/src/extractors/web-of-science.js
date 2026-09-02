(function () {
  "use strict";

  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.extractors = api.extractors || [];

  var DETAIL_ROOT_SELECTOR = "#snMainArticle";
  var TITLE_SELECTOR = '[data-ta^="FullRTa-fullRecordtitle-"]';
  var FULL_AUTHOR_SELECTOR = '[data-ta*="FrAuthStandard-author-"]';
  var DISPLAY_AUTHOR_SELECTOR = '[data-ta*="DisplayName-author-"]';
  var DOI_SELECTOR = '[data-ta="FullRTa-DOI"]';
  var DATE_SELECTOR = '[data-ta="FullRTa-pubdate"]';
  var TYPE_SELECTOR = '[data-ta^="FullRTa-doctype-"]';
  var SOURCE_LABEL_SELECTOR = '[data-ta="FullRTa-sourceLabel"]';

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
    return cleanText(clone).replace(/\barrow_(?:back|drop_down)\b/gi, "").trim();
  }

  function normalizeForSignature(value) {
    var text = cleanText(value);
    try {
      text = text.normalize("NFKC");
    } catch (error) {
      // Normalization is an optional refinement in older browsers.
    }
    return text.toLowerCase().replace(/[\s,;()]+/g, "");
  }

  function parseURL(value) {
    try {
      return new URL(value || location.href, location.href);
    } catch (error) {
      return null;
    }
  }

  function isWebOfScienceHost(hostname) {
    var value = String(hostname || "").toLowerCase();
    return value === "webofscience.clarivate.cn" ||
      value === "webofscience.com" || value.endsWith(".webofscience.com");
  }

  function isFullRecordURL(value) {
    var url = parseURL(value);
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

  function findDetailRoot(doc) {
    var roots = doc.querySelectorAll(DETAIL_ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i++) {
      if (isVisible(roots[i]) && roots[i].querySelector(TITLE_SELECTOR)) return roots[i];
    }
    return null;
  }

  function inferItemType(label) {
    var value = cleanText(label).toLowerCase();
    if (value.indexOf("conference") !== -1 || value.indexOf("proceedings") !== -1) {
      return "conferencePaper";
    }
    if (value.indexOf("book chapter") !== -1) return "bookSection";
    if (value === "book") return "book";
    if (value.indexOf("thesis") !== -1 || value.indexOf("dissertation") !== -1) return "thesis";
    if (value.indexOf("article") !== -1 || value.indexOf("review") !== -1 ||
        value.indexOf("editorial") !== -1 || value.indexOf("correction") !== -1) {
      return "journalArticle";
    }
    return "document";
  }

  function getCreators(root) {
    var nodes = root.querySelectorAll(FULL_AUTHOR_SELECTOR);
    if (!nodes.length) nodes = root.querySelectorAll(DISPLAY_AUTHOR_SELECTOR);
    var creators = [];
    var seen = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      if (!isVisible(nodes[i])) continue;
      var name = cleanNodeText(nodes[i]).replace(/^\(|\)$/g, "").replace(/[,;]+$/g, "").trim();
      var key = normalizeForSignature(name);
      if (!name || seen[key]) continue;
      seen[key] = true;
      creators.push({ name: name });
    }
    return creators;
  }

  function getPublicationTitle(root) {
    var label = root.querySelector(SOURCE_LABEL_SELECTOR);
    var field = label && label.parentElement;
    if (!field) return "";
    var source = field.querySelector('.source-title-display a[href*="/general-summary"], a[href*="/general-summary"]');
    return cleanNodeText(source);
  }

  function extractCandidate(doc, urlValue) {
    if (!isFullRecordURL(urlValue)) return null;
    var root = findDetailRoot(doc);
    if (!root) return null;
    var title = cleanNodeText(root.querySelector(TITLE_SELECTOR));
    if (!title) return null;
    var url = parseURL(urlValue);
    var candidate = {
      itemType: inferItemType(root.querySelector(TYPE_SELECTOR)),
      title: title,
      creators: getCreators(root),
      date: cleanNodeText(root.querySelector(DATE_SELECTOR)),
      publicationTitle: getPublicationTitle(root),
      url: url ? url.href : String(urlValue || ""),
      source: "web-of-science-full-record"
    };
    var doi = cleanNodeText(root.querySelector(DOI_SELECTOR)).replace(/^doi\s*:\s*/i, "");
    if (doi) candidate.DOI = doi;
    return candidate;
  }

  api.extractors.push({
    id: "web-of-science-full-record",
    label: "Web of Science Full Record",
    preferLocal: true,

    detect: function (doc, url) {
      return Boolean(isFullRecordURL(url) && findDetailRoot(doc));
    },

    extract: function (doc, url) {
      var candidate = extractCandidate(doc, url);
      return candidate ? [candidate] : [];
    }
  });
})();
