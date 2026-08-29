# Dual-mode 0.5.0 qualification

## Decision

**Overall status: BLOCKED — do not release 0.5.0.**

The implementation under test passed the automated suite, but the required
exact-artifact Chrome/Edge, large-library, group-library, lifecycle, CNKI, and
authenticated Enhanced matrices were not available in this environment. The
version remains `0.4.1`; no 0.5.0 metadata, update manifest, release notes,
store listing, tag, or release checksum was generated.

This report distinguishes real observations from automated simulations. A
simulated benchmark is never used as evidence for a real-runtime PASS.

## Identification

| Field | Observed value |
| --- | --- |
| Commit | `811c811` |
| Branch | `feature/dual-backend-foundation` |
| Date | 2026-08-29 (Asia/Shanghai) |
| OS | Windows 10 Pro Education, NT `10.0.19045.0` |
| Chrome | `151.0.7922.174` |
| Edge | `151.0.4129.107` |
| Zotero | `9.0.6`, running |
| Additional Zotero 9.0.x | Not available — `NOT RUN` |
| Visible personal-library count | Approximately 2,978 in Zotero UI |
| Real Local API build input | 3,716 returned top-level items; 2,973 accepted bibliographic records |
| Accessible libraries discovered by build | 1 personal library, 0 groups |
| Scope confidence | `legacy` |

No item title, creator, identifier, library key, profile path, or raw Zotero
item JSON is recorded in this report.

## Automated gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | 41 locked packages installed |
| `npm test` | PASS | 342 passed, 0 failed |
| `npm run check` | PASS | 196 files checked |
| `npm run build` | PASS | XPI, extension ZIP, and checksum file created |
| `npm run inspect:artifacts` | PASS | XPI 14 entries; extension ZIP 47 entries; no data descriptors or overlaps |
| `npm run verify:release` | FAIL without tag, by design | Rejected missing `RELEASE_TAG` |
| `RELEASE_TAG=v0.4.1 npm run verify:release` | PASS | Current 0.4.1 metadata, license, archives, and checksums valid |
| 0.5.0 release verification | NOT RUN | Version correctly remains 0.4.1 while runtime gates are blocked |
| `git diff --check` | PASS | No whitespace errors |

The automated Indexed benchmark covered 1k/10k/50k records, 1/20/50/80
candidates, and 0%/25%/100% hit fixtures. It verified one transaction per
batch, bounded key lookups, and zero Zotero HTTP item searches while Indexed is
ready. These are correctness and complexity checks, not real Chrome/Edge P50 or
P95 measurements.

## Candidate artifact hashes

These hashes identify the tested **0.4.1 development artifacts**, not a 0.5.0
release candidate:

| Artifact | SHA-256 |
| --- | --- |
| `paper-library-checker-zotero-0.4.1.xpi` | `5f53fe8fcc4b829faed38ad8163ea2a26cff8177d82509272653c13f87880bb3` |
| `paper-library-checker-extension-0.4.1.zip` | `1bef8f4afe435fdca8e2ba5fd1f1162c5b38b655ed977ee4e2450500cb929297` |

## Real environment observations

| Observation | Result | Actual measurement |
| --- | --- | --- |
| Zotero 9.0.6 application running | PASS | One active Zotero window |
| Built-in Local API v3 probe | PASS | HTTP/API compatible; production backend probe 43.15 ms in the measured run |
| XPI endpoint present | PASS (presence only) | Unauthenticated `/zotero-checker/health` returned HTTP 401 in 42.88 ms |
| Authenticated Enhanced correctness/performance | BLOCKED | No reviewed candidate token/session evidence was available |
| Chrome exact candidate installed | BLOCKED | No evidence that artifact hash above was installed in a dedicated profile |
| Edge exact candidate installed | BLOCKED | No evidence that artifact hash above was installed in a dedicated profile |
| 10k/50k controlled libraries | BLOCKED | Current controlled library is approximately 2,978 formal records |
| 3/10 controlled group libraries | BLOCKED | Real discovery returned zero accessible groups |
| Additional supported Zotero 9.0.x | BLOCKED | Only 9.0.6 was available |

Windows UI inspection was stopped when concurrent user input was detected. No
further Zotero UI automation was attempted, and no Zotero data was modified.

## Real Direct measurements

All Direct candidates used deliberately absent synthetic DOI values. The
production Direct backend and real Zotero Local API were used. No returned item
data was printed or retained.

| Workload | Runs | P50 | P95 | Maximum | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| One absent DOI | 10 | 3,534.21 ms | 3,728.33 ms | 3,728.33 ms | PASS as diagnostic evidence |
| 20 absent DOI candidates | 1 | — | — | 70,086.70 ms | PASS ordering/completeness observation; insufficient for percentile |
| 50 candidates | 0 | — | — | — | NOT RUN |
| 80 candidates | 0 | — | — | — | NOT RUN |

The 20-result response preserved input cardinality/order and every returned
result was explicitly incomplete. Direct 80 is not a low-latency commitment,
but the required 80-candidate real measurement remains `NOT RUN`.

