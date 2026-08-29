# Mode capability contract

## Status

This document is the stable product contract for the three internal engines
available through the two user-visible connection modes. It does not introduce
a fourth mode and does not change the enhanced protocol v1.

## Engines and responsibilities

| Capability | Standard / Indexed | Standard / Direct | Enhanced / XPI |
| --- | --- | --- | --- |
| Project XPI required | No | No | Yes |
| Personal and accessible group libraries | Complete snapshot | Search compatibility path | Live add-on index |
| DOI, PMID, ISBN, CNKI exact verification | Yes | Yes, among returned candidates | Yes |
| Complete exact-identifier recall | Yes, while ready | No | Yes |
| Normalized exact-title verification | Yes | Yes, among returned candidates | Yes |
| Complete exact-title recall | Yes, while ready | No | Yes |
| Year and author disambiguation | Yes | Yes | Yes |
| Single-item checking | Yes | Fallback | Yes |
| Reference-list batches | Yes | Small fallback only | Yes |
| Complete negative result | Yes, while ready | No | Yes |
| Fuzzy title / `possible_match` | No | No | Yes |
| Zotero Notifier real-time updates | No | No | Yes |
| HMAC protocol v1 | No | No | Yes |
| Refresh model | Full snapshot, manual and periodic | None | Real-time in-memory updates |

Standard / Indexed is the primary XPI-free engine. Standard / Direct exists for
cold-start detail checks, small-batch fallback, index failure diagnosis, and
Local API compatibility. It is not a substitute for the complete snapshot.
Enhanced / XPI remains the only fuzzy-matching and `possible_match` engine and
provides the highest batch performance.

## Canonical capability schema

Every backend returns every field in this schema from `getCapabilities()`:

```json
{
  "mode": "standard",
  "engine": "indexed",
  "indexState": "ready",
  "freshness": "fresh",
  "exactIdentifierVerification": true,
  "completeIdentifierRecall": true,
  "exactTitleVerification": true,
  "completeTitleRecall": true,
  "fuzzyTitle": false,
  "possibleMatch": false,
  "realtimeIndex": false,
  "batch": true,
  "authenticatedProtocol": false,
  "complete": true
}
```

`browser-extension/src/common/backend-contract.js` owns the schema and its
defaults. New UI and documentation read only canonical fields. The legacy
`exactIdentifiers`, `exactTitle`, and `completeNegativeResults` fields remain
read-compatible projections of `exactIdentifierVerification`,
`exactTitleVerification`, and `complete`; they are not independent promises.

For a stale indexed generation, `engine` remains `indexed`, `indexState` and
`freshness` are `stale`, recall fields and `complete` are false, and the old
generation may continue to provide qualified hints while refresh runs.

## Result semantics

The legacy result core remains stable:

```json
{
  "status": "matched | possible_match | not_found | error",
  "matchType": "doi | pmid | isbn | cnki | title | fuzzy | null",
  "confidence": 0
}
```

Optional `mode`, `engine`, `indexState`, `freshness`, and `complete` fields state
the evidence boundary. A ready Indexed result or an XPI result has
`complete=true`; its `not_found` may be rendered as **Not saved**. A Direct or
stale result has `complete=false`; its `not_found` must be rendered as **No
match; result may be incomplete**, never as an absolute absence. A stale
positive is also labelled as based on the previous snapshot.

Standard engines never produce `possible_match`. Enhanced retains the existing
fuzzy `possible_match` response. Enhanced keeps the protocol-v1 result object
field-compatible; its capability contract supplies the completeness guarantee.
The XPI endpoint payload and protocol remain unchanged.

## Resolver order and isolation

- `auto`: healthy compatible XPI, then ready/stale Indexed, then Direct.
- `standard`: Indexed when an active generation exists, otherwise Direct. It
  never probes or uses XPI.
- `enhanced`: XPI only. It never probes or uses Indexed or Direct.

Automatic fallback reports `degradedReason`. Explicit selections never cross
the user-selected mode boundary.

## Shared page and UI boundary

Page metadata extraction, CNKI extraction, site adapters, reference discovery,
candidate deduplication, page-scoped request IDs, incremental rendering, popup,
Options, i18n, and normalized page-result states are shared. They consume the
backend-neutral result and capability contracts. No engine owns or duplicates a
page extractor. Content scripts send the existing messages to the service
worker and never contact Zotero, IndexedDB, or the XPI endpoint directly.

The privacy boundary is unchanged: raw Zotero items and minimal indexed records
remain inside the extension service worker. Pages receive only minimized match
results. Enhanced requests continue to use authenticated protocol v1.
