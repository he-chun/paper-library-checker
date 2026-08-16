export function createSyntheticData(markerId) {
  if (!/^PLC-DEBUG-[A-Z0-9-]{12,}$/.test(markerId)) throw new Error("invalid_marker_id");
  return {
    markerId,
    title: `PLC Synthetic Title ${markerId}`,
    DOI: `10.5555/plc.${markerId.toLowerCase()}`,
    creator: `PLC Synthetic Creator ${markerId}`,
    URL: `https://example.invalid/plc-debug/${encodeURIComponent(markerId)}`
  };
}

export function createCandidate(synthetic, suffix = "") {
  return {
    itemType: "journalArticle",
    title: `${synthetic.title}${suffix}`,
    DOI: `${synthetic.DOI}${suffix ? ".second" : ""}`,
    creators: [{ name: `${synthetic.creator}${suffix}` }],
    date: "2099",
    url: suffix ? `${synthetic.URL}?item=second` : synthetic.URL,
    publicationTitle: `PLC Synthetic Journal ${synthetic.markerId}`
  };
}

export function createRequestBodies(synthetic) {
  const candidate = createCandidate(synthetic);
  const second = createCandidate(synthetic, " Second");
  const checkBody = JSON.stringify({ item: candidate });
  const batchBody = JSON.stringify({ items: [candidate, second] });
  const mutationBody = JSON.stringify({ item: { ...candidate, title: `${candidate.title} Mutated` } });
  return { batchBody, checkBody, mutationBody };
}
