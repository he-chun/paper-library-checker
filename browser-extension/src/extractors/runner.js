(function () {
  const api = (window.ZoteroCheck = window.ZoteroCheck || {});

  api.detectAndExtract = function detectAndExtract(doc = document, url = location.href) {
    const candidates = [];
    const preferredCandidates = [];
    const detected = [];
    let preferLocal = false;

    for (const extractor of api.extractors || []) {
      try {
        if (extractor.detect(doc, url)) {
          detected.push({ id: extractor.id, label: extractor.label });
          const extracted = extractor.extract(doc, url);
          candidates.push(...extracted);
          if (extractor.preferLocal === true && extracted.length) {
            preferLocal = true;
            preferredCandidates.push(...extracted);
          }
        }
      } catch (error) {
        console.warn("[Paper Library Checker] extractor failed", extractor.id, error);
      }
    }

    return {
      metadataSource: "extractor",
      detected,
      preferLocal,
      candidates: api.uniqueCandidates(preferLocal ? preferredCandidates : candidates).map((candidate) => ({
        ...candidate,
        metadataSource: candidate.metadataSource || "extractor"
      }))
    };
  };
})();
