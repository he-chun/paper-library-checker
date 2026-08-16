(function () {
  const api = (window.ZoteroCheck = window.ZoteroCheck || {});
  api.extractors = api.extractors || [];

  function cleanAuthorName(value) {
    return String(value || "")
      .replace(/\d+/g, "")
      .replace(/[*,;；，,]/g, "")
      .trim();
  }

  function findLabelValue(doc, labelPattern) {
    const rows = doc.querySelectorAll(".row, li, p, div");
    for (const row of rows) {
      const text = row.textContent.replace(/\s+/g, " ").trim();
      if (!labelPattern.test(text)) {
        continue;
      }
      const value = text.replace(labelPattern, "").trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  function isCNKIArticleURL(url) {
    const parsed = new URL(url, location.href);
    return /(?:^|\.)cnki\.net$/i.test(parsed.hostname) &&
      /\/kcms(?:2)?\/(?:article\/abstract|detail\/detail\.aspx|detail)/i.test(parsed.pathname);
  }

  function findTitleNode(doc) {
    return (
      doc.querySelector(".wx-tit-scholar .h1-scholar") ||
      doc.querySelector(".wx-tit h1") ||
      doc.querySelector(".h1-scholar") ||
      doc.querySelector(".brief .h1-scholar") ||
      doc.querySelector("h1.title") ||
      doc.querySelector(".doc h1") ||
      doc.querySelector(".doc .title h1") ||
      doc.querySelector('meta[name="citation_title"]')
    );
  }

  function extractDOIfromHref(href) {
    if (!href) {
      return "";
    }
    const match = href.match(/https?:\/\/(?:dx\.)?doi\.org\/(.+)/i);
    if (!match) {
      return "";
    }
    try {
      return decodeURIComponent(match[1]);
    } catch (e) {
      return match[1];
    }
  }

  function findDOI(doc) {
    // Prefer href over textContent — href is immune to nested-element pollution
    // from injected content (e.g. easyScholar extension adding nested <a> tags).
    const foreignLink = doc.querySelector(".foreign-doi a[href*=\"dx.doi.org/\"], .foreign-doi a[href*=\"doi.org/\"]");
    if (foreignLink) {
      const doi = extractDOIfromHref(foreignLink.getAttribute("href"));
      if (doi) {
        return doi;
      }
    }

    // Any link to a DOI resolver on the page
    const anyLink = doc.querySelector("a[href*=\"dx.doi.org/\"], a[href*=\"doi.org/\"]");
    if (anyLink) {
      const doi = extractDOIfromHref(anyLink.getAttribute("href"));
      if (doi) {
        return doi;
      }
    }

    // Text-based fallbacks (Chinese pages, or href-less DOI display)
    const foreignDOI = doc.querySelector(".foreign-doi a");
    if (foreignDOI) {
      const text = foreignDOI.textContent.trim();
      if (text) {
        return text;
      }
    }

    const textLink = doc.querySelector("a[href*=\"dx.doi.org/\"], a[href*=\"doi.org/\"]");
    if (textLink) {
      const text = textLink.textContent.trim();
      if (text) {
        return text;
      }
    }

    // Broad label search (covers .row/li/p/div and h3 elements)
    const rows = doc.querySelectorAll(".row, li, p, div, h3");
    for (const row of rows) {
      const text = row.textContent.replace(/\s+/g, " ").trim();
      const match = text.match(/^DOI\s*[:：]\s*(\S.+)/i);
      if (match) {
        return match[1].trim();
      }
    }
    return "";
  }

  function cloneWithoutInlineNoise(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("sup, i, em").forEach((child) => child.remove());
    return clone;
  }

  api.extractors.push({
    id: "cnki-kcms",
    label: "CNKI KCMS",

    detect(doc, url) {
      return isCNKIArticleURL(url) && Boolean(findTitleNode(doc));
    },

    extract(doc) {
      const titleNode = findTitleNode(doc);
      const title = titleNode && titleNode.tagName === "META"
        ? titleNode.getAttribute("content")
        : api.visibleText(titleNode);
      const creators = [
        ...doc.querySelectorAll("#authorpart span a, #authorpart a, .authors a, .author a")
      ]
        .map((node) => cleanAuthorName(api.visibleText(cloneWithoutInlineNoise(node))))
        .filter(Boolean)
        .map((name) => ({ name }));

      const url = new URL(location.href);
      const cnkiFileID =
        doc.querySelector("#param-filename")?.value ||
        doc.querySelector("#paramfilename")?.value ||
        doc.querySelector("#filename")?.value ||
        doc.querySelector("#export-id")?.value ||
        url.searchParams.get("filename") ||
        url.searchParams.get("FileName") ||
        "";

      const doi = findDOI(doc);

      // Date: try scholar tip first (4-digit year), then Chinese label-value
      let date = "";
      const scholarTip = doc.querySelector(".top-tip-scholar");
      if (scholarTip) {
        const yearMatch = scholarTip.textContent.match(/(?:18|19|20)\d{2}/);
        if (yearMatch) {
          date = yearMatch[0];
        }
      }
      if (!date) {
        date = findLabelValue(doc, /^(发表时间|在线公开时间|出版日期|发表日期)\s*[:：]\s*/);
      }

      // Publication title from scholar page
      let publicationTitle = "";
      const pubLink = doc.querySelector(".top-tip-scholar a");
      if (pubLink) {
        publicationTitle = pubLink.textContent.trim();
      }

      return [
        {
          itemType: "journalArticle",
          title,
          DOI: doi,
          cnkiFileID,
          creators,
          date,
          publicationTitle,
          url: location.href,
          source: "cnki-kcms"
        }
      ];
    }
  });
})();
