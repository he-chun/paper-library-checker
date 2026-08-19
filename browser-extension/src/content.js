(function () {
  const api = window.ZoteroCheck;
  const i18n = window.PLCI18n;
  const uiState = window.PLCUIState;
  const senderSecurity = window.PLCSenderSecurity;
  const SKIPPED_HOSTS = new Set([
    "chatgpt.com",
    "chat.openai.com",
    "openai.com",
    "platform.openai.com"
  ]);
  const CURATED_DETAIL_HOSTS = [
    "cnki.net",
    "doi.org",
    "sciencedirect.com",
    "springer.com",
    "wiley.com",
    "pubmed.ncbi.nlm.nih.gov",
    "arxiv.org",
    "ieee.org",
    "acm.org",
    "tandfonline.com",
    "mdpi.com"
  ];
  const BROAD_SCHOLARLY_HOST_HINTS = [
    "nature.com",
    "science.org",
    "cell.com",
    "plos.org",
    "frontiersin.org",
    "biorxiv.org",
    "medrxiv.org",
    "ssrn.com",
    "sagepub.com",
    "oup.com",
    "cambridge.org"
  ];
  const MAX_DYNAMIC_CHECKS = 10;
  const BATCH_LIMIT = 80;
  const RETRY_DELAY_MS = 5000;
  const FOREGROUND_CHECK_DEBOUNCE_MS = 1000;
  let checkCount = 0;
  let lastSuccessfulCandidateKey = "";
  let lastSuccessfulBatchKey = "";
  let detailTimer = null;
  let batchTimer = null;
  let detailRetryTimer = null;
  let batchRetryTimer = null;
  let forceNextDetailCheck = false;
  let forceNextBatchCheck = false;
  let lastForegroundCheckAt = 0;
  let detailRunSerial = 0;
  let batchRunSerial = 0;
  let observerDebounceTimer = null;
  let observerCheckPending = false;

  if (SKIPPED_HOSTS.has(location.hostname) || location.hostname.endsWith(".openai.com")) {
    return;
  }

  var _options = {
    enablePageGlow: false,
    autoCheckReferenceLists: false,
    translationServerMode: "auto",
    broadPageDetection: false
  };
  var _batchUserInitiated = false;
  const pageController = window.PLCPageController.createPageController({
    onManualCheck: function () {
      lastSuccessfulCandidateKey = "";
      lastSuccessfulBatchKey = "";
      setBadge("unknown", i18n.t("badgeChecking"), "", uiState.PAGE_STATES.CHECKING);
      scheduleDetailCheck({ force: true });
      scheduleManualBatchCheck();
    }
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!senderSecurity.isTrustedExtensionPageSender(sender, chrome.runtime)) return false;
    if (message?.type === "zotero-check:get-page-state") {
      sendResponse({ ok: true, pageState: pageController.getState() });
      return false;
    }
    if (message?.type === "zotero-check:manual-page-check") {
      sendResponse({ ok: true, pageState: pageController.manualCheck() });
      return false;
    }
    return false;
  });

  chrome.storage.sync.get(_options, function (loaded) {
    Object.assign(_options, loaded);
    if (_options.autoCheckReferenceLists) {
      setupIntersectionObserver();
    }
    if (!isCuratedKnownHost() && _options.broadPageDetection && shouldRunDetailDetection()) {
      scheduleDetailCheck({ force: true });
    }
  });

  function findAnchorElement() {
    return (
      document.querySelector(".wx-tit-scholar .h1-scholar") ||
      document.querySelector(".wx-tit h1") ||
      document.querySelector(".h1-scholar") ||
      document.querySelector('meta[name="citation_title"]')?.closest("head") ||
      document.querySelector("h1") ||
      document.body
    );
  }

  function ensureBadge() {
    let host = document.querySelector("#zotero-check-badge-host");
    if (host?.shadowRoot) {
      return host.shadowRoot.querySelector(".zotero-check-badge");
    }

    const anchor = findAnchorElement();
    host = document.createElement(anchor === document.body || anchor.tagName === "HEAD" ? "div" : "span");
    host.id = "zotero-check-badge-host";
    if (anchor === document.body || anchor.tagName === "HEAD") {
      host.style.position = "fixed";
      host.style.right = "16px";
      host.style.bottom = "16px";
      host.style.zIndex = "2147483647";
      document.body.appendChild(host);
    } else {
      host.style.display = "inline-block";
      host.style.verticalAlign = "middle";
      anchor.appendChild(host);
    }

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .zotero-check-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 10px;
        padding: 3px 8px;
        border-radius: 6px;
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        vertical-align: middle;
        border: 1px solid transparent;
        box-sizing: border-box;
        white-space: nowrap;
      }
      .zotero-check-badge[data-state="matched"] {
        color: #8b1d1d;
        background: #ffe7e7;
        border-color: #ffb8b8;
      }
      .zotero-check-badge[data-state="possible"] {
        color: #744100;
        background: #fff1d6;
        border-color: #f4c36c;
      }
      .zotero-check-badge[data-state="missing"] {
        color: #164b86;
        background: #e7f1ff;
        border-color: #b9d7ff;
      }
      .zotero-check-badge[data-state="unknown"] {
        color: #5c4a12;
        background: #fff5d6;
        border-color: #efd582;
      }
      .zotero-check-badge[data-state="error"] {
        color: #6d1f6d;
        background: #fae8ff;
        border-color: #e9b8f5;
      }
      .zotero-check-float-btn {
        position: fixed;
        right: 16px;
        bottom: 80px;
        z-index: 2147483646;
        width: 36px;
        height: 36px;
        border: 1px solid #d0d5dd;
        border-radius: 50%;
        background: #fff;
        color: #475467;
        font: 18px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: grab;
        box-shadow: 0 2px 8px rgba(16, 24, 40, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        user-select: none;
        transition: box-shadow 150ms ease, border-color 150ms ease;
      }
      .zotero-check-float-btn:hover {
        box-shadow: 0 4px 14px rgba(16, 24, 40, 0.2);
        border-color: #98a2b3;
      }
      .zotero-check-float-btn:active {
        cursor: grabbing;
      }
      .zotero-check-float-btn.dragging {
        cursor: grabbing;
        box-shadow: 0 6px 20px rgba(16, 24, 40, 0.28);
        border-color: #6b7280;
      }
      .zotero-check-choices {
        display: none;
        margin-top: 8px;
        width: min(360px, calc(100vw - 32px));
        padding: 8px;
        border: 1px solid #d0d5dd;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(16, 24, 40, 0.14);
        font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #101828;
      }
      .zotero-check-choices[data-open="true"] {
        display: block;
      }
      .zotero-check-choice-title {
        margin: 0 0 6px;
        font-weight: 600;
      }
      .zotero-check-choice {
        display: block;
        width: 100%;
        margin: 4px 0;
        padding: 6px 8px;
        border: 1px solid #eaecf0;
        border-radius: 4px;
        background: #f9fafb;
        color: #175cd3;
        text-align: left;
        cursor: pointer;
        font: inherit;
      }
      .zotero-check-choice:hover {
        background: #eef4ff;
        border-color: #b2ccff;
      }
      .zotero-check-edge-glow {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
        box-sizing: border-box;
        border: 6px solid transparent;
        opacity: 0;
        transition: opacity 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        contain: strict;
      }
      .zotero-check-edge-glow[hidden],
      .zotero-check-edge-glow[data-state="disabled"] {
        display: none !important;
      }
      .zotero-check-edge-glow[data-state="matched"] {
        opacity: 1;
        border-color: rgba(255, 45, 45, 0.92);
        box-shadow:
          inset 0 0 24px rgba(255, 45, 45, 0.95),
          inset 0 0 72px rgba(255, 45, 45, 0.55),
          0 0 28px rgba(255, 45, 45, 0.85);
        animation: zotero-check-glow-pulse-red 1.8s ease-in-out infinite;
      }
      .zotero-check-edge-glow[data-state="missing"] {
        opacity: 1;
        border-color: rgba(37, 99, 235, 0.92);
        box-shadow:
          inset 0 0 24px rgba(37, 99, 235, 0.95),
          inset 0 0 72px rgba(37, 99, 235, 0.52),
          0 0 28px rgba(37, 99, 235, 0.78);
        animation: zotero-check-glow-pulse-blue 1.8s ease-in-out infinite;
      }
      .zotero-check-edge-glow[data-state="possible"] {
        opacity: 1;
        border-color: rgba(245, 158, 11, 0.95);
        box-shadow:
          inset 0 0 22px rgba(245, 158, 11, 0.9),
          inset 0 0 64px rgba(245, 158, 11, 0.45),
          0 0 24px rgba(245, 158, 11, 0.72);
      }
      .zotero-check-edge-glow[data-state="unknown"] {
        opacity: 0.72;
        border-color: rgba(234, 179, 8, 0.78);
        box-shadow:
          inset 0 0 18px rgba(234, 179, 8, 0.7),
          inset 0 0 48px rgba(234, 179, 8, 0.34),
          0 0 18px rgba(234, 179, 8, 0.45);
      }
      .zotero-check-edge-glow[data-state="error"] {
        opacity: 0.85;
        border-color: rgba(147, 51, 234, 0.86);
        box-shadow:
          inset 0 0 20px rgba(147, 51, 234, 0.75),
          inset 0 0 56px rgba(147, 51, 234, 0.36),
          0 0 20px rgba(147, 51, 234, 0.55);
      }
      @keyframes zotero-check-glow-pulse-red {
        0%, 100% { box-shadow: inset 0 0 22px rgba(255, 45, 45, 0.9), inset 0 0 64px rgba(255, 45, 45, 0.48), 0 0 22px rgba(255, 45, 45, 0.72); }
        50% { box-shadow: inset 0 0 34px rgba(255, 45, 45, 1), inset 0 0 92px rgba(255, 45, 45, 0.72), 0 0 38px rgba(255, 45, 45, 0.92); }
      }
      @keyframes zotero-check-glow-pulse-blue {
        0%, 100% { box-shadow: inset 0 0 22px rgba(37, 99, 235, 0.88), inset 0 0 64px rgba(37, 99, 235, 0.46), 0 0 22px rgba(37, 99, 235, 0.65); }
        50% { box-shadow: inset 0 0 34px rgba(37, 99, 235, 1), inset 0 0 92px rgba(37, 99, 235, 0.68), 0 0 38px rgba(37, 99, 235, 0.86); }
      }
      @media (prefers-reduced-motion: reduce) {
        .zotero-check-edge-glow {
          animation: none !important;
        }
      }
    `;
    const wrapper = document.createElement("div");
    const edgeGlow = document.createElement("div");
    edgeGlow.className = "zotero-check-edge-glow";
    edgeGlow.dataset.state = "disabled";
    edgeGlow.hidden = true;
    edgeGlow.setAttribute("aria-hidden", "true");
    const badge = document.createElement("span");
    badge.className = "zotero-check-badge";
    badge.dataset.state = "unknown";
    const label = document.createElement("span");
    label.className = "zotero-check-label";
    label.textContent = i18n.t("badgeChecking");
    badge.appendChild(label);
    const choices = document.createElement("div");
    choices.className = "zotero-check-choices";
    wrapper.append(edgeGlow, badge, choices);
    shadow.append(style, wrapper);

    const floatBtn = document.createElement("button");
    floatBtn.className = "zotero-check-float-btn";
    floatBtn.textContent = "↻";
    floatBtn.title = i18n.t("recheckTooltip");
    floatBtn.setAttribute("aria-label", i18n.t("recheckAriaLabel"));
    let floatDragging = false;
    let floatStartX = 0;
    let floatStartY = 0;
    let floatStartLeft = 0;
    let floatStartTop = 0;
    let floatMoved = false;

    floatBtn.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      floatDragging = true;
      floatMoved = false;
      const rect = floatBtn.getBoundingClientRect();
      floatStartX = event.clientX;
      floatStartY = event.clientY;
      floatStartLeft = rect.left;
      floatStartTop = rect.top;
      floatBtn.classList.add("dragging");
      floatBtn.style.right = "auto";
      floatBtn.style.bottom = "auto";
      floatBtn.style.left = `${floatStartLeft}px`;
      floatBtn.style.top = `${floatStartTop}px`;
    });

    document.addEventListener("mousemove", (event) => {
      if (!floatDragging) {
        return;
      }
      const dx = event.clientX - floatStartX;
      const dy = event.clientY - floatStartY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        floatMoved = true;
      }
      floatBtn.style.left = `${floatStartLeft + dx}px`;
      floatBtn.style.top = `${floatStartTop + dy}px`;
    });

    document.addEventListener("mouseup", () => {
      if (!floatDragging) {
        return;
      }
      floatDragging = false;
      floatBtn.classList.remove("dragging");
    });

    floatBtn.addEventListener("click", (event) => {
      if (floatMoved) {
        event.stopPropagation();
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      pageController.manualCheck();
    });

    shadow.appendChild(floatBtn);
    return badge;
  }

  function setPageGlowState(state) {
    const host = document.querySelector("#zotero-check-badge-host");
    const edgeGlow = host?.shadowRoot?.querySelector(".zotero-check-edge-glow");
    if (!edgeGlow) return;

    if (!_options.enablePageGlow) {
      edgeGlow.hidden = true;
      edgeGlow.dataset.state = "disabled";
      return;
    }

    edgeGlow.hidden = false;
    edgeGlow.dataset.state = state;
  }

  function setBadge(state, text, title = "", pageState) {
    const badge = ensureBadge();
    clearChoices();
    badge.dataset.state = state;
    const label = badge.querySelector(".zotero-check-label");
    if (label) {
      label.textContent = text;
    }
    setPageGlowState(state);
    if (title) {
      badge.title = title;
    } else {
      badge.removeAttribute("title");
    }
    if (pageState) pageController.setState(pageState);
  }

  function clearChoices() {
    const choices = getChoicesElement();
    if (choices) {
      choices.dataset.open = "false";
      choices.textContent = "";
    }
  }

  function getChoicesElement() {
    const host = document.querySelector("#zotero-check-badge-host");
    return host?.shadowRoot?.querySelector(".zotero-check-choices") || null;
  }

  function sendMatch(candidates) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        Array.isArray(candidates)
          ? { type: "zotero-check:match", candidates }
          : { type: "zotero-check:match", candidate: candidates },
        (response) => resolve(response)
      );
    });
  }

  function pickBestResult(result) {
    if (!Array.isArray(result?.results)) {
      return result;
    }
    return result.results.find((candidateResult) => candidateResult.status === "matched") ||
      result.results.find((candidateResult) => candidateResult.status === "possible_match") ||
      result.results[0];
  }

  async function detectMetadata(doc, url) {
    // If page has citation_doi and mode is not "always", skip translation-server
    if (_options.translationServerMode !== "always") {
      var hasDOI = doc.querySelector('meta[name="citation_doi"]');
      if (hasDOI) {
        var localExtraction = api.detectAndExtract(doc, url);
        return localExtraction;
      }
    }

    try {
      const translated = await sendTranslateUrl(url);
      if (translated?.type === "items" && translated.items.length) {
        return {
          metadataSource: "translation-server",
          detected: [{ id: "translation-server", label: "Zotero translation-server" }],
          candidates: api.uniqueCandidates(translated.items)
        };
      }
      if (translated?.type === "multiple") {
        return {
          metadataSource: "translation-server",
          detected: [{ id: "translation-server", label: "Zotero translation-server" }],
          candidates: [],
          choices: translated.choices
        };
      }
    } catch (error) {}

    var extraction = api.detectAndExtract(doc, url);
    return extraction;
  }

  function sendTranslateUrl(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "zotero-check:translate-url", url },
        (response) => {
          if (response && response.ok) {
            resolve(response.result);
            return;
          }
          reject(response?.details || response?.error || "translation_server_unavailable");
        }
      );
    });
  }

  async function runDetailCheck() {
    if (!shouldRunDetailDetection()) {
      return;
    }
    const runSerial = ++detailRunSerial;
    const force = forceNextDetailCheck;
    forceNextDetailCheck = false;
    checkCount += 1;
    const extraction = await detectMetadata(document, location.href);
    if (runSerial !== detailRunSerial) {
      return;
    }
    if (!extraction.candidates.length) {
      if (force || (checkCount === 1 && isLikelyAcademicPage())) {
        if (extraction.choices?.length) {
          setBadge(
            "unknown",
            i18n.t("badgeChooseItem"),
            i18n.t("translationChoicesDescription"),
            uiState.PAGE_STATES.CHOOSE_ITEM
          );
          renderTranslationChoices(extraction.choices);
        } else {
          setBadge(
            "unknown",
            i18n.t("badgeUnrecognized"),
            i18n.t("unsupportedMetadataDescription"),
            uiState.PAGE_STATES.UNRECOGNIZED
          );
        }
      }
      return;
    }

    const candidateKey = extraction.candidates
      .map((candidate) => `${candidate.DOI || ""}|${candidate.PMID || ""}|${api.normalizeTitle(candidate.title)}`)
      .join(";");
    if (!force && candidateKey === lastSuccessfulCandidateKey && document.querySelector("#zotero-check-badge-host")) {
      return;
    }

    setBadge(
      "unknown",
      i18n.t("badgeCheckingSource", extraction.metadataSource),
      "",
      uiState.PAGE_STATES.CHECKING
    );

    const response = await sendMatch(extraction.candidates);
    if (runSerial !== detailRunSerial) {
      return;
    }
    if (!response || !response.ok) {
      setBadge(
        "error",
        i18n.t("badgeOffline"),
        response?.error || i18n.t("addonConnectionError"),
        uiState.PAGE_STATES.ERROR
      );
      scheduleDetailRetry();
      return;
    }

    clearTimeout(detailRetryTimer);
    lastSuccessfulCandidateKey = candidateKey;
    const result = pickBestResult(response.result);
    applyDetailResult(result, extraction.metadataSource);
  }

  function isPositiveResult(result) {
    return result && (result.status === "matched" || result.status === "possible_match");
  }

  function renderTranslationChoices(choices) {
    ensureBadge();
    const choicesElement = getChoicesElement();
    if (!choicesElement) {
      return;
    }
    choicesElement.textContent = "";
    choicesElement.dataset.open = "true";

    const title = document.createElement("p");
    title.className = "zotero-check-choice-title";
    title.textContent = i18n.t("translationChoicesTitle");
    choicesElement.appendChild(title);

    choices.slice(0, 8).forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "zotero-check-choice";
      button.textContent = getChoiceLabel(choice);
      button.addEventListener("click", () => checkSelectedTranslationChoice(choice));
      choicesElement.appendChild(button);
    });
  }

  function getChoiceLabel(choice) {
    const creators = Array.isArray(choice.creators)
      ? choice.creators.map((creator) => creator.name || creator.lastName || "").filter(Boolean).slice(0, 2).join(", ")
      : "";
    return [choice.choiceLabel || choice.title || i18n.t("untitled"), choice.date, creators]
      .filter(Boolean)
      .join(" - ");
  }

  async function checkSelectedTranslationChoice(choice) {
    clearChoices();
    const candidate = {
      ...choice,
      metadataSource: "translation-server"
    };
    setBadge("unknown", i18n.t("badgeCheckingSource", "translation-server"), "", uiState.PAGE_STATES.CHECKING);
    const response = await sendMatch(candidate);
    if (!response || !response.ok) {
      setBadge(
        "error",
        i18n.t("badgeOffline"),
        response?.error || i18n.t("addonConnectionError"),
        uiState.PAGE_STATES.ERROR
      );
      scheduleDetailRetry();
      return;
    }
    clearTimeout(detailRetryTimer);
    lastSuccessfulCandidateKey = `${candidate.DOI || ""}|${candidate.PMID || ""}|${api.normalizeTitle(candidate.title)}`;
    applyDetailResult(pickBestResult(response.result), "translation-server");
  }

  function applyDetailResult(result, metadataSource) {
    if (result && result.status === "error") {
      setBadge(
        "error",
        i18n.t("badgeIndexing"),
        result.error || i18n.t("localIndexNotReady"),
        uiState.PAGE_STATES.ERROR
      );
      scheduleDetailRetry();
      return;
    }
    if (isPositiveResult(result)) {
      setBadge(
        result.status === "possible_match" ? "possible" : "matched",
        i18n.t(result.status === "possible_match" ? "badgePossibleMatch" : "badgeSaved"),
        `metadataSource: ${metadataSource}`,
        result.status === "possible_match" ? uiState.PAGE_STATES.POSSIBLE_MATCH : uiState.PAGE_STATES.SAVED
      );
      return;
    }
    setBadge(
      "missing",
      i18n.t("badgeNotSaved"),
      `metadataSource: ${metadataSource}\n${result?.reason || result?.error || i18n.t("noMatchingItem")}`,
      uiState.PAGE_STATES.NOT_SAVED
    );
  }

  function scheduleDetailCheck(options = {}) {
    if (options.force) {
      forceNextDetailCheck = true;
    }
    clearTimeout(detailTimer);
    detailTimer = setTimeout(runDetailCheck, options.delay ?? 350);
  }

  function scheduleDetailRetry() {
    clearTimeout(detailRetryTimer);
    detailRetryTimer = setTimeout(() => {
      lastSuccessfulCandidateKey = "";
      scheduleDetailCheck();
    }, RETRY_DELAY_MS);
  }

  function scheduleBatchCheck(options = {}) {
    if (!isCNKIPage() && !getSiteAdapter()) {
      return;
    }
    if (options.force) {
      forceNextBatchCheck = true;
    }
    clearTimeout(batchTimer);
    batchTimer = setTimeout(runBatchCheck, options.delay ?? 550);
  }

  function scheduleManualBatchCheck() {
    _batchUserInitiated = true;
    scheduleBatchCheck({ force: true });
  }

  function scheduleIdleBatchCheck(options) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(function () {
        scheduleBatchCheck(options);
      }, { timeout: 3000 });
    } else {
      setTimeout(function () {
        scheduleBatchCheck(options);
      }, 1200);
    }
  }

  async function runBatchCheck() {
    const runSerial = ++batchRunSerial;
    const force = forceNextBatchCheck;
    forceNextBatchCheck = false;
    const userInitiated = _batchUserInitiated;
    _batchUserInitiated = false;

    // Gate: only auto-check when enabled; user-initiated always passes
    if (!_options.autoCheckReferenceLists && !userInitiated) {
      return;
    }

    const adapter = getSiteAdapter();
    let targets;
    var signature;

    if (adapter) {
      // Compute fast signature before expensive collectBatchTargets
      if (!force && typeof adapter.getBatchSignature === "function") {
        signature = adapter.getBatchSignature();
        if (signature && signature === lastSuccessfulBatchKey) {
          return;
        }
      }
      targets = adapter.collectBatchTargets().slice(0, BATCH_LIMIT);
    } else {
      targets = collectCNKITargets().slice(0, BATCH_LIMIT);
    }

    if (!targets.length) {
      return;
    }

    var batchKey = targets.map(function (t) { return t.sourceId || t.key; }).join(";");
    if (!force && signature) {
      // Use the pre-computed signature if available
      batchKey = signature;
    }
    if (!force && batchKey === lastSuccessfulBatchKey) {
      return;
    }

    if (!adapter) {
      targets.forEach(function (target) { applyTargetState(target, "checking"); });
    }

    const response = await sendMatch(targets.map(function (target) { return target.candidate; }));
    if (runSerial !== batchRunSerial) {
      return;
    }
    if (!response || !response.ok || !Array.isArray(response.result?.results)) {
      if (adapter) {
        adapter.applyBatchResults(
          targets.map(function (t) {
            return { sourceId: t.sourceId, status: "error", error: response?.error || i18n.t("checkerOffline") };
          })
        );
      } else {
        targets.forEach(function (target) { applyTargetState(target, "error", response?.error || i18n.t("checkerOffline")); });
      }
      scheduleBatchRetry();
      return;
    }

    clearTimeout(batchRetryTimer);
    lastSuccessfulBatchKey = batchKey;

    if (adapter) {
      var results = response.result.results.map(function (r, i) {
        var t = targets[i];
        return Object.assign({}, r, { sourceId: t ? t.sourceId : "" });
      });
      adapter.applyBatchResults(results);
    } else {
      response.result.results.forEach(function (result, index) {
        const target = targets[index];
        if (target) {
          applyTargetResult(target, result);
        }
      });
    }
  }

  function scheduleBatchRetry() {
    clearTimeout(batchRetryTimer);
    batchRetryTimer = setTimeout(() => {
      lastSuccessfulBatchKey = "";
      scheduleBatchCheck();
    }, RETRY_DELAY_MS);
  }

  function collectCNKITargets() {
    const anchors = new Set();
    const selectors = [
      '#literature-recommend a[href]',
      '#kcms-data-similar a[href]',
      '#kcms-data-reader-recommend a[href]',
      '#kcms-related-fund-literature a[href]',
      '#div-literatureRef a[href]',
      '#quoted-references a[href]',
      '#quoted-citations a[href]',
      '#quoted-coreferences a[href]',
      '#quoted-cocitations a[href]',
      '#quoted-secondreferences a[href]',
      '#quoted-secondcitations a[href]',
      '#refpartdiv a[href]',
      '.essayBox a[href]',
      '.result-table-list a[href]',
      '.result-list a[href]',
      '.name a[href]',
      'a.fz14[href]',
      'a[href*="/kcms2/article/abstract"]',
      'a[href*="/kcms/detail/detail.aspx"]'
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((anchor) => {
        if (isCandidateAnchor(anchor)) {
          anchors.add(anchor);
        }
      });
    });

    return [...anchors].map((anchor) => makeTarget(anchor)).filter(Boolean);
  }

  function isCandidateAnchor(anchor) {
    const href = anchor.getAttribute("href") || "";
    if (!href || href.startsWith("javascript:")) {
      return false;
    }
    if (!isCNKIArticleURL(href)) {
      return false;
    }
    const title = getAnchorTitle(anchor);
    return title.length >= 4 && !anchor.closest(".zotero-check-badge");
  }

  function makeTarget(anchor) {
    const title = getAnchorTitle(anchor);
    if (!title) {
      return null;
    }
    const url = new URL(anchor.getAttribute("href"), location.href).href;
    const candidate = {
      itemType: "journalArticle",
      title,
      url,
      source: "cnki-list"
    };
    return {
      anchor,
      key: `${api.normalizeTitle(title)}|${url}`,
      candidate
    };
  }

  function getAnchorTitle(anchor) {
    const titleNode = anchor.querySelector(".title[title], [data-title]");
    return String(
      anchor.dataset.zoteroCheckOriginalTitle ||
        anchor.getAttribute("title") ||
        titleNode?.getAttribute("title") ||
        titleNode?.getAttribute("data-title") ||
        anchor.textContent ||
        ""
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function isCNKIArticleURL(href) {
    try {
      const url = new URL(href, location.href);
      return /(?:^|\.)cnki\.net$/i.test(url.hostname) &&
        /\/kcms(?:2)?\/(?:article\/abstract|detail\/detail\.aspx|detail)/i.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function applyTargetResult(target, result) {
    if (!result) {
      applyTargetState(target, "missing", i18n.t("noResultReturned"));
      return;
    }
    if (result.status === "matched") {
      applyTargetState(target, "matched", i18n.t("savedInLibrary"));
      return;
    }
    if (result.status === "possible_match") {
      applyTargetState(target, "possible", i18n.t("possibleInLibrary"));
      return;
    }
    if (result.status === "error") {
      applyTargetState(target, "error", result.error || result.reason || i18n.t("checkerError"));
      return;
    }
    applyTargetState(target, "missing", result.reason || i18n.t("noMatchingItem"));
  }

  function applyTargetState(target, state, title = "") {
    const row = target.anchor.closest("li, tr, .essayBox, .result, .result-item, .doc-item");
    if (!target.anchor.dataset.zoteroCheckOriginalTitle) {
      target.anchor.dataset.zoteroCheckOriginalTitle = getAnchorTitle(target.anchor);
    }
    target.anchor.dataset.zoteroCheckState = state;
    target.anchor.classList.add("zotero-check-link");
    if (row) {
      row.dataset.zoteroCheckState = state;
    }
    if (title) {
      target.anchor.setAttribute("title", title);
    }
  }

  function isLikelyAcademicPage() {
    return isCNKIPage() ||
      Boolean(document.querySelector('meta[name^="citation_"], meta[name^="DC."], .Z3988[title]'));
  }

  function hostnameMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith("." + domain);
  }

  function isCuratedKnownHost() {
    var hostname = location.hostname.toLowerCase();
    return CURATED_DETAIL_HOSTS.some(function (domain) {
      return hostnameMatches(hostname, domain);
    });
  }

  function hasEmbeddedArticleMetadata() {
    return Boolean(
      document.querySelector(
        'meta[name^="citation_"], meta[name^="DC."], .Z3988[title], script[type="application/ld+json"]'
      )
    );
  }

  function hasBroadPageHint() {
    var hostname = location.hostname.toLowerCase();
    var urlText = (location.hostname + " " + location.pathname + " " + location.search).toLowerCase();
    return /doi|pubmed|arxiv|article|journal/.test(urlText) ||
      BROAD_SCHOLARLY_HOST_HINTS.some(function (domain) {
        return hostnameMatches(hostname, domain);
      });
  }

  function hasBroadDetailPrefilter() {
    return hasEmbeddedArticleMetadata() || hasBroadPageHint();
  }

  function shouldRunDetailDetection() {
    if (isCuratedKnownHost()) {
      return true;
    }
    if (!_options.broadPageDetection) {
      return false;
    }
    return hasBroadDetailPrefilter();
  }

  function isCNKIPage() {
    return /(^|\.)cnki\.net$/i.test(location.hostname);
  }

  function getSiteAdapter() {
    var adapters = window.ZoteroCheck && window.ZoteroCheck.siteAdapters;
    if (!adapters) return null;
    var keys = Object.keys(adapters);
    for (var i = 0; i < keys.length; i++) {
      var a = adapters[keys[i]];
      if (a && a.detect && a.detect()) return a;
    }
    return null;
  }

  function getCNKIListSignature() {
    var targets = collectCNKITargets();
    if (!targets.length) {
      return "";
    }
    return targets.map(function (t) { return t.key; }).sort().join("|");
  }

  function setupCNKIDynamicListWatcher() {
    if (!isCNKIPage()) {
      return;
    }

    var CONTAINER_IDS = [
      "quoted-references",
      "quoted-citations",
      "quoted-coreferences",
      "quoted-cocitations",
      "quoted-secondreferences",
      "quoted-secondcitations",
      "kcms-data-similar",
      "kcms-data-reader-recommend",
      "kcms-related-fund-literature",
      "kcms-study-period-results"
    ];

    var lastListSignature = "";
    var containerWatchers = [];
    var bodyFallbackObserver = null;
    var bodyFallbackActive = false;

    function triggerBatchIfChanged() {
      if (!_options.autoCheckReferenceLists) {
        return;
      }
      var sig = getCNKIListSignature();
      if (!sig || sig === lastListSignature) {
        return;
      }
      lastListSignature = sig;
      lastSuccessfulBatchKey = "";
      forceNextBatchCheck = true;
      scheduleIdleBatchCheck({ force: true });
    }

    function isInsideBadge(node) {
      try {
        return !!(node && node.closest && node.closest("#zotero-check-badge-host"));
      } catch (e) {
        return false;
      }
    }

    function attachContainerObserver(container) {
      for (var i = 0; i < containerWatchers.length; i++) {
        if (containerWatchers[i].container === container) {
          return;
        }
      }

      var mo = new MutationObserver(function (mutations) {
        for (var j = 0; j < mutations.length; j++) {
          if (!isInsideBadge(mutations[j].target)) {
            triggerBatchIfChanged();
            return;
          }
        }
      });

      mo.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
      });

      containerWatchers.push({ container: container, observer: mo });
    }

    function discoverContainers() {
      var found = false;
      for (var k = 0; k < CONTAINER_IDS.length; k++) {
        var container = document.getElementById(CONTAINER_IDS[k]);
        if (container) {
          found = true;
          attachContainerObserver(container);
        }
      }
      return found;
    }

    // Initial discovery — try after a short delay for AJAX to load
    setTimeout(function () {
      if (!discoverContainers()) {
        bodyFallbackActive = true;
        bodyFallbackObserver = new MutationObserver(function () {
          if (discoverContainers()) {
            triggerBatchIfChanged();
          }
        });
        bodyFallbackObserver.observe(document.body, {
          childList: true,
          subtree: true
        });
      } else {
        triggerBatchIfChanged();
      }
    }, 800);

    // Pagination click catch-all
    document.addEventListener("click", function (event) {
      if (!isPaginationLike(event)) {
        return;
      }
      if (!_options.autoCheckReferenceLists) {
        return;
      }
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(function () { triggerBatchIfChanged(); }, { timeout: 3000 });
      } else {
        setTimeout(function () { triggerBatchIfChanged(); }, 500);
        setTimeout(function () { triggerBatchIfChanged(); }, 1200);
        setTimeout(function () { triggerBatchIfChanged(); }, 2500);
      }
    }, true);
  }

  function isPaginationLike(event) {
    var target = event.target;
    if (!target) {
      return false;
    }
    var text = (target.textContent || "").replace(/\s+/g, "");

    // Chinese pagination text
    if (/^(下一页|上一页|首页|尾页|末页|上页|下页|跳转|转到|确定)$/.test(text)) {
      return true;
    }
    // English pagination text
    if (/^(Next|Prev|Previous|First|Last)$/i.test(text)) {
      return true;
    }
    // Arrow symbols often used for pagination
    if (/^[»«›‹▶◀▲▼]$/.test(text) || /^(>>|<<|>$|<$)$/.test(text)) {
      return true;
    }
    // Bare page number inside a pager container
    if (/^\d+$/.test(text)) {
      var pager = target.closest('.pager, .pagination, #paginate, .pagebar, .turn_page, [class*="paging"], [class*="page-list"], .countPage, #cpPage, .TurnPage, .sabrosus, #pe100_page_有') ||
                  target.closest('[id*="page"], [class*="page"], [id*="pager"], [class*="pager"], [id*="paging"], [class*="paging"]');
      if (pager && !target.closest('input, textarea, select')) {
        return true;
      }
    }
    return false;
  }

  function getBadgeState() {
    const host = document.querySelector("#zotero-check-badge-host");
    const badge = host?.shadowRoot?.querySelector(".zotero-check-badge");
    return badge ? badge.dataset.state : null;
  }

  function scheduleForegroundCheck() {
    if (document.visibilityState && document.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();
    if (now - lastForegroundCheckAt < FOREGROUND_CHECK_DEBOUNCE_MS) {
      return;
    }
    lastForegroundCheckAt = now;

    const currentState = getBadgeState();
    if (currentState === "matched") {
      return;
    }

    scheduleDetailCheck({ force: true, delay: 120 });
    if (_options.autoCheckReferenceLists) {
      scheduleBatchCheck({ force: true, delay: 250 });
    }
  }

  setupCNKIDynamicListWatcher();

  scheduleDetailCheck();
  if (_options.autoCheckReferenceLists) {
    scheduleBatchCheck();
  }

  const observer = new MutationObserver(function () {
    if (observerCheckPending) {
      return;
    }
    observerCheckPending = true;
    clearTimeout(observerDebounceTimer);
    observerDebounceTimer = setTimeout(function () {
      observerCheckPending = false;
      if (checkCount >= MAX_DYNAMIC_CHECKS) {
        observer.disconnect();
        return;
      }
      scheduleDetailCheck();

      // Only schedule batch check if signature changed (and autoCheck enabled)
      if (!_options.autoCheckReferenceLists) return;
      var adapter = getSiteAdapter();
      var sig = "";
      if (adapter && typeof adapter.getBatchSignature === "function") {
        sig = adapter.getBatchSignature();
      } else if (isCNKIPage()) {
        sig = getCNKIListSignature();
      }
      if (sig && sig !== lastSuccessfulBatchKey) {
        scheduleIdleBatchCheck({ force: true });
      }
    }, 200);
  });
  if (isLikelyAcademicPage()) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { observer.disconnect(); }, 20000);
  }

  function setupIntersectionObserver() {
    if (!_options.autoCheckReferenceLists) return;
    var adapter = getSiteAdapter();
    if (!adapter || adapter.id !== "sciencedirect") return;

    var target = document.querySelector('.bibliography, .references');
    if (!target) {
      // Retry once after a short delay for React-rendered pages
      setTimeout(function () {
        if (!_options.autoCheckReferenceLists) return;
        target = document.querySelector('.bibliography, .references');
        if (!target) return;
        observeRefsContainer(target);
      }, 1500);
      return;
    }
    observeRefsContainer(target);
  }

  function observeRefsContainer(target) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        scheduleIdleBatchCheck({ force: true });
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(target);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleForegroundCheck();
    }
  });
  window.addEventListener("focus", scheduleForegroundCheck);
  window.addEventListener("pageshow", scheduleForegroundCheck);
})();
