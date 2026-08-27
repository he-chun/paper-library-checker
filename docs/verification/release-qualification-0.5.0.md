# 0.5.0 release-candidate qualification

This file records release preparation without claiming that 0.5.0 has been
published or fully qualified. Version metadata must remain at the current
release until every automated and exact-artifact runtime gate passes.

## Automated gates

Record the final results only after the candidate implementation and documents
are complete:

| Gate | Result |
| --- | --- |
| `npm ci` | PENDING |
| `npm test` | PENDING |
| `npm run check` | PENDING |
| `npm run build` | PENDING |
| `npm run inspect:artifacts` | PENDING |
| `npm run verify:release` with candidate tag | PENDING |

## Runtime evidence collected on 2026-08-27

- Zotero 9.0.6 launched successfully on Windows.
- The real built-in Local API v3 probe succeeded in about 1.09 seconds.
- One deliberately absent DOI returned the minimized `not_found` result in
  about 3.45–5.14 seconds against the current large personal library.
- Six deliberately absent identifiers completed without errors in about
  17.8–19.2 seconds at configured concurrency 1, 2, 3, and 6. Zotero processed
  this workload approximately serially; higher client concurrency did not
  improve it.
- A 20-item run with a temporary 10-second timeout isolated 20 timeout errors in
  about 40.1 seconds. The production default was therefore raised from three to
  30 seconds before release qualification.
- With the production 30-second timeout, 20 deliberately absent DOI candidates
  completed as 20 ordered `not_found` results in about 71.27 seconds.
- No raw item JSON, item keys, titles, creators, group identifiers, or profile
  paths are included in this record.

These measurements do not justify adding a persistent browser index in this
release. Standard mode is expected to be slower than the enhanced in-memory
index on large libraries, and the UI and store text say so.

## Remaining exact-artifact runtime gates

The following remain `BLOCKED` until a maintainer installs the final unpacked
or packaged candidate in dedicated Chrome and Edge profiles and records:

- Automatic, standard, and enhanced Options selection and persistence.
- Standard-mode connection without a token or XPI.
- Enhanced-mode 64-character token validation and connection.
- Automatic enhanced preference and standard fallback reason.
- Popup active mode, capabilities, current-page state, and repair action.
- Personal and group-library single and ordered 80-item reference-list checks.
- Add/delete refresh after the five-second query cache TTL.
- Browser and service-worker consoles free of unhandled errors and raw items.

Until those gates pass, do not change product metadata to 0.5.0, generate final
update metadata, tag, upload, submit to a store, or merge to the default branch.
