# Changelog

All notable changes will be documented here. The project follows Semantic
Versioning while remaining pre-1.0.

## [Unreleased]

- No changes yet.

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
