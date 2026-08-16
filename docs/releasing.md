# Releasing

Provenance licensing is resolved under Apache-2.0. The canonical UTF-8/LF 0.3.0
artifacts passed cross-platform build, Zotero 9.0.6 runtime, Microsoft Edge
151.0.4129.78 runtime, persistent native Edge installation, and rollback gates.
The public result is recorded in
[`verification/release-qualification-0.3.0.md`](verification/release-qualification-0.3.0.md).

For the first 0.3.0 public alpha, the required live-site scope is CNKI Chinese
article detail and MDPI article detail. Generic metadata and malformed-page
behavior are required automated gates. CNKI English and CNKI reference/citation
coverage are experimental. ScienceDirect is best effort when publisher access
challenges prevent inspection of the normal article DOM. Edge is the only
release-gated browser; Chrome and live translation-server checks are optional.

## Preparation

1. Resolve provenance and commit the exact approved LICENSE.
2. Confirm package, browser manifest, Zotero manifest, install.rdf, server health,
   and CHANGELOG use the same version.
3. Run `npm ci`, `npm test`, `npm run check`, `npm run build`,
   `npm run inspect:artifacts`, dependency audit, secret scan, and manual matrix.
4. Inspect `dist/SHA256SUMS.txt` and both archive inventories.
5. Test install, pairing, rotate/revoke/re-pair, matching, normal Edge restart,
   and rollback on a clean Edge profile with Zotero 9.0.6. Require same-run
   Zotero-core, project-log, and Edge-console debug scans. Chrome is optional.

Before announcing a release, verify that the repository-root `updates.json` is
available from the default branch, its `update_link` resolves to the tagged XPI
asset, and its `update_hash` matches the downloaded XPI exactly.

The tag workflow deliberately hard-fails before building when no recognizable
`LICENSE`, `LICENSE.txt`, `LICENSE.md`, or `COPYING` file exists. It also
requires a `vX.Y.Z` tag whose version matches package metadata, both manifests,
and `install.rdf`. The Apache-2.0 `LICENSE` satisfies only the license gate; it
does not authorize a tag, release, merge, or visibility change.

## Candidate and release

- Open a pull request and attach CI artifacts for review; do not commit `dist/`.
- After approval, merge through protected CI, create a signed `vX.Y.Z` tag, and
  run the tag workflow.
- Compare downloaded artifact checksums with CI output before creating a GitHub
  Release. Publication is a separate maintainer action.

## Rollback

Keep the previous reviewed XPI and extension ZIP plus checksums. If a regression
is found, remove the affected public artifact, document impact, restore the prior
version, rotate tokens if authentication may be affected, and publish a patch
release rather than rewriting a signed tag.
