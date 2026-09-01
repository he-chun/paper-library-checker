(function () {
  const api = window.ZoteroCheck;
  const i18n = window.PLCI18n;
  const uiState = window.PLCUIState;
  const backendContract = window.PLCBackendContract;
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
  const CURATED_BATCH_HOSTS = [
    "scopus.com"
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
  const BATCH_RETRY_INITIAL_MS = 60000;
  const BATCH_RETRY_MAX_MS = 300000;
  const FOREGROUND_CHECK_DEBOUNCE_MS = 1000;
  let checkCount = 0;
  let lastSuccessfulCandidateKey = "";
  let inFlightDetailKey = "";
  let lastSuccessfulBatchKey = "";
  let inFlightBatchKey = "";
  let inFlightBatchRunSerial = 0;
  let lastFailedBatchKey = "";
  let batchRetryNotBefore = 0;
  let batchRetryDelayMs = BATCH_RETRY_INITIAL_MS;
  let detailTimer = null;
  let batchTimer = null;
  let detailRetryTimer = null;
  let batchRetryTimer = null;
  let forceNextDetailCheck = false;
  let forceNextBatchCheck = false;
  let lastForegroundCheckAt = 0;
  let detailRunSerial = 0;
  let batchRunSerial = 0;
  // A page-scoped time prefix prevents late progress from a prior navigation
  // from colliding with a new content-script instance in the same tab.
  let batchRequestSequence = Date.now() * 1000;
  let activeBatchProgress = null;
  let observerDebounceTimer = null;
  let observerCheckPending = false;
  let observedPageKey = currentPageKey();

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
      if (isAutomaticSearchResultsPage()) {
        scheduleManualBatchCheck();
        return;
      }
      if (!shouldRunDetailDetection()) {
        setBadge(
          "unknown",
          i18n.t("badgeUnrecognized"),
          i18n.t("unsupportedMetadataDescription"),
          uiState.PAGE_STATES.UNRECOGNIZED
        );
        return;
      }
      setBadge("unknown", i18n.t("badgeChecking"), "", uiState.PAGE_STATES.CHECKING);
      scheduleDetailCheck({ force: true });
      scheduleManualBatchCheck();
    }
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message?.type === "zotero-check:batch-progress") {
      if (!senderSecurity.isTrustedExtensionContextSender(sender, chrome.runtime)) return false;
      applyBatchProgress(message);
      return false;
    }
    if (message?.type === "zotero-check:index-refreshed") {
      if (!senderSecurity.isTrustedExtensionContextSender(sender, chrome.runtime)) return false;
      const hadReferenceCheck = Boolean(lastSuccessfulBatchKey || lastFailedBatchKey || inFlightBatchKey);
      lastSuccessfulCandidateKey = "";
      lastSuccessfulBatchKey = "";
      lastFailedBatchKey = "";
      batchRetryNotBefore = 0;
      detailRunSerial += 1;
      batchRunSerial += 1;
      if (!isAutomaticSearchResultsPage()) scheduleDetailCheck({ force: true });
      if (shouldRunAutomaticBatchCheck() || hadReferenceCheck) scheduleBatchCheck({ force: true });
      return false;
    }
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
    if (shouldRunAutomaticBatchCheck()) {
      scheduleBatchCheck({ force: true });
    }
    if (!isCuratedKnownHost() && _options.broadPageDetection && shouldRunDetailDetection()) {
      scheduleDetailCheck({ force: true });
    }
  });

  function findAnchorElement() {
    var adapter = getSiteAdapter();
    var adapterAnchor = adapter && typeof adapter.getDetailBadgeAnchor === "function"
      ? adapter.getDetailBadgeAnchor(document)
      : null;
    return (
      adapterAnchor ||
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

  function sendMatch(candidates, workload, requestId) {
    return new Promise((resolve) => {
      const message = Array.isArray(candidates)
        ? { type: "zotero-check:match", candidates }
        : { type: "zotero-check:match", candidate: candidates };
      if (Array.isArray(candidates) && workload) message.workload = workload;
      if (Array.isArray(candidates) && Number.isSafeInteger(requestId)) message.requestId = requestId;
      chrome.runtime.sendMessage(
        message,
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

  function detailCandidateKey(candidate) {
    const creators = Array.isArray(candidate?.creators)
      ? candidate.creators.map((creator) => {
        const name = creator?.name || [creator?.firstName, creator?.lastName].filter(Boolean).join(" ");
        return api.normalizeTitle(name || "");
      }).filter(Boolean).join(",")
      : "";
    return [
      candidate?.DOI || "",
      candidate?.PMID || "",
      api.normalizeTitle(candidate?.title || ""),
      (Array.isArray(candidate?.alternateTitles) ? candidate.alternateTitles : [])
        .map((title) => api.normalizeTitle(title)).join(","),
      api.normalizeTitle(candidate?.date || ""),
      creators
    ].join("|");
  }

  async function detectMetadata(doc, url) {
    var localExtraction = api.detectAndExtract(doc, url);
    // Embedded DOI metadata and explicitly preferred site extractors are
    // complete local sources unless the user forces translation-server.
    if (_options.translationServerMode !== "always" &&
        (doc.querySelector('meta[name="citation_doi"]') || localExtraction.preferLocal)) {
      return localExtraction;
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

    return localExtraction;
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
    const pageKey = currentPageKey();
    const detectionSerial = detailRunSerial;
    const force = forceNextDetailCheck;
    forceNextDetailCheck = false;
    checkCount += 1;
    const extraction = await detectMetadata(document, location.href);
    if (detectionSerial !== detailRunSerial || pageKey !== currentPageKey()) {
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
      .map(detailCandidateKey)
      .join(";");
    if (!force && candidateKey === lastSuccessfulCandidateKey && document.querySelector("#zotero-check-badge-host")) {
      return;
    }
    if (!force && candidateKey === inFlightDetailKey) {
      return;
    }

    const runSerial = ++detailRunSerial;
    inFlightDetailKey = candidateKey;

    setBadge(
      "unknown",
      i18n.t("badgeCheckingSource", extraction.metadataSource),
      "",
      uiState.PAGE_STATES.CHECKING
    );

    let response;
    try {
      response = await sendMatch(extraction.candidates, "detail");
    } finally {
      if (runSerial === detailRunSerial && inFlightDetailKey === candidateKey) {
        inFlightDetailKey = "";
      }
    }
    if (runSerial !== detailRunSerial || pageKey !== currentPageKey()) {
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
    const runSerial = ++detailRunSerial;
    const pageKey = currentPageKey();
    clearChoices();
    const candidate = {
      ...choice,
      metadataSource: "translation-server"
    };
    setBadge("unknown", i18n.t("badgeCheckingSource", "translation-server"), "", uiState.PAGE_STATES.CHECKING);
    const response = await sendMatch(candidate);
    if (runSerial !== detailRunSerial || pageKey !== currentPageKey()) {
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
    lastSuccessfulCandidateKey = detailCandidateKey(candidate);
    applyDetailResult(pickBestResult(response.result), "translation-server");
  }

  function applyDetailResult(result, metadataSource) {
    const detailPossibleLabelKey = getSiteAdapter()?.detailPossibleLabelKey || "badgePossibleMatch";
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
    if (result?.complete === false && result?.freshness === "stale") {
      const matched = isPositiveResult(result);
      setBadge(
        matched ? "possible" : "unknown",
        i18n.t(matched ? "badgeSavedStale" : "badgeIndexStale"),
        i18n.t("staleIndexResultDescription"),
        matched ? uiState.PAGE_STATES.STALE_MATCH : uiState.PAGE_STATES.STALE_UNKNOWN
      );
      return;
    }
    if (backendContract.isIncompleteNotFound(result)) {
      setBadge(
        "unknown",
        i18n.t("badgeIncompleteNotFound"),
        i18n.t("incompleteNotFoundDescription"),
        uiState.PAGE_STATES.INCOMPLETE_NOT_FOUND
      );
      return;
    }
    if (isPositiveResult(result)) {
      setBadge(
        result.status === "possible_match" ? "possible" : "matched",
        i18n.t(result.status === "possible_match" ? detailPossibleLabelKey : "badgeSaved"),
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
    if (!getSiteAdapter()) {
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
    const force = forceNextBatchCheck;
    forceNextBatchCheck = false;
    const userInitiated = _batchUserInitiated;
    _batchUserInitiated = false;

    // Search-result pages are a primary workflow. Reference lists remain
    // option-gated, while a user-initiated check always passes.
    if (!shouldRunAutomaticBatchCheck() && !userInitiated) {
      return;
    }

    const adapter = getSiteAdapter();
    if (!adapter) {
      return;
    }
    let targets;
    var signature;

    // Compute fast signature before expensive collectBatchTargets.
    if (typeof adapter.getBatchSignature === "function") {
      signature = adapter.getBatchSignature();
      if (!force && signature && signature === lastSuccessfulBatchKey) {
        return;
      }
      if (!force && signature && signature === inFlightBatchKey) {
        return;
      }
    }
    targets = adapter.collectBatchTargets().slice(0, BATCH_LIMIT);

    if (!targets.length) {
      if (isAutomaticSearchResultsPage()) {
        pageController.setState(uiState.PAGE_STATES.NOT_CHECKED);
      }
      return;
    }

    var batchKey = targets.map(function (t) { return t.sourceId || t.key; }).join(";");
    if (signature) {
      // Use the pre-computed signature if available
      batchKey = signature;
    }
    if (!force && batchKey === lastSuccessfulBatchKey) {
      return;
    }
    if (!userInitiated && batchKey === lastFailedBatchKey && Date.now() < batchRetryNotBefore) {
      return;
    }
    if (batchKey === inFlightBatchKey) {
      return;
    }

    const runSerial = ++batchRunSerial;
    const pageKey = currentPageKey();
    const requestId = ++batchRequestSequence;
    inFlightBatchKey = batchKey;
    inFlightBatchRunSerial = runSerial;
    activeBatchProgress = { adapter, requestId, runSerial, targets };
    if (isAutomaticSearchResultsPage()) {
      pageController.setState(uiState.PAGE_STATES.CHECKING);
    }

    let response;
    try {
      response = await sendMatch(
        targets.map(function (target) { return target.candidate; }),
        "references",
        requestId
      );
    } finally {
      if (inFlightBatchKey === batchKey && inFlightBatchRunSerial === runSerial) {
        inFlightBatchKey = "";
        inFlightBatchRunSerial = 0;
      }
      if (activeBatchProgress?.requestId === requestId) activeBatchProgress = null;
    }
    if (runSerial !== batchRunSerial || pageKey !== currentPageKey()) {
      return;
    }
    if (!response || !response.ok || !Array.isArray(response.result?.results)) {
      adapter.applyBatchResults(
        targets.map(function (t) {
          return { sourceId: t.sourceId, status: "error", error: response?.error || i18n.t("checkerOffline") };
        })
      );
      if (isAutomaticSearchResultsPage()) {
        pageController.setState(uiState.PAGE_STATES.ERROR);
      }
      scheduleBatchRetry(batchKey);
      return;
    }

    const batchResults = response.result.results;
    const allErrored = batchResults.length > 0 && batchResults.every(function (result) {
      return result?.status === "error";
    });
    if (allErrored) {
      scheduleBatchRetry(batchKey);
    } else {
      clearTimeout(batchRetryTimer);
      batchRetryDelayMs = BATCH_RETRY_INITIAL_MS;
      batchRetryNotBefore = 0;
      lastFailedBatchKey = "";
      lastSuccessfulBatchKey = batchKey;
    }

    var results = response.result.results.map(function (r, i) {
      var t = targets[i];
      return Object.assign({}, r, { sourceId: t ? t.sourceId : "" });
    });
    adapter.applyBatchResults(results);
    if (isAutomaticSearchResultsPage()) {
      pageController.setState(uiState.PAGE_STATES.NOT_CHECKED);
    }
  }

  function applyBatchProgress(message) {
    const active = activeBatchProgress;
    if (!active || message.requestId !== active.requestId || active.runSerial !== batchRunSerial ||
        !Number.isInteger(message.index) || message.index < 0 || message.index >= active.targets.length ||
        !message.result || typeof message.result !== "object") {
      return;
    }
    const target = active.targets[message.index];
    active.adapter.applyBatchResults([
      Object.assign({}, message.result, { sourceId: target.sourceId || "" })
    ]);
  }

  function scheduleBatchRetry(batchKey) {
    clearTimeout(batchRetryTimer);
    const delay = batchRetryDelayMs;
    lastFailedBatchKey = batchKey || lastFailedBatchKey;
    batchRetryNotBefore = Date.now() + delay;
    batchRetryDelayMs = Math.min(BATCH_RETRY_MAX_MS, delay * 2);
    batchRetryTimer = setTimeout(() => {
      lastSuccessfulBatchKey = "";
      scheduleBatchCheck();
    }, delay);
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

  function isCuratedBatchHost() {
    var hostname = location.hostname.toLowerCase();
    return CURATED_BATCH_HOSTS.some(function (domain) {
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
    if (isAutomaticSearchResultsPage()) {
      return false;
    }
    if (isAdapterDetailPage()) {
      return true;
    }
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

  function isAutomaticSearchResultsPage() {
    var adapter = getSiteAdapter();
    return Boolean(
      adapter &&
      typeof adapter.isSearchResultsPage === "function" &&
      adapter.isSearchResultsPage()
    );
  }

  function isAdapterDetailPage() {
    var adapter = getSiteAdapter();
    return Boolean(
      adapter &&
      typeof adapter.isDetailPage === "function" &&
      adapter.isDetailPage(location.href)
    );
  }

  function shouldRunAutomaticBatchCheck() {
    return Boolean(_options.autoCheckReferenceLists || isAutomaticSearchResultsPage());
  }

  function currentPageKey() {
    return location.pathname + location.search;
  }

  function removeDetailBadge() {
    var host = document.querySelector("#zotero-check-badge-host");
    if (host) host.remove();
  }

  function resetWorkForRouteChange() {
    detailRunSerial += 1;
    batchRunSerial += 1;
    checkCount = 0;
    lastSuccessfulCandidateKey = "";
    inFlightDetailKey = "";
    lastSuccessfulBatchKey = "";
    inFlightBatchKey = "";
    inFlightBatchRunSerial = 0;
    lastFailedBatchKey = "";
    batchRetryNotBefore = 0;
    batchRetryDelayMs = BATCH_RETRY_INITIAL_MS;
    forceNextDetailCheck = false;
    forceNextBatchCheck = false;
    _batchUserInitiated = false;
    activeBatchProgress = null;
    clearTimeout(detailTimer);
    clearTimeout(batchTimer);
    clearTimeout(detailRetryTimer);
    clearTimeout(batchRetryTimer);
    removeDetailBadge();
    document.querySelectorAll(".zotero-check-search-status").forEach(function (chip) {
      chip.remove();
    });
    pageController.setState(uiState.PAGE_STATES.NOT_CHECKED);
  }

  function syncRouteState() {
    var pageKey = currentPageKey();
    if (pageKey === observedPageKey) return false;
    observedPageKey = pageKey;
    resetWorkForRouteChange();
    if (shouldRunDetailDetection()) {
      scheduleDetailCheck({ force: true, delay: 120 });
    }
    if (shouldRunAutomaticBatchCheck()) {
      scheduleBatchCheck({ force: true, delay: 250 });
    }
    return true;
  }

  function getCNKIListSignature() {
    var adapter = getSiteAdapter();
    if (!adapter || typeof adapter.getBatchSignature !== "function") {
      return "";
    }
    return adapter.getBatchSignature();
  }

  function setupCNKIDynamicListWatcher() {
    var adapter = getSiteAdapter();
    if (!adapter || adapter.id !== "cnki") {
      return;
    }

    var lastListSignature = "";
    var containerWatchers = [];
    var bodyFallbackObserver = null;

    function triggerBatchIfChanged() {
      if (!shouldRunAutomaticBatchCheck()) {
        return;
      }
      var sig = getCNKIListSignature();
      if (!sig || sig === lastListSignature) {
        return;
      }
      lastListSignature = sig;
      scheduleIdleBatchCheck();
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
      var containers = typeof adapter.getBatchMutationContainers === "function"
        ? adapter.getBatchMutationContainers()
        : [];
      for (var k = 0; k < containers.length; k++) {
        var container = containers[k];
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
      if (typeof adapter.isBatchNavigationEvent !== "function" ||
          !adapter.isBatchNavigationEvent(event)) {
        return;
      }
      if (!shouldRunAutomaticBatchCheck()) {
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

  function getBadgeState() {
    const host = document.querySelector("#zotero-check-badge-host");
    const badge = host?.shadowRoot?.querySelector(".zotero-check-badge");
    return badge ? badge.dataset.state : null;
  }

  function scheduleForegroundCheck() {
    if (document.visibilityState && document.visibilityState !== "visible") {
      return;
    }

    if (syncRouteState()) {
      return;
    }

    const now = Date.now();
    if (now - lastForegroundCheckAt < FOREGROUND_CHECK_DEBOUNCE_MS) {
      return;
    }
    lastForegroundCheckAt = now;

    if (!isAutomaticSearchResultsPage()) {
      const currentState = getBadgeState();
      if (currentState !== "matched") {
        scheduleDetailCheck({ force: true, delay: 120 });
      }
    }

    if (shouldRunAutomaticBatchCheck()) {
      scheduleBatchCheck({ delay: 250 });
    }
  }

  setupCNKIDynamicListWatcher();

  if (!isAutomaticSearchResultsPage()) {
    scheduleDetailCheck();
  }
  if (shouldRunAutomaticBatchCheck()) {
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
      if (syncRouteState()) {
        return;
      }
      if (checkCount >= MAX_DYNAMIC_CHECKS && !isCuratedBatchHost()) {
        observer.disconnect();
        return;
      }
      if (!isAutomaticSearchResultsPage() && checkCount < MAX_DYNAMIC_CHECKS) {
        scheduleDetailCheck();
      }

      // Search-result pages auto-check; reference lists remain option-gated.
      if (!shouldRunAutomaticBatchCheck()) return;
      var adapter = getSiteAdapter();
      var sig = "";
      if (adapter && typeof adapter.getBatchSignature === "function") {
        sig = adapter.getBatchSignature();
      }
      if (sig && sig !== lastSuccessfulBatchKey) {
        scheduleIdleBatchCheck();
      }
    }, 200);
  });
  const automaticSearchResultsPage = isAutomaticSearchResultsPage();
  const curatedBatchHost = isCuratedBatchHost();
  if (isLikelyAcademicPage() || automaticSearchResultsPage || curatedBatchHost) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    if (!automaticSearchResultsPage && !curatedBatchHost) {
      setTimeout(function () { observer.disconnect(); }, 20000);
    }
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
        scheduleIdleBatchCheck();
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
  window.addEventListener("popstate", scheduleForegroundCheck);
})();
