# Dual-backend architecture decision

## Status and scope

This decision introduces a browser-extension backend boundary for two connection
modes without changing the current user-visible behavior. This change only
encapsulates the existing authenticated Zotero add-on integration as the
enhanced backend. It does not implement Zotero's Local API, change the matching
protocol, or modify the Zotero add-on.

## Backend responsibilities

Every backend implements the following interface:

```text
probe()
check(candidate)
batchCheck(candidates)
getCapabilities()
```

The standard backend will eventually use Zotero's supported Local API surface
and perform any required comparison inside the extension. It is not available
in this change.

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
| `auto` | Enhanced backend |
| `enhanced` | Enhanced backend |
| `standard` | Unavailable backend with `standard_backend_unavailable` |
| Any other value | Normalize to `auto`, then use the enhanced backend |

There is no settings-page control yet. Existing installations need no
migration: absence of the field behaves as `auto`, while the endpoint remains
unchanged and the pairing token remains in `chrome.storage.local`.

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

A later change can add `browser-extension/src/backends/local-api-backend.js`
using the same IIFE/`globalThis`/CommonJS module form. It must implement the four
backend methods, expose only normalized results and capabilities, and accept
injected fetch and storage dependencies for Node tests. The resolver can then
receive that implementation as `standardBackend`; `auto` selection can be
changed only after explicit probing and fallback rules are specified and
tested.

No caller outside the resolver should branch on backend type. HMAC and pairing
remain enhanced-backend concerns, while Local API credentials and permissions
must remain standard-backend concerns.
