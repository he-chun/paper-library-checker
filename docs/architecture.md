# Architecture

## Components

- `browser-extension/`: Manifest V3 extension for Chrome and Edge. Content
  scripts extract candidates and render status. The service worker owns local
  network access and secret storage.
- `zotero-plugin/`: bootstrap add-on that indexes regular Zotero items in memory,
  registers authenticated endpoints on Zotero's loopback HTTP server, and
  updates the index through Zotero notifications.
- Optional translation-server: separately installed local service used for
  article metadata when configured.

## Detection classes

Article detail detection uses site-specific and generic embedded metadata.
Reference/list detection is a separate capability and runs only for CNKI or an
explicit adapter such as ScienceDirect. Generic metadata never enables unknown
site reference scanning.

## Compatibility identifiers

`ZoteroCheck`, `extensions.zoteroCheck.*`, `/zotero-checker`, and existing DOM
IDs are legacy internal identifiers. They remain to avoid unnecessary protocol,
preference, and extension migration. User-visible naming is Paper Library
Checker.

## Matching

Identifiers take priority over normalized exact title and fuzzy title matching.
Year and normalized creator values disambiguate title candidates. The index
stores only regular bibliographic items and invalidates caches when its revision
changes. See `docs/matching.md`.

## Security boundaries

The content script treats DOM metadata as untrusted. The service worker validates
sender and tab URL, keeps the token in local storage, and restricts network
destinations. The add-on validates authentication, size, schema, rate, and cache
bounds before matching. See `docs/threat-model.md`.
