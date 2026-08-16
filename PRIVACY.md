# Privacy

Paper Library Checker is local-first. The browser extension extracts scholarly
metadata from supported pages and sends it to a Zotero add-on on the loopback
interface. The add-on compares that metadata with an in-memory index of the
local Zotero library.

## Data processed

Candidate requests may contain title, DOI, PMID, ISBN, CNKI file identifier,
publication date, a limited number of creator display values, and the article
URL. Reference-list checks send the same fields in batches.

The default response contains only match status, match type, and confidence.
It does not expose Zotero item IDs, keys, library names or IDs, stored URLs,
attachments, notes, collections, tags, or local paths.

## Where data goes

- Zotero matching requests go only to the configured HTTP loopback endpoint.
- When enabled, Zotero translation-server receives the current public HTTP(S)
  page URL at its fixed loopback endpoint. Private, local, and mismatched URLs
  are rejected by the extension.
- The project has no telemetry, analytics, advertising, crash upload, or remote
  account service.

The extension does not upload Zotero library data. A separately installed
translation-server may fetch the public page URL supplied to it; users should
review that project's behavior independently.

The first public-alpha support policy formally gates only CNKI Chinese and MDPI
article-detail live pages. CNKI English and CNKI batch behavior are
experimental, and ScienceDirect is best effort when publisher access controls
replace the article DOM. These support labels do not change the local data flow.

## Authentication data

The Zotero add-on generates a 256-bit random pairing token on first run and
stores it in a local Zotero preference. The browser extension stores the copied
token in `chrome.storage.local`. Non-sensitive preferences may use
`chrome.storage.sync`. The long-term token is not sent in HTTP headers or
bodies; it is used locally as an HMAC-SHA256 key. `/health` does not return it.
Production matching bodies contain only the strict `{item}` or `{items}`
envelope. If a credential-bearing key or a value equal to the pairing token is
embedded anywhere in JSON, the add-on rejects the request without echoing the
credential, field name, body, or location.

The Zotero Tools menu can copy, rotate/reset, or revoke the token. Revoking or
rotating immediately invalidates the previous token. Clipboard contents remain
under operating-system and clipboard-manager control after copying.

## Logs

The add-on writes a bounded local diagnostic log in the Zotero profile. Project
log calls omit library identifiers, item identifiers, item keys, titles,
authors, URLs, and pairing secrets. The current log rotates at 1 MiB and retains
one previous file. Zotero core logs HTTP headers before the add-on endpoint;
signed requests therefore expose only short-lived timestamp, nonce, body hash,
and HMAC values there. Source review of Zotero 9.0.6 confirms that the custom
request media type avoids its known plain-JSON body logging path. Zotero 9.0.6
debug-log integration passed the public 0.3.0 release qualification. No
absolute claim is made about every Zotero diagnostic path.

The local scanner must bind a clean scan to same-run evidence. A log that is
empty, stale, unrelated, or missing trace coverage is `BLOCKED`, even when no
forbidden string is found. Project-log coverage is limited to the project
logger and does not prove Zotero core request handling.
Project-log timestamps may use bracketed or unbracketed ISO-UTC form. Zotero
core coverage instead binds path, timestamp, nonce (or fingerprint), and body
hash from one request; it does not require an unrelated ISO-prefixed line.
Evidence reused from an identical artifact remains limited to its original
runtime boundary.
The alpha qualification used same-run Zotero-core, project-log, and Edge-console
scans on Zotero 9.0.6 and the reviewed Edge artifact; Chrome is not a privacy or
release qualification substitute. See
[`docs/verification/release-qualification-0.3.0.md`](docs/verification/release-qualification-0.3.0.md).

## Web-page visibility

Status badges and optional page glow are inserted into the page DOM. A page may
observe those visual state changes and infer whether the current article has
a local match. Broad page detection is disabled by default; reference-list
batch checking remains limited to explicit adapters.

## Retention and deletion

Matching caches are memory-only and expire or are cleared when the add-on stops,
the index changes, or the token rotates. Remove the extension's local storage
from the browser and revoke the Zotero token to remove pairing state.

Report privacy concerns using the private process in `SECURITY.md`.
