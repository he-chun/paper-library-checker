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
items are excluded. The first standard backend supports single-item exact
matching only; it has no batch or fuzzy-match capability.

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

There is no settings-page control yet. Existing installations need no
migration: absence of the field behaves as `auto`, while the enhanced endpoint
remains unchanged and the pairing token remains in `chrome.storage.local`.
Explicit `enhanced` never falls back, and explicit `standard` never probes the
enhanced endpoint. Successful automatic fallback includes `degradedReason` as
optional response metadata.

The standard endpoint is fixed to `http://127.0.0.1:23119/api/`; the validator
also permits the equivalent `http://localhost:23119/api/` root for injected or
future configuration. No other scheme, host, port, path, credentials, query, or
fragment is accepted. HTTP 403 becomes `local_api_disabled`; network failure,
timeout, incompatible API versions, and malformed JSON have separate stable
errors. These rules follow Zotero's official [Local API documentation](https://www.zotero.org/support/dev/web_api/v3/local_api).

## Unified result boundary

Backends return normalized match results to the service worker. The service
worker preserves the existing content-script envelopes:

```text
single: { ok: true, result: <existing single match result> }
batch:  { ok: true, result: <existing batch match result> }
error:  { ok: false, error: <stable error string> }
```

Popup health remains the minimized `{ connected, indexReady }` projection.
Backend selection, capability details, credentials, endpoint details, and raw
responses outside that projection do not cross into the popup or page.

The backend boundary is also a privacy boundary. Raw Zotero library data,
including item keys, stored URLs, attachments, notes, collections, and
unrelated records, must never be returned to a webpage. A future backend must
reduce its source data to the same match-result contract before the service
worker responds to a content script.

## LocalApiBackend extension point

`browser-extension/src/backends/local-api-backend.js` is injected into the
resolver as `standardBackend`. Matching normalization and candidate
reverification live in `local-api-matcher.js`. A later standard-mode batch or
fuzzy implementation can extend these modules without changing content-script
messages, but must first update capabilities and add bounded-query, privacy,
and compatibility tests.

No caller outside the resolver should branch on backend type. HMAC and pairing
remain enhanced-backend concerns, while Local API credentials and permissions
must remain standard-backend concerns.
