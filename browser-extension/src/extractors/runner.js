(function () {
  const api = (window.ZoteroCheck = window.ZoteroCheck || {});

  api.detectAndExtract = function detectAndExtract(doc = document, url = location.href) {
    const candidates = [];
    const detected = [];

    for (const extractor of api.extractors || []) {
      try {
        if (extractor.detect(doc, url)) {
          detected.push({ id: extractor.id, label: extractor.label });
          candidates.push(...extractor.extract(doc, url));
        }
      } catch (error) {
        console.warn("[Paper Library Checker] extractor failed", extractor.id, error);
      }
    }

    return {
      metadataSource: "extractor",
      detected,
      candidates: api.uniqueCandidates(candidates).map((candidate) => ({
        ...candidate,
        metadataSource: candidate.metadataSource || "extractor"
      }))
    };
  };
})();
