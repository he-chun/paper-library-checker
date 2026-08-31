# Standard index lifecycle manual verification

## Status

This is the real-runtime checklist for the indexed standard-mode lifecycle.
Automated and simulated tests do not satisfy these rows. At the time this
document was added, every real-runtime row below is **NOT RUN**.

## Required environments

| Environment | Required target | Status |
| --- | --- | --- |
| Zotero | 9.0.6 with Local API enabled | NOT RUN |
| Chrome | Current supported release, clean extension profile | NOT RUN |
| Edge | Current supported release, clean extension profile | NOT RUN |

Record the exact browser versions, OS, extension commit, Zotero profile used,
start/end timestamps, and whether the scope is reported as `legacy` or `stable`.
Do not include item titles, identifiers, creators, raw Local API responses, or
private filesystem paths in evidence.

## Dataset matrix

Run each applicable browser against personal-library datasets near 1,000,
10,000, and 50,000 formal top-level bibliographic items, then repeat a
representative size with 0, 3, and 10 accessible groups.

For every run record:

- full-build wall time;
- item and library counts shown in Options;
- IndexedDB size from browser storage tooling;
- detail and 80-reference check time after `ready`;
- state transitions and any stable error code.

All dataset runs: **NOT RUN**.

## Lifecycle cases

1. **First build — NOT RUN.** Clear the derived index, keep Zotero running,
   select standard mode, choose **Refresh index**, and verify
   `not_built → building → ready`. Confirm personal and group exact hits and a
   fresh complete miss.
2. **Manual refresh — NOT RUN.** Add, edit, and delete representative Zotero
   items, choose **Refresh index**, verify `refreshing`, and confirm the old
   generation remains usable until the atomic switch. Confirm the open page is
   re-checked after success.
3. **Automatic stale refresh — NOT RUN.** Make the stored successful-build time
   older than 30 minutes through a controlled test build, restart the service
   worker, and verify immediate stale-index service followed by background full
   refresh.
4. **Cancel — NOT RUN.** Cancel midway through a multi-page/group build. Verify
   the partial generation never activates and the previous generation remains
   queryable.
5. **Service-worker interruption — NOT RUN.** Terminate the worker during a
   build, reopen the extension, and verify recovery removes the pending
   generation without losing the old active generation.
6. **Browser restart — NOT RUN.** Restart Chrome/Edge after a successful build.
   Verify IndexedDB queries work without a full in-memory load and counts/time
   survive.
7. **Clear — NOT RUN.** Choose **Clear index** and verify only extension-derived
   IndexedDB data is removed; Zotero data is unchanged and large batches do not
   create a Direct-query storm.
8. **Clear and rebuild — NOT RUN.** Verify clearing is followed by one full
   build and no overlapping build tasks.
9. **Departed group — NOT RUN.** Build with an accessible group, leave/remove
   access, refresh, and verify its records disappear only after the new
   generation commits.
10. **Corruption/schema recovery — NOT RUN.** In a disposable browser profile,
    exercise the documented schema-upgrade/corruption fixture and confirm the
    derived database is rebuilt without modifying Zotero.
11. **Local API unavailable — NOT RUN.** Stop Zotero or disable Local API during
    refresh. Verify a stable error, visible degraded state, and continued old-
    generation service when one exists.

## Acceptance

The lifecycle gate passes only when Chrome and Edge complete the required
matrix on Zotero 9.0.6, counts are plausible, old-generation behavior is
observed during refresh/failure/interruption, stale misses never display an
absolute absence, no Direct storm occurs for more than 10 candidates, and no
raw Zotero record appears in page messages, logs, or extension storage.
