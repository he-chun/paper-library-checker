# Dual-mode 0.5.0 qualification

## Decision

**Overall status: accepted for 0.5.0 release preparation.**

The qualified implementation described below passed the automated gates in the
canonical checkout and the maintainer-accepted real-runtime scope. Its final
release-candidate packaging uses version 0.5.0.
The maintainer accepts the residual risk outside that executed scope and will
triage future user reports against reproducible cases. An unexecuted variant is
not represented as a PASS, but this report does not enumerate every unexecuted
combination.

This decision permits release preparation. It does not create a tag, publish an
artifact, submit a store build, or merge the branch.

## Identification and provenance

| Field | Value |
| --- | --- |
| Qualified implementation commit | `9b6b42eb665650f99637f3210e4c414d3751f29f` |
| Release-preparation commit | Pending: this release-preparation commit |
| Branch | `feature/dual-backend-foundation` |
| Release version | `0.5.0` |
| Protocol | `v1` |
| Final candidate build date | 2026-08-30 (Asia/Shanghai) |
| Runtime evidence dates | 2026-08-29 to 2026-08-30 (Asia/Shanghai) |
| Runtime OS | Windows 10 Pro 22H2, build 19045.6466, AMD64 |
| Chrome | 152.0.7977.65 |
| Edge observed | 151.0.4129.107 |
| Primary Zotero runtime | 9.0.6, official Windows x64 ZIP |
| Additional diagnostic runtime | Zotero 10.0.1 |
| Returned report SHA-256 | `95bff3a03696883352e36d0adf683b8f7b2ed739f6ae0d21fcbfcea1fbedd2aa` |

The tester used a dedicated computer and disposable Zotero/browser profiles.
The returned report states that production source was not modified and that no
pairing token or raw Zotero item JSON was retained.

## Qualified development artifacts

| Artifact | SHA-256 |
| --- | --- |
| `paper-library-checker-zotero-0.4.1.xpi` | `5f53fe8fcc4b829faed38ad8163ea2a26cff8177d82509272653c13f87880bb3` |
| `paper-library-checker-extension-0.4.1.zip` | `1bef8f4afe435fdca8e2ba5fd1f1162c5b38b655ed977ee4e2450500cb929297` |

The test bundle verified all 20 of its internal SHA-256 entries. A fresh build
on the test computer reproduced both development artifacts byte for byte. The
final versioned 0.5.0 candidate artifacts are recorded separately below.

## Final 0.5.0 candidate artifacts

| Artifact | SHA-256 |
| --- | --- |
| `paper-library-checker-zotero-0.5.0.xpi` | `243e6e873f30537a7f6a8b7ec538b124f6484c67c6824c05e6edb587495253ea` |
| `paper-library-checker-extension-0.5.0.zip` | `ff06ec9c7417729d4bc396fd40ca28375b9cb5465c6882244eefd5a8a4627f18` |
| `SHA256SUMS.txt` | `672adf26931f1053736c7500213231e351b700db156757fc35ea6d5ddc785521` |
| `candidate-updates.json` | `62229d79e83615b9600f9e1f7c996270f29c236fb1b5afa0a71d00e3ad2d60ec` |

The final XPI and browser ZIP embed version 0.5.0. Candidate update metadata is
untracked build output, points to the versioned XPI, and closes over the XPI
hash above. The published root `updates.json` remains byte-for-byte unchanged
with SHA-256 `cff17b678e450cdc067d526f48c2ee6045b4cccc9ce268b122cb19e1918590c6`.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 41 locked packages installed; no reported vulnerabilities |
| `npm test` | PASS | Canonical checkout: 342 passed, 0 failed |
| `npm run check` | PASS | 197 repository files checked |
| `npm run build` | PASS | Versioned 0.5.0 XPI, browser ZIP, and checksum file built |
| `npm run generate:candidate-updates` | PASS | Generated only `dist/candidate-updates.json` |
| `npm run validate:candidate-updates` | PASS | Version 0.5.0 and XPI hash closure verified |
| `npm run inspect:artifacts` | PASS | XPI 14 entries; extension ZIP 47 entries; no descriptors or overlaps |
| `npm run validate:archives:python` | PASS | XPI 14 entries; extension ZIP 47 entries |
| `npm run validate:archives:windows` | PASS | XPI 14 entries; extension ZIP 47 entries |
| `npm run verify:release` without tag | Expected rejection | Missing `RELEASE_TAG` is rejected by design |
| `RELEASE_TAG=v0.5.0 npm run verify:release` | PASS | All five version sources and candidate archives agree at 0.5.0 |
| `git diff --check` | PASS | No whitespace errors in the canonical checkout |

The archived source handoff did not contain `.git`, so two tracked-file tests
could not run there. The exact canonical checkout passes the complete 342-test
suite; the archive limitation is not classified as a product failure.

## Standard Indexed runtime results

### Index construction and storage

