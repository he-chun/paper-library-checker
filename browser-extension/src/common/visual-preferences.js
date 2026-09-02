(function (root, factory) {
  var api = factory();
  root.PLCVisualPreferences = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var DEFAULT_VISUAL_PREFERENCES = Object.freeze({
    highlightSearchResultRows: true,
    searchResultMatchedBackground: "#ffe7e7",
    searchResultPossibleBackground: "#fff1d6",
    enablePageGlow: false,
    pageEdgeStyle: "glow",
    pageEdgeWidth: 6,
    pageEdgeMatchedColor: "#ff2d2d",
    pageEdgePossibleColor: "#f59e0b",
    pageEdgeMissingColor: "#2563eb",
    pageEdgeUnknownColor: "#eab308",
    pageEdgeErrorColor: "#9333ea"
  });
  var VISUAL_PREFERENCE_KEYS = Object.freeze(Object.keys(DEFAULT_VISUAL_PREFERENCES));
  var PAGE_EDGE_STYLES = Object.freeze(["glow", "solid", "dashed", "dotted", "double"]);
  var COLOR_KEYS = Object.freeze([
    "searchResultMatchedBackground",
    "searchResultPossibleBackground",
    "pageEdgeMatchedColor",
    "pageEdgePossibleColor",
    "pageEdgeMissingColor",
    "pageEdgeUnknownColor",
    "pageEdgeErrorColor"
  ]);

  function normalizeColor(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : fallback;
  }

  function normalizeWidth(value) {
    var numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_VISUAL_PREFERENCES.pageEdgeWidth;
    return Math.min(16, Math.max(1, Math.round(numeric)));
  }

  function normalizeVisualPreferences(value) {
    var input = value && typeof value === "object" ? value : {};
    var normalized = Object.assign({}, DEFAULT_VISUAL_PREFERENCES);
    normalized.highlightSearchResultRows = typeof input.highlightSearchResultRows === "boolean"
      ? input.highlightSearchResultRows
      : DEFAULT_VISUAL_PREFERENCES.highlightSearchResultRows;
    normalized.enablePageGlow = typeof input.enablePageGlow === "boolean"
      ? input.enablePageGlow
      : DEFAULT_VISUAL_PREFERENCES.enablePageGlow;
    normalized.pageEdgeStyle = PAGE_EDGE_STYLES.includes(input.pageEdgeStyle)
      ? input.pageEdgeStyle
      : DEFAULT_VISUAL_PREFERENCES.pageEdgeStyle;
    normalized.pageEdgeWidth = normalizeWidth(input.pageEdgeWidth);
    for (var i = 0; i < COLOR_KEYS.length; i++) {
      var key = COLOR_KEYS[i];
      normalized[key] = normalizeColor(input[key], DEFAULT_VISUAL_PREFERENCES[key]);
    }
    return normalized;
  }

  function colorToRgb(value) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16)
    ].join(", ");
  }

  function applyDocumentVisualPreferences(documentObject, value) {
    var normalized = normalizeVisualPreferences(value);
    var root = documentObject && documentObject.documentElement;
    if (!root) return normalized;
    root.style.setProperty("--plc-search-result-matched-background", normalized.searchResultMatchedBackground);
    root.style.setProperty("--plc-search-result-possible-background", normalized.searchResultPossibleBackground);
    root.dataset.zoteroCheckHighlightSearchResults = String(normalized.highlightSearchResultRows);
    return normalized;
  }

  function stateColor(normalized, state) {
    var colors = {
      matched: normalized.pageEdgeMatchedColor,
      possible: normalized.pageEdgePossibleColor,
      missing: normalized.pageEdgeMissingColor,
      unknown: normalized.pageEdgeUnknownColor,
      error: normalized.pageEdgeErrorColor
    };
    return colors[state] || normalized.pageEdgeUnknownColor;
  }

  function applyEdgeVisualPreferences(host, value, state) {
    var normalized = normalizeVisualPreferences(value);
    if (!host || !host.style) return normalized;
    var colors = {
      matched: normalized.pageEdgeMatchedColor,
      possible: normalized.pageEdgePossibleColor,
      missing: normalized.pageEdgeMissingColor,
      unknown: normalized.pageEdgeUnknownColor,
      error: normalized.pageEdgeErrorColor
    };
    host.style.setProperty("--plc-page-edge-width", normalized.pageEdgeWidth + "px");
    Object.keys(colors).forEach(function (name) {
      host.style.setProperty("--plc-page-edge-" + name + "-color", colors[name]);
      host.style.setProperty("--plc-page-edge-" + name + "-rgb", colorToRgb(colors[name]));
    });

    var edge = host.shadowRoot && host.shadowRoot.querySelector(".zotero-check-edge-glow");
    if (!edge) return normalized;
    var nextState = state || edge.dataset.state || "unknown";
    edge.dataset.style = normalized.pageEdgeStyle;
    edge.style.setProperty("--plc-page-edge-active-color", stateColor(normalized, nextState));
    edge.style.setProperty("--plc-page-edge-active-rgb", colorToRgb(stateColor(normalized, nextState)));
    if (!normalized.enablePageGlow) {
      edge.hidden = true;
      edge.dataset.state = "disabled";
    } else {
      edge.hidden = false;
      edge.dataset.state = nextState === "disabled" ? "unknown" : nextState;
    }
    return normalized;
  }

  function clearSearchResultVisualState(documentObject) {
    if (!documentObject || typeof documentObject.querySelectorAll !== "function") return;
    var rows = documentObject.querySelectorAll(".zotero-check-search-result-row");
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove("zotero-check-search-result-row");
      rows[i].removeAttribute("data-zotero-check-state");
      rows[i].removeAttribute("data-zotero-check-result-state");
    }
  }

  return {
    DEFAULT_VISUAL_PREFERENCES: DEFAULT_VISUAL_PREFERENCES,
    VISUAL_PREFERENCE_KEYS: VISUAL_PREFERENCE_KEYS,
    PAGE_EDGE_STYLES: PAGE_EDGE_STYLES,
    normalizeVisualPreferences: normalizeVisualPreferences,
    applyDocumentVisualPreferences: applyDocumentVisualPreferences,
    applyEdgeVisualPreferences: applyEdgeVisualPreferences,
    clearSearchResultVisualState: clearSearchResultVisualState
  };
});
