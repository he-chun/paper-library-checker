# Public export boundary

The fresh public repository is produced only by
`scripts/create-public-export.mjs` using the version-controlled
`scripts/public-export-manifest.json` allowlist. The exporter selects tracked
files deterministically, rejects missing, duplicate, absolute, parent-traversal
and symlink inputs, canonicalizes public text to UTF-8/LF, scans exported
Markdown and JSON, and emits a redacted inventory and deterministic content-tree
hash. It does not initialize Git, configure a remote, or upload anything.

The allowlist contains production source, tests and synthetic fixtures, CI and
release tooling, required manual-verification source tools, licenses and
notices, project policies, active architecture/protocol/migration/release
documents, canonical build policy, and the versioned public release
qualification summary.

It excludes source history and PR refs, agent state, local results and raw logs,
profiles/data directories, non-public provenance material,
superseded engineering reports, failed historical PR reports, dependencies,
`dist`, and temporary artifacts. Tests must not read excluded engineering
reports; runtime-policy tests use explicitly synthetic records, and document
privacy tests scan the exported allowlist.

Every publication snapshot must rehearse the export as a local repository with
exactly one root commit and no remote, then pass tests, checks, dependency
audit, archive validation, two-build reproducibility, privacy scanning, and
Gitleaks. The versioned qualification summary records the public result without
depending on source-repository branches, review links, or internal process state.
