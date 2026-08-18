(function (root, factory) {
  const api = factory();
  root.PLCUIState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PAGE_STATES = Object.freeze({
    SAVED: "saved",
    POSSIBLE_MATCH: "possible_match",
    NOT_SAVED: "not_saved",
    UNRECOGNIZED: "unrecognized",
    NOT_CHECKED: "not_checked",
    UNSUPPORTED: "unsupported",
    ERROR: "error",
    CHECKING: "checking",
    CHOOSE_ITEM: "choose_item"
  });

  const PAGE_MESSAGE_KEYS = Object.freeze({
    [PAGE_STATES.SAVED]: "pageSaved",
    [PAGE_STATES.POSSIBLE_MATCH]: "pagePossibleMatch",
    [PAGE_STATES.NOT_SAVED]: "pageNotSaved",
    [PAGE_STATES.UNRECOGNIZED]: "pageUnrecognized",
    [PAGE_STATES.NOT_CHECKED]: "pageNotChecked",
    [PAGE_STATES.UNSUPPORTED]: "pageUnsupported",
    [PAGE_STATES.ERROR]: "pageError",
    [PAGE_STATES.CHECKING]: "pageChecking",
    [PAGE_STATES.CHOOSE_ITEM]: "pageChooseItem"
  });

  function normalizePageState(value) {
    return Object.values(PAGE_STATES).includes(value) ? value : PAGE_STATES.ERROR;
  }

  function messageKeyForPageState(value) {
    return PAGE_MESSAGE_KEYS[normalizePageState(value)];
  }

  return { PAGE_MESSAGE_KEYS, PAGE_STATES, messageKeyForPageState, normalizePageState };
});
