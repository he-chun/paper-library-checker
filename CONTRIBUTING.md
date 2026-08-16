# Contributing

Thank you for helping improve Paper Library Checker.

## Before opening a change

- Use an issue for substantial behavior or protocol changes.
- Keep reference/list scanning limited to explicit site adapters.
- Do not submit browsing history, Zotero exports, copyrighted full-page HTML,
  tokens, logs, profile paths, or screenshots containing personal data.
- Create minimal synthetic fixtures and describe the selector or metadata shape
  they exercise.
- Preserve the legacy internal `ZoteroCheck` namespace, preference keys, and
  `/zotero-checker` endpoint unless a migration is included.

## Local checks

```text
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
git diff --check
```

Add tests for matcher changes, every selector change, protocol validation, and
packaging behavior. Keep commits focused and update CHANGELOG for user-visible
or breaking changes.

## Provenance

Every copied or adapted resource must include its source commit, exact license,
copyright notice, and modifications in `THIRD_PARTY_NOTICES.md`. Do not import
Zotero icons or translator code without explicit license review. Contributions
are accepted under Apache-2.0 unless explicitly stated otherwise.

## Pull requests

Explain user impact, data-flow changes, tests performed, fixture provenance,
and migration steps. A maintainer must manually verify supported sites before
merging adapter changes.
