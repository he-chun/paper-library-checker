# Indexed standard backend storage

## Status and scope

This document defines the IndexedDB storage foundation and initial full-snapshot
builder for the future indexed path of standard mode. The builder calls Zotero
Local API only when an authorized extension page starts it. The indexed path is
not selected by the backend resolver and does not handle page matches yet.
`DirectLocalApiBackend` remains the standard-mode compatibility fallback.

The storage modules use the repository's IIFE/`globalThis`/CommonJS-compatible
module form. They require no bundler or runtime dependency and can run in the
Manifest V3 service worker. Browser IndexedDB is injected into the repository;
Node tests inject `fake-indexeddb`, which is a development-only dependency and
is not packaged.

## Database schema

Database: `paper-library-checker-standard-index`

Schema version: `2`

The repository owns all raw IndexedDB access. Business and matching code must
use the repository API rather than opening these stores directly.

### `meta`

Key path: `scopeKey`

Each entry contains:

```js
{
  scopeKey,
  schemaVersion,
  activeGeneration,
  pendingGeneration,
  scopeConfidence,
  state,
  lastSuccessfulBuildAt,
  lastAttemptAt,
  errorCode
}
```

Supported states are `not_built`, `building`, `ready`, `stale`, and `error`.
`pendingGeneration` is repository bookkeeping for safe interruption recovery.
`scopeConfidence` is `stable` only when Local API supplies an explicit stable
instance identifier. Zotero 9.0.6 does not currently have to supply one, so the
builder uses `legacy:local-api:v3` with `scopeConfidence: "legacy"` rather than
inventing a profile identity.

### `libraries`

Key path: `[scopeKey, generation, libraryKey]`

```js
{
  scopeKey,
  generation,
  libraryKey,
  itemCount,
  sourceVersion,
  indexedAt
}
```

`sourceVersion` may be `null`. The index does not assume that Zotero 9's item
or library version fields reliably describe every local modification.

### `records`

Key path: `[scopeKey, generation, libraryKey, itemKey]`

Only this allowlist is persisted:

```js
{
  scopeKey,
  generation,
  libraryKey,
  itemKey,
  itemVersion,
  identifierKeys,
  titleKey,
  year,
  creatorKeys,
  itemType
}
```

`identifierKeys` contains canonical keys such as `doi:10.xxxx/xxxx`,
`pmid:123456`, `isbn:978...`, and `cnki:xxxx`. The multi-entry identifier
index supports exact identifier lookup. Exact title, library, generation, and
scope indexes are also present. Compound indexes support bounded queries and
cleanup by scope and generation.

Every read used for matching is restricted to the requested `scopeKey` and its
current `activeGeneration`. Records from another local Zotero scope or an old,
pending, or failed generation cannot participate.

## Normalization and data minimization

The record normalizer delegates DOI, PMID, ISBN, CNKI, title, creator, and year
normalization to `local-api-matcher.js`. This preserves the existing standard
mode's exact-match semantics instead of introducing another normalization
algorithm.

`titleKey` and `creatorKeys` are normalized, locally derived bibliographic
metadata used only for matching. The repository does not persist complete
Zotero item JSON, abstracts, notes, tags, attachment information, collections,
relations, full text, raw search results, search request contents, complete raw
URLs, or diagnostic logs. Unknown input fields are discarded before IndexedDB
writes.

## Generation switching

The index uses generation double buffering:

1. `beginGeneration(scopeKey)` records a new pending generation and sets the
   scope state to `building` without modifying the active generation.
2. `putRecords()` and `putLibraryMetadata()` write only to that pending
   generation. Callers may submit records in bounded chunks.
3. After every intended record and library entry has been written,
   `commitGeneration()` atomically changes only the `meta` record: the pending
   generation becomes `activeGeneration` and the state becomes `ready`.
4. `pruneOldGenerations()` removes inactive records and library metadata after
   the switch. `IndexGenerationManager.commitGeneration()` performs steps 3
   and 4 in sequence.

The active generation is never overwritten while another generation is being
built. If generation 7 is active while generation 8 is written, all queries
continue reading generation 7 until the metadata switch commits.

## Interruption and corruption recovery

Opening the repository scans `meta` for an interrupted `building` state or a
remaining `pendingGeneration`. It deletes non-active data for that scope,
retains the previous active generation, and records
`index_build_interrupted`. A scope with no prior active generation returns to
`not_built`; otherwise it returns to `ready`.

`abortGeneration()` provides the same safety for a caught build failure. The
failed generation is deleted and never becomes active.

