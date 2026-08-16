(function () {
  const api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.extractors = api.extractors || [];

  function firstMeta(doc, names) {
    for (const name of names) {
      const node = doc.querySelector(
        `meta[name="${CSS.escape(name)}"], meta[property="${CSS.escape(name)}"]`
      );
      const content = node && node.getAttribute("content");
      if (content) {
        return content.trim();
      }
    }
    return "";
  }

  function allMeta(doc, names) {
    const values = [];
    for (const name of names) {
      doc
        .querySelectorAll(`meta[name="${CSS.escape(name)}"], meta[property="${CSS.escape(name)}"]`)
        .forEach((node) => {
          const content = node.getAttribute("content");
          if (content) {
            values.push(content.trim());
          }
        });
    }
    return values;
  }

  function parseCOinS(doc) {
    const candidates = [];
    doc.querySelectorAll(".Z3988[title]").forEach((node) => {
      const params = new URLSearchParams(node.getAttribute("title").replace(/^ctx_ver=[^&]+&?/, ""));
      const doi = [...params.getAll("rft_id")]
        .map((value) => value.replace(/^info:doi\//i, ""))
        .find((value) => value && value !== params.getAll("rft_id")[0]);
      const title = params.get("rft.atitle") || params.get("rft.btitle") || params.get("rft.title");
      if (title) {
        candidates.push({
          itemType: "journalArticle",
          title,
          DOI: doi || "",
          date: params.get("rft.date") || "",
          creators: params.getAll("rft.au").map((name) => ({ name })),
          source: "coins"
        });
      }
    });
    return candidates;
  }

  function parseJSONLD(doc) {
    const candidates = [];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
      try {
        const parsed = JSON.parse(node.textContent);
        const values = Array.isArray(parsed) ? parsed : [parsed];
        for (const value of values.flatMap((entry) => entry["@graph"] || entry)) {
          const type = Array.isArray(value["@type"]) ? value["@type"].join(" ") : value["@type"] || "";
          if (!/Article|ScholarlyArticle|CreativeWork|Report|Thesis/i.test(type)) {
            continue;
          }

          const creators = [];
          const authors = Array.isArray(value.author) ? value.author : value.author ? [value.author] : [];
          for (const author of authors) {
            if (typeof author === "string") {
              creators.push({ name: author });
            } else if (author && author.name) {
              creators.push({ name: author.name });
            }
          }

          const title = value.headline || value.name;
          if (title) {
            candidates.push({
              itemType: /Thesis/i.test(type) ? "thesis" : "journalArticle",
              title,
              DOI: value.doi || "",
              date: value.datePublished || value.dateCreated || "",
              creators,
              url: value.url || location.href,
              source: "json-ld"
            });
          }
        }
      } catch (error) {
        // Ignore invalid JSON-LD blocks from third-party widgets.
      }
    });
    return candidates;
  }

  api.extractors.push({
    id: "generic-metadata",
    label: "Generic Embedded Metadata",

    detect(doc) {
      return Boolean(
        firstMeta(doc, ["citation_title", "DC.title", "dc.title", "og:title"]) ||
          doc.querySelector(".Z3988[title]") ||
          doc.querySelector('script[type="application/ld+json"]')
      );
    },

    extract(doc) {
      const candidates = [];
      const title = firstMeta(doc, ["citation_title", "DC.title", "dc.title", "og:title"]);
      if (title) {
        candidates.push({
          itemType: "journalArticle",
          title,
          DOI: firstMeta(doc, ["citation_doi", "doi", "DC.identifier", "dc.identifier"]),
          date: firstMeta(doc, [
            "citation_publication_date",
            "citation_date",
            "DC.date",
            "dc.date"
          ]),
          creators: allMeta(doc, ["citation_author", "DC.creator", "dc.creator"]).map((name) => ({
            name
          })),
          publicationTitle: firstMeta(doc, ["citation_journal_title", "DC.source", "dc.source"]),
          url: firstMeta(doc, ["citation_public_url", "og:url"]) || location.href,
          source: "embedded-metadata"
        });
      }

      candidates.push(...parseCOinS(doc));
      candidates.push(...parseJSONLD(doc));
      return candidates;
    }
  });
})();
