(function () {
  "use strict";

  var api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.extractors = api.extractors || [];

  var DETAIL_ROOT_SELECTOR = '[data-testid="publication-page-header"]';
  var TITLE_SELECTOR = '[data-testid="publication-titles"]';
  var INFORMATION_SELECTOR = '[data-testid="publication-information-bar"]';
  var TYPE_SELECTOR = '[data-testid="publication-document-type"]';
  var YEAR_SELECTOR = '[data-testid="publication-year"]';
  var AUTHORS_SELECTOR = '[data-testid="authors-list"]';
  var AUTHOR_SELECTOR = '[data-testid="authorItem-button"] button';
  var SOURCE_SELECTOR = '[id="source-preview-flyout"]';

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

  function cleanNodeText(node) {
    if (!node) return "";
    var clone = node.cloneNode(true);
    var noise = clone.querySelectorAll(
      '#zotero-check-badge-host, .zotero-check-search-status, [hidden], [aria-hidden="true"]'
    );
    for (var i = 0; i < noise.length; i++) noise[i].remove();
    return cleanText(clone);
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

  function parseScopusURL(value) {
    try {
      return new URL(value || location.href, location.href);
    } catch (error) {
      return null;
    }
  }

  function isScopusPublicationURL(value) {
    var url = parseScopusURL(value);
    return Boolean(
      url &&
      /(^|\.)scopus\.com$/i.test(url.hostname) &&
      /^\/pages\/publications\/[^/?#]+\/?$/i.test(url.pathname)
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
    if (value.indexOf("conference") !== -1) return "conferencePaper";
    if (value.indexOf("book chapter") !== -1) return "bookSection";
    if (value === "book") return "book";
    if (value.indexOf("article") !== -1 || value.indexOf("review") !== -1 ||
        value.indexOf("editorial") !== -1 || value.indexOf("erratum") !== -1 ||
        value.indexOf("corrigendum") !== -1) {
      return "journalArticle";
    }
    return "document";
  }

  function getCreators(root) {
    var authors = root.querySelector(AUTHORS_SELECTOR);
    if (!authors) return [];
    var buttons = authors.querySelectorAll(AUTHOR_SELECTOR);
    var creators = [];
    var seen = Object.create(null);
    for (var i = 0; i < buttons.length; i++) {
      if (!isVisible(buttons[i])) continue;
      var name = cleanNodeText(buttons[i]).replace(/[,;]+$/g, "").trim();
      var key = normalizeForSignature(name);
      if (!name || /^\+\d+\s+authors?$/i.test(name) || seen[key]) continue;
      seen[key] = true;
      creators.push({ name: name });
    }
    return creators;
  }

  function extractCandidate(doc, urlValue) {
    if (!isScopusPublicationURL(urlValue)) return null;
    var root = findDetailRoot(doc);
    if (!root) return null;

    var titleVariants = splitTitleVariants(cleanNodeText(root.querySelector(TITLE_SELECTOR)));
    if (!titleVariants.title) return null;
    var information = root.querySelector(INFORMATION_SELECTOR);
    var url = parseScopusURL(urlValue);

    var candidate = {
      itemType: inferItemType(information && information.querySelector(TYPE_SELECTOR)),
      title: titleVariants.title,
      creators: getCreators(root),
      date: cleanNodeText(information && information.querySelector(YEAR_SELECTOR)),
      publicationTitle: cleanNodeText(information && information.querySelector(SOURCE_SELECTOR)),
      url: url ? url.href : String(urlValue || ""),
      source: "scopus-publication-details",
      matchPolicy: "scopus-tiered"
    };
    if (titleVariants.alternateTitles.length) {
      candidate.alternateTitles = titleVariants.alternateTitles;
    }
    return candidate;
  }

  api.extractors.push({
    id: "scopus-publication-details",
    label: "Scopus Document Details",
    preferLocal: true,

    detect: function (doc, url) {
      return Boolean(isScopusPublicationURL(url) && findDetailRoot(doc));
    },

    extract: function (doc, url) {
      var candidate = extractCandidate(doc, url);
      return candidate ? [candidate] : [];
    }
  });
})();
