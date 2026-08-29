# Indexed standard backend storage

## Status and scope

This document defines the IndexedDB storage foundation for the future indexed
path of standard mode. The current phase does not call Zotero Local API, build
an index, select this repository from the backend resolver, or change page,
popup, and options behavior. `DirectLocalApiBackend` remains the standard-mode
compatibility fallback.

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
  state,
  lastSuccessfulBuildAt,
  lastAttemptAt,
  errorCode
}
```

Supported states are `not_built`, `building`, `ready`, `stale`, and `error`.
`pendingGeneration` is repository bookkeeping for safe interruption recovery.

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

## Next-stage integration point

The next phase can implement an index builder that discovers the current
personal and accessible group libraries, creates a generation, streams and
normalizes official bibliographic items in chunks, writes library metadata,
then commits through `IndexGenerationManager`. An indexed standard backend can
later call `queryByIdentifier()` and `queryByTitle()` and apply the existing
year/creator conflict rules. Until the full build commits, page checks should
remain non-blocking and use the Direct fallback. Resolver, capabilities, and UI
changes belong to later phases.
