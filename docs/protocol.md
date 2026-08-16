# Paper Library Checker local protocol

The browser extension talks to the third-party Zotero add-on through Zotero's
HTTP loopback server at `http://127.0.0.1:23119/zotero-checker`.

## Signed request protocol

Protocol version 1 uses the long-term pairing secret only as an HMAC-SHA256 key.
The secret remains in a Zotero preference and `chrome.storage.local`; it is not
sent over HTTP.

Every request includes:

```text
X-PLC-Protocol: 1
X-PLC-Timestamp: <unix-seconds>
X-PLC-Nonce: <32 lowercase hexadecimal characters>
X-PLC-Body-SHA256: <64 lowercase hexadecimal characters>
X-PLC-Signature: <base64url HMAC-SHA256 without padding>
Content-Type: application/vnd.paper-library-checker+json
X-Zotero-Connector-API-Version: 3
```

The exact UTF-8 canonical string is:

```text
protocol-version\n
HTTP-method\n
request-path\n
timestamp\n
nonce\n
SHA-256-of-exact-raw-body-bytes
```

The request path includes `/zotero-checker`, for example
`/zotero-checker/check`. Methods are uppercase. GET `/health` signs the SHA-256
of an empty body.

The add-on allows at most 60 seconds of clock skew. Nonces contain 128 bits of
cryptographic randomness and are stored in a bounded, expiring replay cache.
The body hash and HMAC cover the exact bytes read from Zotero's raw body stream;
JSON parsing occurs only after authentication succeeds. Token rotation and
revoke clear replay and result caches and immediately invalidate the old key.

The legacy bearer header, credentials embedded anywhere in JSON,
`application/json` requests, and protocol versions other than 1 fail closed.
The production client sends only the exact `{ "item": { ... } }` or
`{ "items": [ ... ] }` envelope documented below. Bare candidates, the former
`candidate` alias, and extra top-level fields are not accepted.

## Zotero server compatibility

Source review of the official Zotero `9.0.6` tag, commit
[`7132587c2d6d56725debe64908733a8140bc6be3`](https://github.com/zotero/zotero/tree/7132587c2d6d56725debe64908733a8140bc6be3),
at
[`chrome/content/zotero/xpcom/server/server.js`](https://github.com/zotero/zotero/blob/9.0.6/chrome/content/zotero/xpcom/server/server.js)
established these runtime properties:

- Zotero logs request headers before invoking an endpoint.
- Zotero logs up to 1000 characters of bodies for `application/json`,
  `text/plain`, and `application/x-www-form-urlencoded`.
- An unrecognized custom media type is not decoded or included in that body-log
  branch; the endpoint receives `bodyInputStream`.
- `Content-Length` is required for POST, and headers plus the endpoint request
  object (`method`, `pathname`, path/search parameters, headers, and data) are
  passed to single-argument endpoints.
- The Host header is restricted to `127.0.0.1`, `[::1]`, or `localhost`, with
  an optional port.
- Browser-like requests are filtered unless an endpoint explicitly opts in or
  a recognized Zotero connector/test exception applies. This candidate uses the
  connector API-version header and restricts browser host permissions to fixed
  loopback endpoints and declared scholarly domains.
- WebCrypto-compatible globals are available to the add-on scope used here.

The protocol therefore puts only timestamp, nonce, body hash, and HMAC in
headers and uses the custom media type to keep bibliographic JSON out of the
known Zotero core body-log branch. These request signatures are short-lived and
replay-protected; the reusable pairing secret is absent.

Zotero may reject legacy `application/json` at its server layer before the
project endpoint runs. HTTP 400 or 401 is therefore the compatibility contract
for that legacy media type; a project JSON error code is not promised. The
endpoint continues to declare only
`application/vnd.paper-library-checker+json` and does not broaden Zotero's JSON
decoding or body-logging path.

Residual runtime limitation: Zotero core owns the socket and begins request
processing before the add-on endpoint runs. The add-on validates
`Content-Length` before reading from the stream itself, but cannot prove that
Zotero core allocated no resources first. A future Zotero-native pre-read size
hook would be needed for that stronger guarantee.

## Endpoints

### GET /health

Authenticated response:

```json
{ "ok": true, "version": "0.3.0", "indexReady": true }
```

### POST /check

The top-level object must contain exactly one key, `item`, whose value is an
object.

```json
{
  "item": {
    "title": "Synthetic article title",
    "DOI": "10.1000/synthetic",
    "creators": [{ "name": "Example Author" }],
    "date": "2026"
  }
}
```

Successful response:

```json
{ "status": "matched", "matchType": "doi", "confidence": 1 }
```

### POST /batch-check

The top-level object must contain exactly one key, `items`, whose value is an
array.

```json
{
  "items": [
    { "title": "Synthetic first item", "DOI": "10.1000/first" },
    { "title": "Synthetic second item" }
  ]
}
```

The default and hard batch maximum are 200. The declared request body limit is
64 KiB. Titles, identifiers, URLs, creators, cache keys, caches, and request
bursts are bounded.

After successful HMAC and exact-body verification, the add-on parses JSON and
performs a bounded iterative credential scan before validating either envelope.
At any depth, keys normalized by lowercasing and removing underscores, hyphens,
and whitespace are rejected when they equal `token`, `pairingtoken`,
`authtoken`, `secret`, `pairingsecret`, or `authorization`. Any string value
that case-insensitively equals the current pairing secret is also rejected,
regardless of its key. Ordinary values containing words such as `token`, and
unrelated keys such as `tokenizationMethod`, are not credential matches.

## Errors

Errors use stable codes and do not contain request metadata or signature
material. Relevant states include:

- 400: malformed JSON, invalid UTF-8, or invalid content length;
- 401: invalid signature, expired timestamp, replayed nonce, body mutation,
  wrong method/path, embedded or legacy authentication
  (`legacy_auth_rejected`), or protocol incompatibility;
- 413: body or batch too large;
- 422: invalid strict check/batch envelope, bounded JSON-structure violation,
  or candidate schema violation;
- 429: rate limited;
- 503: pairing not configured or index unavailable.

## Synthetic debug-log integration procedure

The repeatable local probe and scanner are maintained under
`tools/manual-verification`. They use synthetic metadata and do not upload
logs. The public qualification result is recorded in
[`verification/release-qualification-0.3.0.md`](verification/release-qualification-0.3.0.md).

Zotero 9.0.6 debug-log integration is a required real-runtime gate. Automated
tests prove tool behavior and protocol properties at the add-on boundary, but
they do not replace Zotero core-server or real-Edge integration checks.

For the first 0.3.0 public alpha, protocol qualification uses Microsoft Edge as
the only release-gated browser and requires persistence across a normal Edge
restart. Chrome smoke coverage is optional. Zotero update metadata is published
from the repository-root `updates.json`, and its XPI hash is verified against
the corresponding GitHub Release asset.

The scanner separates leakage from coverage. Absence of forbidden strings is
not sufficient: `PASS` requires same-run trace evidence bound to a schema-2
probe result and reviewed artifact checksums. Missing, stale, partial, or
mismatched evidence is `BLOCKED` with a non-zero exit code. Zotero-core coverage
binds an exact path/timestamp/nonce-or-fingerprint/body-hash tuple from one
request and does not require a separate ISO-prefixed log line. Project-log
evidence accepts bracketed or unbracketed ISO-UTC timestamps but cannot
substitute for Zotero core request coverage.
