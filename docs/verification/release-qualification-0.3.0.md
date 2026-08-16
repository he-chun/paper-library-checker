# Paper Library Checker 0.3.0 release qualification

Paper Library Checker 0.3.0 passed its public-alpha qualification on Zotero
9.0.6 and Microsoft Edge 151.0.4129.78.

## Canonical artifacts

| Asset | SHA-256 |
| --- | --- |
| Zotero XPI | `91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59` |
| Edge extension ZIP | `ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `9f4bc8e052e7a8325b99a84375b9d81b2a2876b24fde1797a031f18c14573420` |

## Qualification gates

| Gate | Result |
| --- | --- |
| Canonical build | PASS |
| Zotero and Edge runtime | PASS |
| Persistent native Edge installation and rollback | PASS |
| Automated tests | PASS (140 tests) |
| Ubuntu/Windows reproducibility | PASS |
| Dependency audit at high severity | PASS (0 vulnerabilities) |
| Gitleaks | PASS |
| Deterministic public export rehearsal | PASS |

Runtime qualification covered authenticated health, single and batch matching,
matching-conflict rejection, response minimization, replay and integrity error
paths, pairing-secret rotation/revocation/re-pairing, three debug-log
boundaries, normal browser restarts, native unpacked installation, removal, and
reload. Tests used isolated profiles and synthetic or public bibliographic
metadata. No private library data, account data, raw logs, or secrets are part
of this record.

## Public support scope

- Zotero 9.0.x is supported; 9.0.6 is the exact tested version.
- Microsoft Edge is the primary tested browser. The extension is installed by
  extracting the release ZIP to a stable directory and using Developer mode
  **Load unpacked**.
- CNKI Chinese article detail and MDPI article detail are supported and tested.
- CNKI English detail and CNKI reference/citation batches are experimental.
- ScienceDirect is best effort because publisher access challenges can prevent
  inspection of the normal article DOM.
- Chrome and live translation-server operation are optional and are not release
  gates.
- Generic COinS, JSON-LD, citation metadata, DC metadata, and malformed metadata
  are covered by automated regression fixtures rather than claimed as a public
  live-site matrix.

Paper Library Checker remains alpha software. It does not replace Zotero
Connector, save records, scan unsupported reference lists, or support PDFs that
lack usable page metadata.
