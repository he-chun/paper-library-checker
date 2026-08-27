# Standard Local API batch manual test

## Purpose and privacy rules

Use this procedure to validate no-XPI standard-mode matching against a real
Zotero installation. Record only versions, aggregate timing, request counts,
candidate counts, status counts, and pass/fail observations. Do not capture or
publish item JSON, item keys, group IDs, titles, creators, URLs, attachments,
notes, library names, profile paths, or debug logs containing library data.

The automated run on 2026-08-27 found Zotero installed but not running, and the
Local API was unavailable. Real-library timing was therefore not collected.
Starting Zotero can trigger user-profile activity and synchronization, so this
automated run did not start it. The real-runtime rows below remain `NOT_RUN`.

## Prerequisites

1. Use a dedicated Zotero 9.0.x test profile containing synthetic personal and
   group-library items only.
2. In Zotero advanced settings, enable communication with other applications.
3. Do not install the Paper Library Checker XPI.
4. Install the same unpacked browser-extension build in current Chrome and
   Edge test profiles.
5. Leave `connectionMode` as `auto`, or set it to `standard` through controlled
   extension storage for the explicit-mode case.
6. Open service-worker developer tools only for timing and request-count
   observation. Do not log or expand response bodies.

## Synthetic library setup

- Personal library: one DOI item, one PMID item, one ISBN item, one CNKI item,
  one exact English-title item, and one exact Chinese-title item.
- Two accessible group libraries: one duplicate of a personal-library item,
  one group-only exact match, and one same-title item with conflicting year or
  author metadata.
- Large-library profile: enough synthetic regular items to represent the
  expected production scale, plus attachment, note, and annotation children.
- CNKI fixture page: 80 visible synthetic reference candidates, including
  repeated identifiers and known matched and unmatched records.

## Functional procedure

1. Verify `/api/` probing succeeds with Local API version 3.
2. Check each personal-library synthetic item and confirm the exact match type.
3. Check the group-only item and confirm it matches without an XPI.
4. Check the duplicated personal/group item and confirm only one result is
   returned to the page.
5. Temporarily make one group unavailable, then confirm matches in other
   libraries still succeed and an otherwise unverifiable candidate receives an
   isolated error.
6. Run the CNKI reference-list check and verify no more than 80 input candidates,
   one output per input, stable ordering, and identical results for duplicates.
7. Start a second page batch before the first finishes. Confirm the earlier
   request is aborted or its response is ignored and only the current page is
   updated.
8. Add a synthetic matching item, wait at least five seconds for the query-cache
   TTL, and re-check. Confirm the result becomes `matched`.
9. Delete that item, wait at least five seconds, and re-check. Confirm the result
   becomes `not_found` unless another library contains the same item.

## Performance procedure

For 1, 20, 50, and 80 title-only candidates, and then for 80 repeated DOI
candidates, record:

- elapsed time from service-worker batch dispatch to minimized result;
- total Local API request count;
- peak simultaneous Local API requests, which must not exceed six;
- matched, not-found, and error counts;
- number of accessible group libraries;
- whether one injected timeout or failed group request affected unrelated
  candidates.

Repeat each case three times after the five-second query TTL and report median
and maximum elapsed time. Repeat in Chrome and Edge against both the small and
large synthetic-library profiles.

## Automated simulated performance record

These figures are repeatable fake-fetch measurements from Node and are not a
substitute for real Zotero timing. Each ordinary item request used a synthetic
2 ms delay; group-heavy requests used 1 ms. Assertions enforce the six-request
ceiling, result order, and request counts.

| Scenario | Elapsed | Requests | Peak concurrency |
| --- | ---: | ---: | ---: |
| 1 title-only candidate | 12.61 ms | 2 | 1 |
| 20 title-only candidates | 60.78 ms | 21 | 6 |
| 50 title-only candidates | 125.39 ms | 51 | 6 |
| 80 title-only candidates | 217.23 ms | 81 | 6 |
| 80 repeated DOI candidates | 15.63 ms | 2 | 1 |
| 20 candidates across 12 groups | 560.95 ms | 261 | 6 |
| Ordered timeout and partial-failure case | 14.24 ms | 5 | 4 |

## Real-runtime result record

| Boundary | Zotero 9.0.x | Chrome | Edge | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Personal library | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Requires dedicated synthetic profile |
| Group libraries | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Record group count only |
| Large library | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Record synthetic item-count band only |
| CNKI 80-reference list | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Verify order and duplicate reuse |
| Add/delete refresh | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Wait at least five seconds |

No persistent or full-library index is justified by simulated measurements.
Evaluate an index only in a separate design change if the completed real Zotero
matrix demonstrates unacceptable direct-query latency.
