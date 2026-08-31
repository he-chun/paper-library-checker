# Direct Local API concurrency verification

## Scope and environment

- Date: 2026-08-28 (Asia/Shanghai)
- Branch: `feature/dual-backend-foundation`
- Starting HEAD: `54e85c2` (the prompt documented `496b17d`; the extra commit is the expert-consultation summary)
- Extension version: `0.4.1`
- Zotero: `9.0.6`, running locally
- Local API: HTTP 200, API version 3 at `http://127.0.0.1:23119/api/`
- Browser target: Chrome

The checks below used the production `DirectLocalApiBackend` against the running
Zotero Local API. The harness wrapped injected `fetch` only to count active item
requests and record synthetic workload labels. It did not print query values or
raw Zotero item JSON.

## Results

| Check | Status | Observed result |
| --- | --- | --- |
| Eight distinct title candidates, requested concurrency 99 | PASS | 8 item requests; maximum 4 concurrent; 6,950 ms wall clock; all returned incomplete Direct `not_found` |
| Two identifier-only DOI candidates | PASS | 2 item requests; maximum 1 concurrent; 5,894 ms wall clock; both returned incomplete Direct `not_found` |
| Detail priority during an eight-title reference workload | PASS | Start order `R,R,R,R,D,R,R,R,R`; detail began before queued reference requests; maximum 4 concurrent; 7,938 ms from detail submission until both workloads completed |
| Probe bypass | PASS (automated) | The native test proves a probe completes while the only item-query slot remains occupied. |
| Bounded completion / no unbounded queue growth | PASS (limited real run) | Both finite real batches completed with exactly one item request per unique candidate and no request remained active. This is not a long-duration soak test. |
| Reload the unpacked extension in `chrome://extensions` | BLOCKED | The connected Chrome automation surface prohibits navigation to browser-internal URLs, so this environment could not reload or identify the unpacked extension safely. |
| Capture the service-worker developer log after reload | NOT RUN | Depends on the blocked Chrome extension reload and a known installed development extension instance. No simulated log is presented as runtime evidence. |

These wall-clock values are measurements from this specific local library and
candidate set, not release performance guarantees. They confirm the scheduler
limits and priority behavior, but Direct mode remains a per-candidate quicksearch
fallback and is not expected to approach the enhanced in-memory index for large
batches.

## Reproducible Chrome steps still requiring a human run

1. Open `chrome://extensions`, enable Developer mode, locate the unpacked Paper
   Library Checker instance, and select **Reload**.
2. Keep Zotero 9.0.6 running with Local API enabled.
3. In extension Options, enable Developer mode and clear the log.
4. Open a supported page containing at least eight distinct references and start
   a manual reference check.
5. While it is active, open an article detail page and start a detail check.
6. Export the developer log and verify no more than four item-query start events
   lack a corresponding completion, identifier-only `everything` requests never
   overlap, and the detail request starts before queued reference work.
7. Record batch start/end timestamps and confirm a completed or failed event is
   emitted for every started request. Do not include query values or raw items in
   the committed evidence.

Until those Chrome steps are completed, this document is partial runtime
evidence rather than a full browser qualification.