Schema upgrades create missing stores and indexes in the IndexedDB upgrade
transaction. After opening, the repository validates store key paths, index key
paths, and the identifier index's `multiEntry` flag. A structurally invalid
database that cannot satisfy the declared schema is closed and rebuilt. This
can discard the local derived index, but not Zotero data; the future builder can
recreate the index from Zotero.

## Clear policy

- `clearLibrary(scopeKey, libraryKey)` deletes that library from every
  generation in one scope.
- `clearScope(scopeKey)` deletes all records, library metadata, and state for
  one Zotero scope.
- `clearAll()` clears every index store.
- `pruneOldGenerations(scopeKey)` deletes all non-active generations in one
  scope.

These operations affect only the extension's derived local index. They never
modify a Zotero library.

## Privacy boundary

The future index builder may receive raw Zotero item objects inside the service
worker, but it must normalize each item before calling this repository and
discard the raw object afterward. Only the allowlisted local derived metadata
above crosses the persistence boundary. Repository query results contain the
same minimal fields and must remain inside the service worker; a later indexed
backend must return only the existing minimized match result to content
scripts. Nothing in this storage layer uploads data or adds telemetry.

## Initial full-snapshot builder

`local-api-library-discovery.js` probes the fixed loopback Local API and returns
the personal library plus every accessible numeric group library. The Direct
backend owns the shared transport: endpoint validation, browser-safe API v3
headers, timeout and abort mapping, JSON-array validation, group parsing, and
the global request scheduler are not duplicated in the index modules.

`local-api-index-builder.js` reads `/items/top` sequentially in pages of 250.
Each page is filtered and normalized immediately, then written to the pending
generation before the next page is requested. Attachments, notes, annotations,
deleted records, and child records are excluded defensively. The builder does
not collect a whole library in memory and never treats `Last-Modified-Version`,
`since`, or item versions as proof of freshness. Library `sourceVersion` is
therefore stored as `null` for this full-snapshot path.

All personal and group libraries must complete before the generation switches.
A failed group, malformed response, timeout, or cancellation aborts the pending
generation and leaves the old active generation readable. Index requests use a
single independent low-priority workload lane; foreground Direct requests have
higher priority, while probe requests bypass the scheduler.

`index-build-controller.js` permits one builder at a time. Starting another
build cancels and finishes cleanup of the old task before the replacement
starts. Progress is local, count-only metadata. The background exposes
`start-index-build`, `cancel-index-build`, and `get-index-status` only to trusted
extension pages. Content scripts cannot invoke these operations or inspect
records.

## Indexed matching and standard-mode selection

Standard mode remains one user-visible mode with two internal engines:

```text
Standard Mode
├── IndexedLocalApiBackend
└── DirectLocalApiBackend
```

`standard-backend-resolver.js` selects the indexed engine only when the current
in-memory index context is `ready`, has a scope key, and has an active
generation. `not_built`, `building`, `stale`, `error`, an unavailable IndexedDB,
or a missing generation selects Direct. A legacy scope restored after a service
worker restart is hydrated as `stale`, not `ready`, because Zotero 9.0.6 does
not provide a reliable profile identity or freshness version.

The outer resolver still exposes only `auto`, `standard`, and `enhanced`:

- explicit standard uses the internal standard resolver;
- auto still probes compatible enhanced mode first, then uses the internal
  standard resolver;
- explicit enhanced never probes or falls back to standard.

`indexed-local-api-backend.js` normalizes all candidates with the existing
Local API matcher. A batch deduplicates stable candidate keys, gathers every
DOI, PMID, ISBN, CNKI, and exact-title lookup key, and calls `queryMany()` once.
The repository issues the index requests in one short read-only transaction.
The backend then applies identifier priority and the existing title/year/author
conflict rules in memory. Returned results contain no item key, library key,
title, creator, or other stored record field.

An indexed miss is complete because the active generation is a complete
snapshot. Indexed capabilities therefore advertise complete identifier, exact
title, and negative-result recall, while fuzzy title, possible match, and
realtime indexing remain false.

Direct remains available for detail checks and batches of at most 10 candidates
when no ready index exists. Larger batches return `index_required`, or
`index_building` if a build is already active, instead of launching dozens of
quicksearch requests. A missing index can trigger the existing background build
controller. Direct misses retain `complete: false` and
`reason: "direct_search_no_candidate"`.

## Next-stage integration point

The indexed standard backend now handles page checks whenever a current ready
generation exists. Later phases can add user-facing build/freshness controls
and a refresh policy. Fuzzy title, possible match, and realtime indexing remain
enhanced-mode-only capabilities.
