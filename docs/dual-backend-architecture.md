# Dual-backend architecture decision

## Status and scope

This decision defines a browser-extension backend boundary for two connection
modes. The enhanced backend uses the authenticated Paper Library Checker Zotero
add-on. The standard backend uses Zotero's built-in read-only Local API for
single-item exact matching without requiring the project XPI. This does not
change the enhanced protocol or modify the Zotero add-on.

## Backend responsibilities

Every backend implements the following interface:

```text
probe()
check(candidate)
batchCheck(candidates)
getCapabilities()
```

The standard backend probes the fixed `/api/` loopback endpoint and queries the
personal-library items resource with local user ID `0`. It sends only GET requests with
Local API version 3 and `Zotero-Allowed-Request`. Search responses are candidate
sets, not matches: identifier, title, year, and creator values are normalized
and verified again in service-worker memory. Attachment, note, and annotation
items are excluded. Standard mode supports single-item and reference-list batch
exact matching, but it has no fuzzy-match or possible-match capability.

The standard backend enumerates every group accessible to local user ID `0`
and searches the personal library plus each group library. Title-bearing
candidates use only Zotero's lightweight `titleCreatorYear` quicksearch. The
returned records are still checked for exact DOI, PMID, ISBN, or CNKI values
before exact-title matching, so a confirmed identifier keeps confidence `1`.
Only identifier-only candidates use the slower `everything` compatibility
search. This avoids an unbounded full-text fallback after every useful title
lookup while every response remains independently reverified.

A shared scheduler permits at most six active Local API requests. Production
standard mode permits four lightweight `titleCreatorYear` requests while a
separate lane keeps identifier-only `everything` work at one active request.
Real Zotero measurements showed that concurrent full-text searches are
effectively serialized inside Zotero and can accumulate after browser-side
aborts, while a later 38-reference trace showed that serial title searches alone
took 31.253 seconds. Group-list results and successful item-query results use
bounded, expiring memory caches; item queries expire after five seconds and the
group list after thirty seconds. After an item-query timeout, further item
queries fail fast with the same stable `local_api_timeout` code for sixty seconds
instead of adding work to Zotero's queue. Within both scheduler lanes, queued
`detail` work has priority over queued `references` work without aborting active
requests. The small root API probe is independent of that scheduler, preventing
popup and Options health from waiting behind all queued item searches. Page-side automatic retries start at
sixty seconds and back off to five minutes; a user-initiated recheck remains
available. No persistent or full-library index is created.

Batch inputs use a stable normalized candidate key. Duplicate candidates share
one result, concurrent identical query URLs share one request, and results are
expanded back into input order. A failed item becomes a minimized per-item
error without rejecting the batch. Failed group queries do not prevent later
libraries from producing an exact match; without a match, an incomplete library
search returns an error instead of a false `not_found`. Active batches are keyed
by tab and a fixed workload scope: repeated identical work reuses the same
promise, changed work supersedes only the prior `detail` or `references` batch
in that tab, and the two workloads do not cancel one another. Batches from
different tabs also remain independent. Unknown workload values are rejected;
legacy callers without the optional field use a bounded `default` scope. The
content script also suppresses an identical in-flight page batch and keeps its
run serial to ignore genuinely stale responses. Automatic foreground and DOM triggers reuse the normalized
successful-batch key, so returning to a tab cannot repeat an unchanged Local API
search. Only the user's manual recheck intentionally bypasses this suppression.
While a standard reference batch is active, completed items may additionally be
delivered through a correlated service-worker-to-content-script progress message
so rows do not remain uniformly pending until the slowest query finishes. The
message contains only an input index and a minimized match result. A page-scoped
request ID rejects progress from a superseded batch or prior navigation; the
final ordered batch response remains authoritative and backward compatible.

The enhanced backend owns the existing `/zotero-checker` integration: endpoint
validation, local pairing-token access, candidate serialization, HMAC request
headers, and the authenticated `/health`, `/check`, and `/batch-check`
requests. Its check and batch results retain the existing matcher response
structures.

The service worker remains responsible for browser message routing, sender and
tab URL validation, the 200-candidate extension limit, popup health projection,
and the separately configured translation-server flow. Page-side extraction
and its 80-candidate limit are unchanged.

## Resolver rules

`connectionMode` is stored with the other synchronized extension options and
defaults to `auto`. Its allowed values and current resolution are:

| Stored value | Resolution in this change |
| --- | --- |
| `auto` | Probe enhanced first; fall back to standard when enhanced is unhealthy, incompatible, or not index-ready |
| `enhanced` | Enhanced backend |
| `standard` | Standard backend only; do not probe enhanced |
| Any other value | Normalize to `auto` |

The settings page exposes all three modes. Existing installations need no
destructive migration: absence of the field behaves as `auto`, while the
enhanced endpoint remains unchanged and the pairing token remains in
`chrome.storage.local`. Saving standard mode does not validate, overwrite, move,
or delete either enhanced value, so returning to enhanced mode is reversible.
Explicit `enhanced` never falls back, and explicit `standard` never probes the
enhanced endpoint. Successful automatic fallback includes `degradedReason` as
optional response metadata.

The standard endpoint is fixed to `http://127.0.0.1:23119/api/`; the validator
also permits the equivalent `http://localhost:23119/api/` root for injected or
future configuration. No other scheme, host, port, path, credentials, query, or
fragment is accepted. HTTP 403 becomes `local_api_disabled`; network failure,
the 30-second request timeout, incompatible API versions, and malformed JSON
have separate stable errors. These rules follow Zotero's official
[Local API documentation](https://www.zotero.org/support/dev/web_api/v3/local_api).

## Unified result boundary

Backends return normalized match results to the service worker. The service
worker preserves the existing content-script envelopes:

```text
single: { ok: true, result: <existing single match result> }
batch:  { ok: true, result: <existing batch match result> }
error:  { ok: false, error: <stable error string> }
```

The optional standard-mode progress projection uses the same minimized result
shape and does not replace or alter these final envelopes. Enhanced callers and
legacy content-script requests continue to rely only on the final response.

Popup health preserves `{ connected, indexReady }` and may add actual `mode`,
`capabilities`, `degradedReason`, and a stable repair `error`. Credentials,
endpoint details, and raw backend responses do not cross into the popup or page.
Page-check state remains owned by the content script. When the popup observes
`checking`, it polls that same tab for the minimized terminal page state with a
bounded timeout; the check action is disabled during this interval.
The Options **Test connection** action sends an extension-origin-only probe
message to this same projection instead of implementing HMAC or Local API logic.

The backend boundary is also a privacy boundary. Raw Zotero library data,
including item keys, stored URLs, attachments, notes, collections, and
unrelated records, must never be returned to a webpage. A future backend must
reduce its source data to the same match-result contract before the service
worker responds to a content script.

## LocalApiBackend extension point

`browser-extension/src/backends/local-api-backend.js` is injected into the
resolver as `standardBackend`. Matching normalization and candidate
reverification live in `local-api-matcher.js`. A later fuzzy implementation can
extend these modules without changing content-script messages, but must first
update capabilities and add bounded-query, privacy, and compatibility tests.

No caller outside the resolver should branch on backend type. HMAC and pairing
remain enhanced-backend concerns, while Local API credentials and permissions
must remain standard-backend concerns.
