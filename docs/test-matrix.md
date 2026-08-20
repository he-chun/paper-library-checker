# Paper Library Checker Manual Test Matrix

Use this matrix to verify the browser extension and Zotero plugin together.
Before testing, install the Zotero plugin, reload the unpacked browser
extension, and confirm the extension options point to the local plugin endpoint.

For pages where `translationServerMode=auto` applies, follow the source
expectation in each row. Pages with embedded citation metadata can use local
extractors in auto mode even when the local Zotero translation-server is
running.

For the first 0.3.0 public alpha, CNKI Chinese detail, MDPI detail, generic
metadata fixtures, and the unknown/malformed-page behavior are required.
CNKI English detail and CNKI reference/citation batches are experimental.
ScienceDirect is best effort: a normal accessible article DOM exposes adapter
failures, while a publisher challenge or access wall is recorded separately and
does not establish a product PASS. Edge is the only release-gated browser.

| Test item | URL | Expected metadata source: extractor / translation-server | Expected identifier: DOI / title / PMID / arXiv | Zotero expected result: saved / not saved | Actual result | Notes | Performance observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zotero plugin health check | `http://127.0.0.1:23119/zotero-checker/health` | n/a | n/a | n/a | PASS (2026-08-15 final v4) | The extension Test connection used an HMAC-signed empty-body request and returned only the expected minimized health fields. | Zotero 9.0.6 and Edge 151.0.4129.78. |
| CNKI Chinese detail page | redacted public article | extractor | DOI / title | saved / not saved | PASS (2026-08-15 final v4) | `cnki-kcms` produced a valid candidate; controlled `matched` and `not_found` states both passed and reload retained one badge. | No content-script exception or visible freeze. |
| CNKI English detail page |  | extractor | DOI / title | saved / not saved | EXPERIMENTAL_NOT_ESTABLISHED | **Experimental.** No qualifying result was established; this does not gate the first alpha. |  |
| CNKI reference / citation batch checking | redacted public article | extractor | DOI / title | saved / not saved | EXPERIMENTAL_NO_LINKS | **Experimental.** The tested detail page exposed no qualifying reference/citation links; this does not gate the first alpha. | No content-script exception. |
| ScienceDirect detail page | redacted public article attempt | extractor in auto mode; translation-server in always mode or when citation metadata is missing | DOI / title | saved / not saved | BEST_EFFORT_ACCESS_CHALLENGED | The publisher challenge replaced the normal article DOM, so no live adapter PASS is claimed. | No product exception observed on the challenge page. |
| ScienceDirect References batch checking | redacted public article attempt | extractor | DOI / title | saved / not saved | BEST_EFFORT_ACCESS_CHALLENGED | The normal References DOM was unavailable behind the publisher challenge. |  |
| MDPI single article detail page | redacted public article | extractor in auto mode; translation-server in always mode or when citation metadata is missing | DOI / title | saved / not saved | PASS (2026-08-15 targeted rerun) | The generic extractor detected metadata whose repeated creator tags exceeded the protocol limit. The shared serialization boundary sent at most 20 deduplicated creators, received HTTP 200 without `invalid_creators`, rendered one non-error badge after reload, and did not scan MDPI References. | No unhandled runtime or service-worker console error observed. |
| PubMed detail page |  | translation-server | PMID / DOI / title | saved / not saved |  | With translation-server running, PubMed metadata should prefer Zotero translators. |  |
| DOI.org page |  | translation-server | DOI / title | saved / not saved |  | Use a DOI resolver page and verify redirect/resolved metadata behavior. |  |
| arXiv page |  | translation-server | arXiv / DOI / title | saved / not saved |  | Use an arXiv abstract page. Verify arXiv identifier or title matching. |  |

Generic COinS, JSON-LD, citation, and DC extraction plus malformed metadata are
required automated fixture gates. Live translation-server and Chrome smoke are
optional for this alpha.

The complete redacted result is recorded in
[`verification/final-release-gates-v4.md`](verification/final-release-gates-v4.md).

## Toolbar popup and localization smoke

Run this targeted feature smoke with Zotero 9.0.6 and the dedicated Edge
profile; it does not replace or expand the release support matrix.

| Test item | Expected result | Actual result |
| --- | --- | --- |
| Zotero 9.0.6 add-on install | Add-on installs and starts normally | PASS (2026-08-19) |
| Popup with paired Zotero | `Connected`, `Ready`, and current-page state are visible | PASS (2026-08-19) |
| Supported and unsupported pages | Supported pages show their current state; unsupported pages show an explicit message | PASS (2026-08-19) |
| **Check this page** | Reuses the page `↻` manual-check path and refreshes status | PASS (2026-08-19) |
| **Open options** | Opens the standard extension Options page | PASS (2026-08-19) |
| English browser UI | Popup, Options, badge, tooltip, and errors are English | PASS (2026-08-19) |
| Simplified Chinese browser UI | Popup, Options, badge, tooltip, and errors are Chinese | PASS (2026-08-19) |
| English Zotero UI | The Paper Library Checker Tools menu is English | PASS (2026-08-19) |
| Simplified Chinese Zotero UI | The Paper Library Checker Tools menu is Chinese | PASS (2026-08-19) |
| Token reset and re-pair | Old token fails; pasting the new token restores `Connected` | PASS (2026-08-19) |
| Edge restart persistence | Extension and popup remain installed after a normal restart | PASS (2026-08-19) — dedicated profile restarted normally; extension path, popup manifest, and local extension storage persisted |

## 0.4.0 release candidate smoke

The candidate below is distinct from the published v0.3.0 artifacts and update
channel. It uses only regenerable Zotero and Edge profiles with no private
library data.

| Test item | Expected result | Actual result |
| --- | --- | --- |
| Candidate package identity | XPI manifest and `install.rdf` report 0.4.0 and match the reviewed candidate hash | PASS (2026-08-19) |
| Zotero fresh-profile discovery | Zotero Add-on Manager discovers Paper Library Checker 0.4.0 | PASS (2026-08-19) — discovered disabled, as expected for a sideloaded add-on |
| Zotero enable and startup | Enable 0.4.0 and show the localized Tools menu | BLOCKED — action-time confirmation is required before enabling newly installed software |
| Zotero restart, disable/enable, uninstall/reinstall, and token actions | Complete the candidate lifecycle and Copy / Reset / Revoke token checks | BLOCKED — depends on enabling the exact candidate |
| Edge load-unpacked identity | The dedicated profile retains the unpacked 0.4.0 manifest, popup, service worker, and local storage | PASS (2026-08-19) |
| Edge normal restart | The dedicated Edge profile exits normally and restores the extension and storage | PASS (2026-08-19) |
| Popup, page-state, pairing, and browser-language smoke | Exercise Connected / Offline / Indexing, supported states, controls, locale switching, and re-pairing | BLOCKED — exact-candidate Zotero startup is pending |
| Authenticated matching and site smoke | Exercise health, matched/not-found, CNKI Chinese, MDPI, malformed pages, and sender negatives | BLOCKED — exact-candidate Zotero startup is pending |
