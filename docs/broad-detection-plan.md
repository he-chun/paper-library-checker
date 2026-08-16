# Broad Article Detection Plan

This document designs a cautious path toward covering more article detail pages
that Zotero Connector can recognize, without turning reference/list scanning
into an unrestricted crawler.

## Capability Split

Paper Library Checker should keep two different capability classes separate:

- Article detail detection: detect the current page as a single scholarly item
  and check whether it already exists in Zotero. The long-term goal is to cover
  as many Zotero Connector-supported article pages as practical.
- Reference/list batch detection: collect many linked references from a page and
  batch-check them. This should remain limited to sites with explicit adapters,
  such as CNKI and ScienceDirect, because each site needs selectors, pagination
  handling, result mapping, and UI coloring rules.

Unknown sites must never receive automatic reference/list scanning.

## Proposed Option

Add a browser extension option:

```text
broadPageDetection: false
```

The default is `false`. With the default setting, behavior remains limited to
the curated manifest matches and existing site logic.

When `broadPageDetection=true`, a future experimental build may allow the
content script to run on `<all_urls>`, but it must perform a cheap prefilter
before any detail check, badge creation, mutation observer, or
translation-server request.

## Cheap Prefilter

The prefilter should pass only when one or more low-cost signals suggest that
the page is a scholarly article detail page:

- `meta[name^="citation_"]`
- `meta[name^="DC."]`
- `.Z3988[title]`
- `script[type="application/ld+json"]`
- URL or hostname contains `doi`, `pubmed`, `arxiv`, `article`, or `journal`
- Hostname matches known scholarly hosts used for article pages

The prefilter should be synchronous, DOM-light, and should not traverse large
reference sections or arbitrary link lists.

## Translation-Server Role

Broad detection should combine local extraction and translation-server without
making translation-server the first step for every page:

- If embedded citation metadata includes `meta[name="citation_doi"]` and
  `translationServerMode !== "always"`, prefer the local generic extractor for
  performance.
- If embedded metadata is missing but the cheap prefilter still suggests a
  scholarly page, try translation-server when the configured mode allows it.
- If translation-server is unavailable or returns an error, fall back to local
  extractors where possible.

## Reference/List Batch Detection Rules

Reference/list batch detection is adapter-only:

- CNKI adapter logic may scan CNKI detail, reference, citation, and related
  literature areas.
- ScienceDirect adapter logic may scan its References list.
- Unknown sites must not auto-scan references, citations, bibliographies, tables
  of contents, search results, or arbitrary links.
- `autoCheckReferenceLists` must not override this adapter requirement.

## Risks

- Permission expansion: `<all_urls>` significantly increases user trust and
  review burden, even if runtime checks return early.
- Performance: broad injection can run on many non-scholarly pages; early return
  must happen before expensive DOM scans, observers, badges, or network calls.
- Privacy: page URLs may reveal browsing context. Broad detection should avoid
  translation-server requests unless the page passes a scholarly prefilter.
- Translation-server request volume: broad detection could generate more
  requests. Reachability probes should remain cached, and detail checks should
  stay debounced.

## Phased Implementation

1. Document the broad detection model and add a disabled-by-default
   `broadPageDetection` option.
2. Add a runtime `shouldRunDetailDetection()` gate that preserves current
   curated-site behavior and only uses the cheap prefilter when broad detection
   is enabled.
3. Keep `manifest.json` unchanged while validating that the option and gate do
   not affect current supported sites.
4. Create an experimental branch that changes content script matches to
   `<all_urls>` and adds a stricter top-level early return before observers,
   badges, or network work.
5. Manually test curated sites, broad article detail pages, non-scholarly pages,
   private/internal pages, and skipped hosts.
6. If broad testing is stable, consider a reviewed release with clear permission
   disclosure and default `broadPageDetection=false`.
