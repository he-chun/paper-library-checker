# Architecture

## Components

- `browser-extension/`: Manifest V3 extension for Chrome and Edge. Content
  scripts extract candidates and render status. The service worker owns local
  network access and secret storage. The toolbar popup reads a minimized health
  projection from the service worker and queries page state from the active
  tab's existing content script.
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

Content-script requests to the service worker require a same-extension sender,
a trusted `sender.tab`, and an HTTP(S) tab URL. Popup health uses a separate
extension-page predicate that requires the runtime ID and exact extension
scheme/host; a webpage cannot call it. The health projection contains only
connection and index-readiness booleans. The popup never receives the pairing
token. Manual checks from the popup and floating `↻` control share one content
page controller.

## User-interface localization

Browser strings use standard `_locales` resources through a shared `t()`
helper and follow the browser UI locale. Zotero Tools menu strings use the
lightweight add-on i18n module and the current Zotero/Gecko locale. Both support
English and Simplified Chinese with English fallback; internal protocol codes,
preference keys, identifiers, and logs remain stable English values.
