# Threat model

## Assets

- Whether a scholarly item is present in a local Zotero library.
- Candidate page metadata and current public page URL.
- The pairing token and local endpoint configuration.
- Zotero library records and profile diagnostics.

## Trust boundaries

1. An untrusted web page provides DOM and embedded metadata to an isolated
   content script.
2. The content script sends typed messages to the extension service worker.
3. The service worker sends authenticated requests to Zotero's loopback server.
4. Optionally, the service worker sends the current public URL to a separately
   installed translation-server on loopback.

## Threats and controls

| Threat | Preconditions | Controls | Residual risk |
|---|---|---|---|
| Local process or extension queries the library oracle | Access to loopback port | HMAC-SHA256 over method/path/time/nonce/body hash, 60-second window, bounded replay cache, authenticated health/check/batch, rotation and revoke | A process that reads Zotero preferences or browser local storage can recover the key and sign requests. |
| Malicious website sends extension messages | Page controls DOM | Chrome isolated world, sender extension ID check, sender tab requirement, URL equality check, message shape and batch limits | The page can still influence metadata extracted from its DOM. |
| CSRF or DNS rebinding | Browser can reach local server | Zotero rejects unsafe browser requests without the Connector API header and validates Host; project endpoints require a valid HMAC signature and emit no wildcard CORS | Browser or Zotero platform changes require regression testing. |
| Endpoint exfiltrates token | User or sync changes endpoint | Endpoint must be HTTP loopback, contain no credentials/query/fragment, and use the exact endpoint path; token stays in local storage | A compromised extension process can bypass its own checks. |
| translation-server SSRF | Page or message supplies URL | URL must equal sender tab URL, use HTTP(S), and avoid loopback/private/link-local host literals | DNS resolution can change after validation; translation-server must enforce its own network policy. |
| Resource exhaustion | Authenticated caller sends bursts or large data | Custom raw-body media type, add-on pre-read 64 KiB content-length check, 200-item hard batch cap, field/count limits, 120 requests/10 seconds, bounded replay/result caches and cache keys | Zotero core owns the socket and starts request processing before add-on code; a native platform pre-read limit would provide a stronger guarantee. |
| Library metadata disclosure | Match result or logs are overbroad | Default response is status/matchType/confidence only; health is minimal and authenticated; logs redact and rotate | Status badge itself is a match oracle visible to the page DOM. |
| Secret or metadata leakage through sync/log/error | Normal use or failure | Secret in `storage.local`, migration removes sync copy, long-term key never transported, strict `{item}`/`{items}` envelopes, bounded deep rejection of credential keys or the secret value, custom media type avoids Zotero 9.0.6's known plain-JSON body logging branch, minimized stable errors | Zotero core logs short-lived signature headers; Zotero 9.0.6 debug-log integration remains a required real-runtime gate. Browser profile malware and clipboard managers remain out of scope. |

## Loopback assumptions

The add-on registers endpoints on Zotero's existing local HTTP server. Current
Zotero server source binds to `127.0.0.1` and validates the `Host` header against
localhost/loopback values. The add-on does not open a network listener itself.
This assumption is covered by source review and must be manually revalidated
against supported Zotero versions before each release.

## Out of scope

- A fully compromised Zotero or browser process.
- Malware with access to the user's profile, clipboard, or preference files.
- Vulnerabilities in separately installed Zotero or translation-server builds.
- Confidentiality of metadata already published by the visited article page.

## Security regression tests

Automated tests cover canonical HMAC vectors, missing/wrong/legacy/rotated and
revoked secrets, timestamp expiry, nonce replay, body mutation, method/path
binding, authenticated health, response minimization, malformed and oversized
raw input, strict envelopes, credential keys and secret values at arbitrary JSON
depth, false-positive guards, bounded iterative traversal, cache and rate bounds,
sender identity, URL equality, loopback
endpoint validation, private translation targets, project-log redaction, and
artifact contents. The synthetic Zotero debug-log toolkit and manual matrix are
documented in `docs/verification/zotero-debug-log-manual-test.md`; Zotero 9.0.6
and Edge remain the required real-runtime gate.

The first-alpha gate narrows formal live-site support to CNKI Chinese detail and
MDPI detail. CNKI English and reference/citation batches remain experimental;
ScienceDirect is best effort when a publisher challenge replaces the normal
article DOM. This support classification does not weaken sender, HMAC, logging,
matching, or artifact controls. Edge restart persistence and all three same-run
debug boundaries remain required; Chrome is optional.

The verification kit treats evidence substitution as a threat: empty or stale
logs, a result from another marker/run, incomplete protocol cases, and artifact
checksum mismatch cannot pass. Schema and trace validation improve local
evidence binding but do not make the operator-controlled result file
cryptographically unforgeable.
Exact-artifact lifecycle evidence may be reused only after hash, version,
inventory, production-code, packaging-code, native-install, and invalidation
checks. Such reuse cannot substitute for a different boundary such as Edge,
matching, logs, or sites.
