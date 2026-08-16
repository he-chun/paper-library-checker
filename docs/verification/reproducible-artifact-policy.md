# Reproducible artifact policy

Release artifacts are built from canonical package-entry bytes, not raw
worktree bytes. Every entry is classified before packaging as canonical UTF-8
text, binary passthrough, or rejected. Unclassified entries fail the build.

Canonical text rejects a UTF-8 BOM and invalid UTF-8, converts CRLF and bare CR
to LF, and preserves all other characters, whitespace, key order, indentation,
and final-newline state. Binary data is copied byte-for-byte. The same rule
applies to Zotero, browser, LICENSE, THIRD_PARTY_NOTICES.md, and NOTICE when
present. Inputs are never modified.

The repository's `.gitattributes` and `.editorconfig` require UTF-8/LF text.
The packager remains the final enforcement boundary so artifacts are identical
even when a caller supplies LF, CRLF, or mixed-EOL source snapshots.

Every release candidate must pass byte-for-byte Ubuntu/Windows comparison,
`core.autocrlf=false/true/input` clean-checkout comparison, two-build
reproducibility, archive validators, and XPI/update closure. A hash change
invalidates exact-artifact runtime evidence and requires a new runtime gate.

Version 0.3.0 satisfied this policy: Ubuntu and Windows outputs were
byte-identical, expected hashes and XPI/update closure passed, archive
validators passed, and Gitleaks passed. Exact-artifact runtime and persistent
installation gates also passed; see
[`release-qualification-0.3.0.md`](release-qualification-0.3.0.md).