| Formal records | Source items processed | Complete build samples | Median | IndexedDB size | Result |
| ---: | ---: | --- | ---: | ---: | --- |
| 1,000 | 1,250 | 1,213 / 1,169 / 1,049 / 1,220 / 1,148 ms | 1,169 ms | 3,570,688 bytes | PASS |
| 10,000 | 12,500 | 16,591 / 17,105 / 16,998 ms | 16,998 ms | 6,867,776 bytes | PASS |

The 10k median is below the 30-second qualification target. Each successful
build completed a new generation before activation.

### Indexed query performance

Single-candidate checks used complete service-worker operation windows and
nearest-rank percentiles:

| Library | Runs | P50 | P95 | Maximum | Zotero quicksearch | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1k | 20 | 2 ms | 3 ms | 4 ms | 0 | PASS |
| 10k | 20 | 2 ms | 2 ms | 4 ms | 0 | PASS |

The 10k 80-candidate reference batches used ten runs per hit rate:

| Hit rate | Runs | Expected matches | P50 | P95 | Maximum | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 0% | 10 | 0/80 | 15 ms | 31 ms | 31 ms | PASS |
| 25% | 10 | 20/80 | 14 ms | 20 ms | 20 ms | PASS |
| 100% | 10 | 80/80 | 17 ms | 28 ms | 28 ms | PASS |

All 30 batches preserved input mapping, returned no per-item errors, selected
the Standard Indexed engine, and performed zero Direct item searches. The 1k
and 10k runs also exercised ordered 1-, 20-, and 50-candidate sets at 0%,
approximately 25%, and 100% hit rates.

### Observed lifecycle behavior

- An unavailable Zotero Local API left the previous Indexed generation usable.
- Zotero restart restored the ready index without a manual rebuild.
- Full Chrome restart preserved the active generation and query behavior.
- A superseded build stopped using its incomplete generation; the replacement
  build completed and activated independently.
- Stopping the service worker during a 10k build did not replace the previous
  active generation.
- Stale/error UI retained the previous item count, library count, and last
  successful update rather than claiming that a partial build was current.

These observations agree with the automated generation, recovery, stale-state,
schema, and corruption tests.

## Direct fallback runtime results

The production Direct backend queried a real Zotero 9.0.6 Local API. Returned
results remained minimized.

| 1k workload | Runs | P50 | P95 | Maximum | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Exact synthetic hit | 10 | 209.496 ms | 265.664 ms | 265.664 ms | PASS |
| Deliberate miss | 10 | 271.728 ms | 324.571 ms | 324.571 ms | PASS |

All misses retained `complete=false`, preserving the Direct engine's incomplete
negative-result contract.

## Enhanced/XPI runtime results

The exact reviewed XPI activated in a fresh Zotero 9.0.6 profile. An unsigned
health request returned HTTP 401, then the user completed pairing through the
product UI. The recorded authenticated requests used the Enhanced backend,
protocol v1, and HTTP 200 responses without exposing the token.

| Workload | Runs | P50 | P95 | Maximum | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Exact single PMID | 10 | 7 ms | 12 ms | 12 ms | PASS |
| 80 candidates, all samples | 10 | 18 ms | 4,283 ms | 4,283 ms | PASS with retained cold start |
| 80 candidates, warm samples | 9 | 18 ms | 30 ms | 30 ms | PASS |

Every 80-candidate run returned 20 exact matches, 59 not found, one
`possible_match`, and no errors. The possible match is valid under the Enhanced
fuzzy-title contract and is not treated as a Standard exact match.

## Browser and CNKI observations

The exact extension artifact was loaded in Chrome and its service worker ran.
Real PubMed and CNKI pages showed the production Shadow DOM controls, manual
recheck behavior, refresh recovery, and consistent page/popup state.

On live CNKI pages, the extension successfully handled Chinese detail metadata,
dynamically opened reference panels, and rendered native 20- and 25-candidate
reference sets. A controlled DOM harness on the same live page exercised 50 and
80 references, progressive `checking` state, ordered final rendering, 25% and
100% Indexed hit sets, and page/popup consistency. Controlled DOM evidence is
recorded as rendering and mapping evidence, not as a claim about CNKI server
content.

## Privacy and compatibility observations

- The tested responses remained minimized and did not expose raw Zotero items
  to page scripts.
- Pairing secrets were entered only in product UI or hidden interactive input.
- Indexed-ready checks produced no Zotero item-search HTTP traffic.
- Standard Direct misses remained explicitly incomplete.
- Enhanced retained `possible_match` while Standard Indexed returned only exact
  results.
- No P0 data disclosure, active-generation replacement, or protocol v1
  regression was observed in the executed scope.

## Release acceptance

The maintainer has accepted the remaining unexecuted runtime coverage as
release risk rather than a release blocker. This is a scope decision, not a
claim that unexecuted environments passed. User-reported defects after release
will be reproduced and addressed against the affected environment.

The release-preparation change synchronizes source and candidate package
metadata at `0.5.0`. The repository-root `updates.json` intentionally remains
the published `0.4.1` channel until the formal v0.5.0 release asset is online.
