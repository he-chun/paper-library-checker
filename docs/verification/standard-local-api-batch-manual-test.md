# Standard Local API batch manual test

## Purpose and privacy rules

Use this procedure to validate no-XPI standard-mode matching against a real
Zotero installation. Record only versions, aggregate timing, request counts,
candidate counts, status counts, and pass/fail observations. Do not capture or
publish item JSON, item keys, group IDs, titles, creators, URLs, attachments,
notes, library names, profile paths, or debug logs containing library data.

On 2026-08-27, Zotero 9.0.6 was started for a read-only Local API check. The
record below contains only minimized results and aggregate timings. Browser
exact-artifact, group-library, CNKI page, and add/delete rows remain `NOT_RUN`.

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
- peak simultaneous Local API requests, which must be one with production
  defaults and must never exceed six in an explicitly injected stress run;
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

## Real Local API performance observation

The current real personal library is large. Deliberately absent synthetic DOI
queries were used so no real title, author, identifier, key, group, or library
name needed to be recorded.

| Scenario | Result | Elapsed |
| --- | --- | ---: |
| Local API v3 probe | PASS | 1.09 s |
| 1 absent DOI, 30-second timeout | `not_found` | 3.45–5.14 s |
| 6 absent DOIs, concurrency 1 | 6 `not_found` | 17.92 s |
| 6 absent DOIs, concurrency 2 | 6 `not_found` | 17.81 s |
| 6 absent DOIs, concurrency 3 | 6 `not_found` | 18.01 s |
| 6 absent DOIs, concurrency 6 | 6 `not_found` | 19.19 s |
| 20 absent records, temporary 10-second timeout | 20 isolated `error` | 40.11 s |
| 20 absent DOIs, production 30-second timeout | 20 `not_found` | 71.27 s |

A later developer-mode trace from the real extension showed the same asymmetry
without recording query values: one title-bearing detail check spent 633 ms in
`titleCreatorYear`, then 22.967 s in an unsuccessful DOI `everything` fallback
and 815 ms in an unsuccessful CNKI fallback, for 24.972 s total. Subsequent
reference title queries took 549–609 ms each. The full-text fallback therefore
accounted for about 92% of the detail-check latency and blocked the serial title
queue even though it produced no match.

After removing that fallback, a second real developer-mode trace contained no
`everything` requests. The one-item detail check completed in 654 ms. A batch of
38 unique references reused one cached result and sent 37 title requests
strictly one at a time; those requests totaled 31.244 seconds, with a 583 ms
median and a 3.537-second maximum. The complete batch took 31.253 seconds and
returned 10 matches, 28 not-found results, and no errors. This isolated the next
bottleneck to browser-side serialization of lightweight title queries.

The identifier-only comparison shows that this Zotero instance processes
full-text query work approximately serially. It also proved that the former
three-second timeout was too short for a real large library, so the production
default remains 30
seconds. Production now permits four concurrent title queries but retains a
one-request lane for identifier-only `everything` work. Title-bearing candidates
use only `titleCreatorYear`, and exact identifiers are reverified in returned
records. If an item query times out,
the backend rejects further item work with `local_api_timeout` for
sixty seconds, and page automatic retries back off from sixty seconds to five
minutes. These controls prevent browser-side aborts from continuously adding
full-text searches to Zotero's internal queue. Restart Zotero once before the
post-change manual run if an older extension build has already queued searches.

With the earlier production timeout, the 20-item real batch completed with no
errors and retained all 20 results. Standard mode remains suitable for exact
checks but can be much slower than enhanced mode for identifier-only misses and
large batches.

## Real-runtime result record

| Boundary | Zotero 9.0.x | Chrome | Edge | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Personal library backend | 9.0.6 | NOT_RUN | NOT_RUN | PARTIAL_PASS | Real probe and minimized absent-item checks passed; exact-artifact UI remains pending |
| Group libraries | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Record group count only |
| Large library | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Record synthetic item-count band only |
| CNKI 80-reference list | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Verify order and duplicate reuse |
| Add/delete refresh | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | Wait at least five seconds |

The real measurements demonstrate direct-query latency on a large library but
do not by themselves justify silently adding IndexedDB or a persistent
full-library index to this release. Enhanced mode already supplies the fast
indexed path. Any standard-mode persistent index requires a separate design and
privacy review after the complete Chrome/Edge matrix is recorded.
