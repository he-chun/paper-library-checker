# Paper Library Checker

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml)
[![Current release](https://img.shields.io/github/v/release/he-chun/paper-library-checker?include_prereleases&display_name=tag)](https://github.com/he-chun/paper-library-checker/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**A local-first Zotero companion that tells you whether the paper you are viewing is already saved—before you create a duplicate item.**

Paper Library Checker compares metadata from supported scholarly pages with your local Zotero 9 library and displays `Saved`, `Possible match`, or `Not saved` on the page. It is designed for CNKI and other literature-search workflows, with no telemetry and no Zotero library upload.

[Download releases](https://github.com/he-chun/paper-library-checker/releases) · [Quick start](#quick-start) · [Supported sites](#supported-sites-and-status) · [Privacy](#local-data-flow-and-privacy) · [简体中文](README.zh-CN.md)

> Alpha software: site coverage and installation details may change before the first stable release.

Zotero is a registered trademark of the Corporation for Digital Scholarship. This independent project is not affiliated with or endorsed by the Zotero project.

## Why use it?

- Check for an existing Zotero item before clicking Zotero Connector to save.
- Review CNKI articles and supported reference lists without repeatedly searching Zotero.
- Distinguish confirmed matches from fuzzy matches that need manual review.
- Keep library matching on your computer.

## Requirements and compatibility

| Component | Current support |
| --- | --- |
| Zotero desktop | Zotero 9.0.x only; 9.0.6 is the exact release-tested version. |
| Microsoft Edge | Primary release-tested browser. |
| Google Chrome | Experimental; not part of the current release gate. |
| Distribution | Manual XPI installation and an unpacked browser extension; no browser-store package. |

Paper Library Checker has two required components: a Zotero desktop add-on and a browser extension. Keep Zotero running while using it.

## Quick start

1. Open [GitHub Releases](https://github.com/he-chun/paper-library-checker/releases), select the current alpha, and download the Paper Library Checker `.xpi` and browser-extension `.zip` assets.
2. In Zotero, open **Tools > Plugins**, choose **Install Plugin From File**, select the XPI, and restart Zotero.
3. Extract the browser ZIP to a stable directory. In Edge, open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the directory that directly contains `manifest.json`.
4. In Zotero, choose **Tools > Paper Library Checker: Copy pairing token**. Open the browser extension **Options**, paste the token into **Pairing token**, click **Save**, and then **Test connection**.
5. Reload an article page. A successful test displays `Connected to Paper Library Checker <version>`.

Do not move, rename, or delete the unpacked extension directory after loading it; doing so can disable the browser extension. Users do not need to build either component from source.

## Supported sites and status

| Site or scenario | Metadata path | Article detail | Reference/list batch |
| --- | --- | --- | --- |
| CNKI Chinese | Built-in CNKI extractor | Supported and tested | Experimental |
| CNKI English | Built-in CNKI/generic extraction | Experimental | Experimental |
| MDPI | Generic citation metadata | Supported and tested | Not supported |
| ScienceDirect | Generic metadata plus a site adapter; optional local translation-server | Best effort; live access may be challenged | Best effort |
| Springer, Wiley, PubMed, arXiv, IEEE, ACM, Taylor & Francis, and DOI.org | Generic metadata; optional local translation-server | Experimental / best effort | Not supported |
| Synthetic COinS, JSON-LD, citation, and DC fixtures | Generic extractor | Automated regression coverage only | Not supported |

A domain appearing in the browser manifest means that the content script is allowed to run there; it is not by itself a claim of live-site support. Unknown sites are never scanned automatically for references. Broad article detection remains experimental and disabled by default.

The extension does not handle PDFs without usable page metadata, save records, modify the Zotero library, or promise coverage equivalent to Zotero Connector translators. Chrome remains experimental.

## How to use

### Check an article

1. Keep Zotero running. The disabled `Paper Library Checker (<version>)` item in Zotero's **Tools** menu confirms that the add-on has loaded.
2. Open an article-detail page covered by [Supported sites and status](#supported-sites-and-status).
3. Wait for a status badge near the page title or in the lower-right corner.

The extension extracts page metadata and compares it with the Zotero add-on's local in-memory index. The floating `↻` button re-checks an article, manually starts a batch check on supported list pages, and can be dragged. After saving with Zotero Connector or editing an item in Zotero, click `↻` or refresh the page.

### Toolbar popup

Select **Paper Library Checker** in the browser toolbar to see **Zotero** (`Connected` or `Offline`), **Index** (`Ready` or `Indexing`), and **Current page** (`Saved`, `Possible match`, `Not saved`, `Unrecognized`, `Not checked`, `Unsupported page`, or `Error`). **Check this page** uses the same manual-check entry point as `↻`; **Open options** opens the extension Options page.

`Unsupported page` means the extension has no content script on the active tab, such as a browser-internal page or a website outside the manifest site list. It is not a new site-support claim. Browser UI follows the browser display language; the Zotero Tools menu follows the Zotero/Gecko locale. English and Simplified Chinese are included.

### Status legend

| Page badge | Meaning |
| --- | --- |
| `Library: checking` | A check is in progress. |
| `Library: saved` | A matching item was found in the local library. |
| `Library: possible match` | A fuzzy match was found and requires manual confirmation. |
| `Library: not saved` | No match was found using the metadata supplied by the current page. |
| `Library: unrecognized` | No supported metadata was recognized. |
| `Library: choose item` | translation-server returned multiple candidates. |
| `Library: offline` | The extension could not connect to the add-on or pairing failed. |
| `Library: indexing` | The local index is not ready yet. |

Badge and page-glow colors use red for saved/matched, orange for possible matches, blue for not saved, yellow for checking/unrecognized/choice, and purple for offline/indexing/error. `Library: not saved` is not absolute proof about the entire Zotero library; it describes the result for the metadata supplied by the current page.

### Re-check after saving and list checks

The add-on listens for Zotero item additions, modifications, deletions, and trash events and updates its local index automatically. The open page does not always start a new request by itself, so click `↻` or refresh after a change.

**Auto-check reference lists** is off by default. When enabled, supported pages are checked as they load and scroll; otherwise click `↻` to start a supported list check manually. A page processes at most 80 candidates. CNKI reference/list checks are experimental, ScienceDirect is best effort, and MDPI References are not supported.

### Page glow and pairing-token actions

**Enable page edge glow** is off by default. It changes only the visual cue, and `prefers-reduced-motion` disables animation.

- **Copy pairing token** copies the current token.
- **Reset pairing token** generates and automatically copies a new token; the old token stops working.
- **Revoke pairing token** immediately revokes the current token.

After **Reset pairing token**, paste the new token in extension Options, click **Save**, and then **Test connection**. After **Revoke pairing token**, the extension cannot connect until a new token is generated and saved.

### Common problems

| Problem | What to check |
| --- | --- |
| No badge appears | Confirm that Zotero is running, the add-on is loaded, and the extension is enabled. Confirm that the domain appears in the support table and that the page exposes usable citation, DC, COinS, JSON-LD, or CNKI metadata. Refresh or click `↻`. |
| `Library: offline` | Keep the default endpoint, click **Save**, and check whether the token was reset or revoked. Click **Test connection** and copy the token again if necessary. |
| `Library: indexing` | Wait for the local index and click `↻`; restart Zotero if the status persists. |
| `Library: possible match` | This is a fuzzy title match, not a confirmed saved item. Compare the title, year, and authors in Zotero. |
| `Library: unrecognized` | The page did not provide usable supported metadata. PDF pages are especially likely to lack enough metadata. |
| Reference links are not colored | Enable **Auto-check reference lists** or click `↻`, and confirm that the page has a supported list adapter. |
| Edge extension disappears after restart | The unpacked extension directory must remain in its original location. Use **Load unpacked** again and pair again if it moved. |

## Update or uninstall

To update an existing unpacked browser installation, download the new ZIP, replace or update the files in the same stable extension directory, and click **Reload** in `edge://extensions`. Keeping the same directory normally preserves extension storage; pair again only if the extension identity or stored token changes. Install a newer Zotero XPI through **Tools > Plugins** when a manual add-on update is needed.

To uninstall cleanly:

1. In Zotero, choose **Tools > Paper Library Checker: Revoke pairing token**.
2. Remove the browser extension from `edge://extensions`.
3. Remove the Zotero add-on from **Tools > Plugins**.
4. Delete the unpacked browser-extension directory after Edge no longer lists it.

Users upgrading from a 0.2 development build should also follow [the 0.3 migration](docs/migration-0.3.md).

## How it differs from Zotero Connector

Zotero Connector saves items into Zotero. Paper Library Checker does not replace it and does not save items. It checks whether page metadata appears to match an item already in the local library, then displays a page badge or list marker so you can decide whether to save.

## FAQ

### Does Paper Library Checker work with CNKI?

Yes. CNKI Chinese article details are supported and tested. CNKI English details and CNKI reference/list checks are experimental.

### Does it upload my Zotero library?

No. Matching uses the add-on's local in-memory index. The project has no telemetry and does not upload Zotero library data. Optional translation-server integration sends only the current public page URL to a separately installed local service.

### Is this a plagiarism checker?

No. Paper Library Checker checks whether a bibliographic item already exists in Zotero. It does not inspect paper full text, calculate text similarity, or detect plagiarism; “Zotero duplicate checking” here means duplicate saved-item detection only.

## Local data flow and privacy

```text
Scholarly page DOM
    -> isolated browser content script
    -> extension service worker
    -> authenticated HTTP loopback request
    -> Zotero add-on in-memory index
    -> status / match type / confidence
```

Candidate metadata may include title, public identifiers, date, limited creator values, and the current article URL. Matching stays on loopback, and responses do not expose Zotero item IDs, keys, stored URLs, attachments, notes, collections, or unrelated library metadata.

The pairing secret is stored in `chrome.storage.local`, not sync storage. Local API requests use versioned HMAC-SHA256 authentication; the reusable secret is not sent in requests, and legacy bearer-token or token-in-JSON requests fail closed. Optional translation-server integration sends only the current public page URL to a separately installed service at `127.0.0.1:1969`. Page badges remain observable by the visited page.

See [PRIVACY.md](PRIVACY.md), [the threat model](docs/threat-model.md), and [SECURITY.md](SECURITY.md). Do not report vulnerabilities in a public issue.

## Advanced configuration

<details>
<summary>Options intended for advanced users</summary>

- `endpoint`: keep the default `http://127.0.0.1:23119/zotero-checker`.
- `translationServerMode=off`: never use translation-server.
- `translationServerMode=auto`: try translation-server only when needed on priority academic domains; fall back to the local extractor if it fails.
- `translationServerMode=always`: try translation-server first.
- `enablePageGlow`: visual result cue only; default `false`.
- `autoCheckReferenceLists`: automatic supported-site batch checks; default `false`. Manual `↻` checks remain available.
- `broadPageDetection`: article-detail detection only where the manifest already injects the extension; default `false`. It does not expand host permissions.

ScienceDirect and MDPI pages with `citation_doi` normally use the generic extractor in `auto` mode. MDPI References are not scanned. See [matching behavior](docs/matching.md), [architecture](docs/architecture.md), and the [local protocol](docs/protocol.md) for implementation details and limits.

</details>

## Release verification

<details>
<summary>Release verification and SHA-256 checksums</summary>

Version 0.4.0 is the current public alpha. Its canonical build, targeted Zotero runtime smoke, persistent Edge installation, toolbar popup, manual page check, and bilingual UI gates passed. The exact tested desktop target is Zotero 9.0.6 within the supported Zotero 9.0.x range. Microsoft Edge 151.0.4129.78 is the primary release-tested browser; Chrome remains experimental.

Download the canonical artifacts and [`SHA256SUMS.txt`](https://github.com/he-chun/paper-library-checker/releases/download/v0.4.0/SHA256SUMS.txt) from the [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0). The repository-root [`updates.json`](updates.json) is the Zotero update manifest. The public [0.3.0 release qualification](docs/verification/release-qualification-0.3.0.md) remains the historical record for the initial alpha. ScienceDirect is not claimed as a passed live-site capability because a publisher access challenge replaced the normal article DOM.

</details>

## Development

Requires Node.js 20.19 or newer.

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
```

The PowerShell compatibility entry remains available as `.\scripts\package-zotero-plugin.ps1`. Synthetic fixture policy and manual site checks are documented in [docs/test-matrix.md](docs/test-matrix.md). Architecture and protocol details are in [docs/architecture.md](docs/architecture.md) and [docs/protocol.md](docs/protocol.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Current priorities are security review, synthetic adapter regressions, and reproducible release validation. User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Copyright 2026 he-chun. Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE), the public [license decision record](docs/license-decision.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
