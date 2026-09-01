# Changelog

All notable changes will be documented here. The project follows Semantic
Versioning while remaining pre-1.0.

## [Unreleased]

- Adds an explicit CNKI search-results adapter for KNS8 result tables, including
  stable batch signatures, title/author/year/source extraction, positive inline
  library badges, automatic AJAX/pagination rechecks, and synthetic regression
  coverage without relying on CNKI's volatile `v` query token.
- Adds an experimental Scopus publications-search adapter for both Table and
  List views, verified against the live 2026 search DOM and covered by synthetic
  extraction, rendering, SPA-navigation, and packaging regressions.
- Adds an experimental Scopus document-details extractor for the live
  `/pages/publications/<id>` DOM, including DOI/title/author/year/source
  extraction and stale-response-safe SPA transitions between details and search.

## [0.5.0] - 2026-08-30

- Adds Automatic, Standard, and Enhanced connection modes while preserving the
  protocol v1 enhanced-mode contract.
- Adds a no-XPI Standard mode that uses Zotero's built-in read-only Local API.
- Builds a minimal IndexedDB exact-match snapshot for personal and accessible
  group libraries, supporting DOI, PMID, ISBN, CNKI, and normalized-title checks.
- Supports single-page and ordered reference-list batch checks with stable
  deduplication and minimized results.
- Keeps Direct Local API lookup as a compatibility fallback; negative Direct
  results remain explicitly incomplete instead of claiming that an item is not
  saved.
- Keeps Enhanced/XPI mode for fuzzy title matching, `possible_match`, real-time
  Zotero updates, authenticated HMAC requests, and highest batch performance.
- Adds atomic index generations, refresh, stale-state handling, cancellation,
  recovery, clear, and rebuild controls without persisting raw Zotero items.
- Adds localized dual-mode settings and popup status, capability, fallback, and
  repair guidance, plus updated privacy boundaries for both local backends.

## [0.4.1] - 2026-08-24

- Adds an original, provenance-documented extension icon and production icon
  declarations without changing browser permissions.
- Prepares bilingual Chrome Web Store listing, privacy, permission, reviewer,
  submission, screenshot, and promotional materials.
- Aligns the popup `Not saved` status color with the existing page status blue.
- Publishes deterministic 0.4.1 artifacts and the matching Zotero update metadata.

## [0.4.0] - 2026-08-20

- Adds a browser toolbar popup for Zotero connectivity,
  index readiness, current-page state, manual page checks, and direct access to
  Options.
- Localizes the browser extension and Zotero Tools menu in English and
  Simplified Chinese, with English fallback for unsupported locales.
- Keeps popup-only health messages on a separate extension-page sender boundary
  from authenticated content-script messages, without adding browser or host
  permissions.
- Separates development candidate update manifests from the tracked published
  `updates.json` while retaining deterministic Ubuntu/Windows artifact checks
  and the published v0.3.0 verification boundary.
- Fixes Zotero `loadSubScript` target-scope compatibility for the i18n module.
- Ensures manual checks without usable metadata settle on `Unrecognized`
  instead of remaining in the transient `Checking` state.

## [0.3.0] - 2026-08-14

- Establishes deterministic canonical UTF-8/LF artifacts that reproduce
  byte-for-byte on Ubuntu and Windows.
- Adds a deterministic public-export allowlist and public release
  qualification summary.
- Passes the release gates on Zotero 9.0.6 and Microsoft Edge 151.0.4129.78:
  persistent native Edge installation, restart persistence, protocol and token
  lifecycle, matching, all three debug boundaries, CNKI Chinese detail, MDPI
  detail, unknown/malformed behavior, and generic fixtures. CNKI English and
  batches remain experimental; ScienceDirect remains best effort.
- Defines the first 0.3.0 public-alpha support gate: Zotero 9.0.6 and Edge with
  CNKI Chinese detail, MDPI detail, generic metadata fixtures, malformed-page
  handling, Edge restart, protocol/token lifecycle, matching, and three debug
  boundaries. CNKI English and batch coverage remain experimental;
  ScienceDirect is best effort when live access is challenged.
- Bounds browser-side creator lists at the shared local API serialization
  boundary. Creator values are trimmed, empty values removed, equivalent names
  deduplicated in first-seen order, and the result capped at 20 while the
  server-side fail-closed limit remains unchanged.
- Fixes a pre-release local API defect that silently ignored credential-bearing
  JSON fields after valid HMAC authentication. `/check` and `/batch-check` now
  enforce strict `{item}` and `{items}` envelopes and return HTTP 401
  `legacy_auth_rejected` for embedded credential keys or the pairing secret as
  a JSON value.
- Licenses the project under Apache-2.0.
- Historical Zotero 7/8 verification remains recorded in its original reports;
  the current required runtime gate targets Zotero 9.0.6 and Edge.
- Targets Zotero 9.0.x only; Zotero 7, Zotero 8, and Zotero 10 beta are unsupported.
- Adds the required Zotero `update_url` and a deterministic generated `updates.json`.
- Synchronizes the browser extension and Zotero add-on at version 0.3.0.
- Retains the HMAC protocol and local-first privacy model.
- Retains legacy Zotero package metadata after the manifest-only diagnostic package failed the disable/enable lifecycle.
- Version 0.2.0 was a pre-release development build and was never publicly released.

## [0.2.0] - 2026-08-12

### Added

- 256-bit local pairing token generation, copy, reset, and revoke actions.
- Request limits, schema validation, rate protection, bounded caches, log
  redaction/rotation, threat model, privacy policy, tests, CI, and cross-platform
  release artifact construction.
- Product name **Paper Library Checker** and third-party Zotero disclaimer.

### Changed

- **Breaking:** `/health`, `/check`, and `/batch-check` now require
  `X-Paper-Library-Checker-Token`.
- **Breaking:** token values are no longer accepted in business JSON bodies.
- **Breaking:** match responses return only status, match type, and confidence.
- Browser secrets moved from sync storage to local storage.
- Component versions were unified at `0.2.0`.

### Security

- Former fixed development credentials fail closed.
- Endpoint configuration is restricted to the exact HTTP loopback path.
- Content-script messages and translation-server targets are validated.

Historical 0.2 protocol migration: [docs/migration-0.2.md](docs/migration-0.2.md).
Version 0.3 migration: [docs/migration-0.3.md](docs/migration-0.3.md).
