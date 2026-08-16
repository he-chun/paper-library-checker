# Third-Party Notices

This file records third-party components and notices. The project-specific work
is licensed under Apache-2.0 as stated in `LICENSE`.

## Runtime integrations

- Zotero desktop exposes the local server and add-on APIs used by this project.
  Zotero is distributed separately and is not bundled in release artifacts.
- Zotero translation-server is an optional, separately installed local service.
  It is not bundled in release artifacts.

## Build dependency

- `fflate@0.8.3` is an MIT-licensed ZIP implementation used to build and inspect
  archives. Its package code is not bundled in the XPI or extension ZIP.

## Test dependency

- `jsdom@29.1.1` is an MIT-licensed DOM test environment. It is not used at
  runtime and is not bundled in release artifacts.

Both versions are locked with integrity hashes in `package-lock.json`. Declared
licenses in the complete development/test dependency graph are Apache-2.0,
BSD-2-Clause, BSD-3-Clause, BlueOak-1.0.0, CC0-1.0, ISC, MIT, and MIT-0.
Release artifacts do not include `node_modules`.

Run `node scripts/dependency-inventory.mjs` after every lockfile update and
review any package with a missing, copyleft, or unfamiliar license before
merging.

## Test fixtures

Test fixtures are minimal synthetic HTML written for this project. They do not
contain copied article text, real browsing history, or user Zotero metadata.

## CI actions

The workflows reference these actions at full commit SHAs:

- `actions/checkout`
- `actions/setup-node`
- `actions/upload-artifact`
- `gitleaks/gitleaks-action`

They execute in GitHub Actions and are not copied into source or bundled in
release artifacts. Their upstream licenses and notices remain applicable.

## NOTICE assessment

The project does not inherit or bundle an upstream `NOTICE` file, so no root
`NOTICE` is currently required or included. The XPI and extension ZIP contain
the project `LICENSE` and this notice inventory. If a root `NOTICE` is added in
the future, the build and release gates require the same file in both archives.

## Provenance decision

The maintainer confirmed the provenance attestation with no exceptions and
approved Apache-2.0 for the repository-wide license. The signed attestation is
retained privately outside the repository; only its public decision record and
SHA-256 digest are committed. See `docs/license-decision.md`.
