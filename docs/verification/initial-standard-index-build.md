# Initial standard index build verification

## Purpose

This checklist records real-browser verification for the first complete
personal-and-group-library snapshot built through Zotero's Local API. Automated
Node tests and simulated 50,000-item fixtures do not count as real verification.

No real run was performed as part of the implementation task. Every result
below is therefore explicitly `NOT RUN`; no simulated timing is presented as
Zotero performance evidence.

## Required environment

- Zotero: exactly 9.0.6 for the compatibility run
- Browsers: current stable Chrome and current stable Edge
- Extension: unpacked build from the reviewed commit
- Connection mode: standard
- Zotero Local API: enabled
- Developer mode: enabled only while collecting count/timing diagnostics; raw
  Zotero item JSON must not be copied into the record
- Libraries: synthetic or maintainer-controlled collections at approximately
  1,000, 10,000, and 50,000 top-level bibliographic items
- Group configurations: 0, 3, and 10 accessible groups

Record the exact Zotero/browser builds, operating system, commit, extension ZIP
SHA-256, library counts, and whether the Local API supplied an explicit stable
instance identifier.

## Measurement method

1. Close other browser profiles using the development extension.
2. Start Zotero 9.0.6 and confirm Local API is enabled.
3. Load the reviewed unpacked extension in Chrome or Edge.
4. Open the extension service-worker inspector and clear prior console output.
5. In the extension page, issue `start-index-build` through the normal UI or a
   temporary reviewed extension-page harness. Do not call Local API from the
   webpage or DevTools page context.
6. Poll `get-index-status` until `ready` or `error` and record elapsed wall time,
   processed item/library counts, and the stable error code if any.
7. In DevTools Application > IndexedDB, record the database's approximate size
   and verify records contain only the documented minimal fields.
8. Search stored values for a distinctive abstract fragment, tag, attachment
   path, collection key, relation, full URL, and raw query term. Each must be
   absent.
9. Repeat each configuration three times after clearing only the derived index.
   Report all three runs and the median; do not discard slow runs without an
   explanation.

## Build matrix

| Browser | Zotero | Personal items | Groups | Build time | IndexedDB size | Result |
| --- | --- | ---: | ---: | --- | --- | --- |
| Chrome | 9.0.6 | 1,000 | 0 | — | — | NOT RUN |
| Chrome | 9.0.6 | 10,000 | 0 | — | — | NOT RUN |
| Chrome | 9.0.6 | 50,000 | 0 | — | — | NOT RUN |
| Chrome | 9.0.6 | 10,000 | 3 | — | — | NOT RUN |
| Chrome | 9.0.6 | 50,000 | 10 | — | — | NOT RUN |
| Edge | 9.0.6 | 1,000 | 0 | — | — | NOT RUN |
| Edge | 9.0.6 | 10,000 | 3 | — | — | NOT RUN |
| Edge | 9.0.6 | 50,000 | 10 | — | — | NOT RUN |

For group runs, record both the total top-level item count and each library's
individual count. Include an item intentionally duplicated between personal
and group libraries and confirm the build completes without key collisions.

## Cancellation

Status: **NOT RUN**

1. Keep a known ready generation active.
2. Start a full 50,000-item rebuild.
3. Wait until at least two pages have been processed.
4. Send `cancel-index-build` from an extension page.
5. Confirm status leaves `building`, the pending generation is removed, and the
   previous active generation remains readable.
6. Start another build immediately and confirm only one request workload writes
   a generation at any time.

Record cancellation latency and the active/pending generation numbers before
and after cancellation.

## Service worker interruption

Status: **NOT RUN**

1. Keep a known ready generation active.
2. Start another large full build.
3. While the state is `building`, stop the extension service worker from the
   browser extensions page.
4. Restart the service worker by opening the extension page and request
   `get-index-status`.
5. Confirm startup recovery deletes the incomplete generation, preserves the
   prior active generation, and records `index_build_interrupted`.
6. Confirm no partial record from the interrupted generation participates in a
   repository query.

## Browser and Zotero restart

Status: **NOT RUN**

1. Complete a build and record its active generation and `scopeConfidence`.
2. Restart the browser only; confirm the completed generation remains present.
3. Restart Zotero only, then restart both applications.
4. For a `legacy` scope, do not claim the retained snapshot is current merely
   because version headers are unchanged. Start a full refresh and verify it
   creates and atomically switches to a new generation.
5. Add, modify, and delete controlled items between builds; confirm the next
   complete snapshot reflects every change after its final commit.

## Failure cases

| Case | Expected result | Actual result |
| --- | --- | --- |
| Local API disabled | Stable `local_api_disabled`; old generation retained | NOT RUN |
| Request timeout | Stable `local_api_timeout`; old generation retained | NOT RUN |
| Malformed JSON | Stable `local_api_malformed_response`; old generation retained | NOT RUN |
| One group fails | Entire new snapshot aborts; old generation retained | NOT RUN |
| Empty personal library, no groups | Ready empty generation | NOT RUN |
| 10 accessible groups | Every library completes before the switch | NOT RUN |

## Acceptance record

Overall real verification status: **NOT RUN**

Do not change this status to PASS until the measurements and privacy inspection
above have been performed on both Chrome and Edge with Zotero 9.0.6 and the
evidence has been reviewed.