## Partial real-source index build

A diagnostic run used the production Local API source, discovery, normalizer,
builder, and generation logic against real Zotero 9.0.6. Storage was injected
Node `fake-indexeddb`, not Chrome or Edge IndexedDB.

| Input | Libraries | Processed | Indexed | Elapsed | IndexedDB size | Status |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Current personal library | 1 | 3,716 | 2,973 | 19,490.41 ms | Not measurable as browser storage | PARTIAL / not a browser PASS |

This verifies that the real Zotero source can be paged and normalized without
claiming the 10k/50k targets, browser persistence, service-worker lifecycle, or
browser IndexedDB size.

## Required performance matrix

| Engine | 1 / 20 / 50 / 80 candidates | 0% / 25% / 100% hit | 1k / 10k / 50k library | P50/P95/max | Status |
| --- | --- | --- | --- | --- | --- |
| Standard / Indexed, Chrome | Required full cross-product | Required | Required | Not measured | BLOCKED |
| Standard / Indexed, Edge | Required full cross-product | Required | Required | Not measured | BLOCKED |
| Standard / Direct | 1 and 20 partially measured | 0% only | ~2,978 only | Partial values above | BLOCKED |
| Enhanced / XPI, Chrome | Required full cross-product | Required | Required | Not measured | BLOCKED |
| Enhanced / XPI, Edge | Required full cross-product | Required | Required | Not measured | BLOCKED |

Performance targets therefore remain unqualified:

| Target | Result |
| --- | --- |
| Indexed single P95 ≤ 300 ms | NOT RUN |
| Indexed 80 at 10k P95 ≤ 2 s | NOT RUN |
| Indexed 80 at 50k maximum ≤ 5 s | NOT RUN |
| Initial 10k build ≤ 30 s | NOT RUN |
| Initial 50k build ≤ 120 s | NOT RUN |
| Indexed-ready quicksearch per candidate = 0 | PASS in automated instrumentation; real browser NOT RUN |
| Enhanced no regression from 0.4.1 | BLOCKED |

## Correctness qualification

| Case | Automated | Real exact-artifact matrix |
| --- | --- | --- |
| DOI / PMID / ISBN / CNKI | PASS | BLOCKED |
| Chinese and English exact title | PASS | BLOCKED |
| Year and creator conflict exclusion | PASS | BLOCKED |
| Cross-library duplicate | PASS | BLOCKED (no real groups) |
| All and mostly not found | PASS | BLOCKED |
| Attachment, note, annotation exclusion | PASS | PARTIAL (real build count only) |
| Failed-group isolation | PASS | BLOCKED (no real groups) |
| Indexed never returns `possible_match` | PASS | BLOCKED |
| Enhanced retains `possible_match` | PASS | BLOCKED |
| Protocol v1 unchanged | PASS | Authenticated runtime BLOCKED |

## Lifecycle qualification

| Case | Automated | Chrome | Edge |
| --- | --- | --- | --- |
| First index / refresh / clear / rebuild | PASS | NOT RUN | NOT RUN |
| Service-worker interruption | PASS | NOT RUN | NOT RUN |
| Browser restart / Zotero restart | PASS where simulatable | NOT RUN | NOT RUN |
| IndexedDB schema upgrade | PASS | NOT RUN | NOT RUN |
| Generation interruption / old-generation recovery | PASS | NOT RUN | NOT RUN |
| Group join / group exit | PASS in builder fixtures | BLOCKED | BLOCKED |
| Stale index semantics | PASS | NOT RUN | NOT RUN |
| Direct fallback and >10 batch gate | PASS | NOT RUN | NOT RUN |

## CNKI qualification

| Case | Chrome | Edge |
| --- | --- | --- |
| Chinese detail page | NOT RUN | NOT RUN |
| 20 / 50 / 80 references | NOT RUN | NOT RUN |
| Dynamic loading | NOT RUN | NOT RUN |
| Manual re-check | NOT RUN | NOT RUN |
| 0% / partial / 100% hit | NOT RUN | NOT RUN |

Automated fixtures cover CNKI extraction, dynamic batching, ordered incremental
rendering, manual re-check, and the 80-candidate limit, but they are not listed
as real site PASS results.

## Release blockers

1. Install the exact reviewed extension artifact in dedicated Chrome and Edge
   profiles and bind evidence to its SHA-256.
2. Run the Indexed performance cross-product with controlled 1k, 10k, and 50k
   libraries and record browser IndexedDB size.
3. Run personal plus 3- and 10-group configurations, including join, exit,
   duplicate, and failed-group cases.
4. Complete the real lifecycle matrix in both browsers.
5. Complete authenticated Enhanced/XPI correctness and regression timing.
6. Complete live CNKI detail and 20/50/80-reference scenarios.
7. Test Zotero 9.0.6 plus at least one additional supported Zotero 9.0.x build.

Because these are core `BLOCKED` gates, the version must remain `0.4.1` and the
0.5.0 release process stops here.
