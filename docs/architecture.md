# Architecture

## Components

- `browser-extension/`: Manifest V3 extension for Chrome and Edge. Content
  scripts extract candidates and render status. The service worker owns local
  network access and secret storage. The toolbar popup reads a minimized health
  projection from the service worker and queries page state from the active
  tab's existing content script. If that state is `checking`, the popup follows
  the same tab until the content script reports a terminal state, so its status
  cannot remain stale after the page badge finishes. Options also asks the
  service worker to probe; it does not implement either network protocol.
- `zotero-plugin/`: bootstrap add-on that indexes regular Zotero items in memory,
  registers authenticated endpoints on Zotero's loopback HTTP server, and
  updates the index through Zotero notifications.
- Optional translation-server: separately installed local service used for
  article metadata when configured.

The service worker selects a connection backend behind a shared
`probe`/`check`/`batchCheck`/`getCapabilities` interface. The enhanced backend
encapsulates the existing authenticated add-on protocol. Standard mode has an
internal resolver: `IndexedLocalApiBackend` is primary when an active ready or
stale generation exists, while `DirectLocalApiBackend` remains the cold-start
and small-query fallback. The full-snapshot builder reads personal and accessible
group libraries through Zotero's built-in read-only Local API, immediately
reduces records to normalized matching fields, and atomically swaps generations.
Direct positive matches are exact, but quicksearch misses remain incomplete. See
`docs/dual-backend-architecture.md`.

`common/backend-contract.js` defines the canonical capability schema shared by
XPI, Indexed, and Direct engines and projects legacy capability aliases for old
callers. New UI reads `mode`, `engine`, `indexState`, `freshness`, the explicit
verification/recall fields, and `complete`. Ready Indexed and XPI misses are
complete; Direct and stale misses are qualified as incomplete. The stable
product matrix is defined in `docs/mode-capability-contract.md`.

Standard-mode batch cancellation is scoped to the sender tab and to a fixed
`detail` or `references` workload. Identical in-flight candidate sets are
reused, while a changed set supersedes only the older batch in that same scope.
Single-article and reference-list checks in one tab therefore cannot cancel one
another. This also prevents dynamic-page observers or another open tab from
repeatedly aborting useful Local API work. Title-bearing candidates use only
Zotero's lightweight title/creator/year search; exact identifiers are reverified
in the returned records, while identifier-only candidates retain the full-text
compatibility fallback. Production permits four concurrent lightweight title
queries but keeps identifier-only full-text work serial, within a four-item-request
hard ceiling. A timed out item query opens a one-minute fail-fast
cooldown so aborted searches cannot build an invisible Zotero work queue. Queued
detail-page work takes precedence over queued reference-list queries in each
lane, while the lightweight connection probe runs
outside the item-query queue so popup and Options health cannot wait behind an
entire page batch. Automatic page retries use bounded
exponential backoff while manual rechecks remain available. Foreground,
visibility, intersection, and DOM-change triggers never force an unchanged
completed reference batch; only the explicit manual recheck bypasses the
successful-batch key.

Standard reference batches publish each completed minimized result back to the
originating content script before the final ordered batch response is ready.
Progress is correlated with a page-scoped request ID, so navigation and newer
batches ignore stale updates. These internal progress messages contain only the
input index and the normal status/matchType/confidence/error boundary; raw Local
API items remain confined to service-worker memory. Enhanced mode and the
existing final request/response envelopes are unchanged.

## Detection classes

Article detail detection uses site-specific and generic embedded metadata. The
Scopus detail extractor reads the stable document-header fields because the
current publications page exposes no citation meta tags or JSON-LD.
Search/reference/list detection is a separate capability and runs only through
an explicit adapter such as CNKI, Scopus, or ScienceDirect. Generic metadata
never enables unknown-site list scanning.

The same extractor runner, CNKI and Scopus extractors, adapters, candidate deduplication,
request IDs, incremental renderer, popup, Options, i18n, and page-state model
serve every engine. Backend selection happens only in the service worker; no
mode-specific page extractor or content-script network path exists.

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

Standard-mode Local API responses remain in service-worker memory and are
reduced to status, match type, and confidence. Raw Zotero item JSON is never
sent to content scripts, extension pages, logs, or remote services. IndexedDB
stores only allowlisted normalized identifier/title/year/creator/type keys and
generation/library bookkeeping, never raw item JSON.

Content-script requests to the service worker require a same-extension sender,
a trusted `sender.tab`, and an HTTP(S) tab URL. Popup health uses a separate
extension-page predicate that requires the runtime ID and exact extension
scheme/host; a webpage cannot call it. The health projection contains only
the legacy connection and index-readiness booleans plus optional actual mode,
capabilities, fallback reason, and stable repair code. The popup never receives
the pairing token or raw items. Manual checks from the popup and floating `↻`
control share one content page controller.

## User-interface localization

Browser strings use standard `_locales` resources through a shared `t()`
helper and follow the browser UI locale. Zotero Tools menu strings use the
lightweight add-on i18n module and the current Zotero/Gecko locale. Both support
English and Simplified Chinese with English fallback; internal protocol codes,
preference keys, identifiers, and logs remain stable English values.

The Options page exposes automatic, standard, and enhanced connection modes.
Standard mode hides enhanced credentials and saves without validating or
rewriting them. Enhanced mode requires the existing 64-character token. Auto
keeps enhanced settings available in a collapsed section. Missing or invalid
stored modes normalize to auto without destructive storage migration.

The same Options page manages the standard index only through trusted service-
worker messages. Cold startup opens IndexedDB and makes an active generation
available without loading it into a memory map. A named 30-minute maximum age
marks an old generation stale and starts a background full-snapshot refresh.
`ready`, `stale`, `refreshing`, and refresh-error states with an active generation
continue to use IndexedDB; stale results are incomplete and page misses are not
rendered as absolute absence. A successful refresh sends only a re-check signal
to known content-script tabs. Content scripts cannot build, clear, or inspect
the index.

Developer mode is an opt-in diagnostic path owned by the service worker. Both
backends emit structured phase and timing events into a 200-entry in-memory
ring. The Options page can read or clear that ring through extension-origin-only
messages. Content scripts cannot access it. The event schema excludes request
bodies, query values, tokens, endpoints, and raw Zotero items. Batch events may
include the bounded `detail`, `references`, or legacy `default` workload name.
