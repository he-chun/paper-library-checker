# 0.5.0 release-candidate qualification

This document is retained as the stable link used by release and test-matrix
documentation. The authoritative dual-mode qualification record is
[`dual-mode-0.5.0-qualification.md`](dual-mode-0.5.0-qualification.md).

## Current decision

The implementation at `9b6b42e` is **accepted for the 0.5.0 release
candidate** based on the executed automated, Chrome, Zotero 9.0.6,
Standard Indexed, Direct fallback, Enhanced/XPI, lifecycle, and CNKI evidence
recorded in the authoritative report.

## Release-candidate metadata

| Field | Value |
| --- | --- |
| Release version | `0.5.0` |
| Qualified implementation commit | `9b6b42eb665650f99637f3210e4c414d3751f29f` |
| Release-preparation commit | Pending: this release-preparation commit |
| Build date | 2026-08-30 (Asia/Shanghai) |
| Zotero XPI | `paper-library-checker-zotero-0.5.0.xpi` — `243e6e873f30537a7f6a8b7ec538b124f6484c67c6824c05e6edb587495253ea` |
| Browser ZIP | `paper-library-checker-extension-0.5.0.zip` — `ff06ec9c7417729d4bc396fd40ca28375b9cb5465c6882244eefd5a8a4627f18` |

The complete validation results, accepted runtime evidence, and candidate update
manifest hash are recorded in the authoritative report linked above.

The maintainer accepts residual risk outside the executed runtime scope. An
unexecuted variant is not represented as a PASS and is not enumerated here.
Future user-reported defects will be reproduced and handled against their
affected environment.

The separate release-preparation change synchronizes the candidate metadata and
artifacts. This qualification decision does not publish an artifact, create a
tag, submit to a store, or merge the branch.
