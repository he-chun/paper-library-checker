# Paper Library Checker

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/he-chun/paper-library-checker/actions/workflows/ci.yml)
[![Current release](https://img.shields.io/github/v/release/he-chun/paper-library-checker?include_prereleases&display_name=tag)](https://github.com/he-chun/paper-library-checker/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**A local-first Zotero companion that tells you whether the paper you are viewing is already saved—before you create a duplicate item.**

Paper Library Checker compares metadata from supported scholarly pages, including CNKI, with your local Zotero 9 library and displays `Saved`, `Possible match`, or `Not saved`. Standard mode works with Zotero's built-in Local API and needs no Paper Library Checker Zotero add-on. Enhanced mode adds faster batches, complete fuzzy matching, `Possible match`, and real-time index updates. The project has no telemetry and no Zotero library upload.

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon) · [Download releases](https://github.com/he-chun/paper-library-checker/releases) · [Quick start](#quick-start) · [Supported sites](#supported-sites-and-status) · [Privacy](#local-data-flow-and-privacy) · [简体中文](README.zh-CN.md)

> Alpha software: site coverage and installation details may change before the first stable release.

**[Install from Chrome Web Store](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon)** — the published store version is 0.4.1.

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
| Google Chrome | The Chrome Web Store is the primary public browser-extension channel. Store version 0.4.1 passed installation, connection, popup, and a representative page check. |
| Microsoft Edge | Can install the extension from the Chrome Web Store; site support remains limited to the matrix below. |
| Distribution | Install the browser extension from the Chrome Web Store. The Zotero XPI from GitHub Releases is optional and enables enhanced mode. The GitHub browser ZIP remains available for development, auditing, or manual installation. |

The browser extension and Zotero desktop are required. The companion Zotero add-on is required only for enhanced mode. Keep Zotero running while using either mode.

## Quick start

1. [Install the browser extension from the Chrome Web Store](https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon).
2. Start Zotero 9 and enable its built-in Local API if it is disabled.
3. Open the browser extension **Options**, leave **Connection method** set to **Automatic (recommended)** or choose **Standard mode**, then select **Test connection**. Standard mode needs no pairing token or XPI.
4. Open a supported article page, select the toolbar icon, and choose **Check this page**.

### Optional enhanced mode

1. Download the Zotero XPI from the [GitHub v0.4.1 Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.1). In Zotero, open **Tools > Plugins**, choose **Install Plugin From File**, and install the XPI.
2. Restart Zotero and choose **Tools > Paper Library Checker: Copy pairing token**.
3. In extension **Options**, choose **Enhanced mode** (or keep **Automatic**), expand the enhanced connection settings, paste the 64-character **Pairing token**, and select **Test connection**.

Enhanced mode provides faster reference-list batches, full fuzzy-title matching, `Possible match`, and real-time index updates.

### Manual/developer installation

For development, auditing, or a manual-installation fallback, download the
browser ZIP from the GitHub v0.4.1 Release and extract it to a stable directory.
Open `chrome://extensions` or `edge://extensions`, enable **Developer mode**,
choose **Load unpacked**, and select the directory that directly contains
`manifest.json`. Click **Reload** there after replacing files with a newer
manual ZIP. Do not move, rename, or delete the unpacked extension directory
after loading it.

### Migrating from an unpacked installation

Disable or remove the old unpacked extension before installing the Chrome Web
Store version. The store version uses the fixed extension ID
`pmfobjnkoiiplambnbbkfdlfjcbdogon`, so its storage and pairing token may not
migrate automatically from an unpacked installation. Paste the token again in
**Options**, click **Save**, and then **Test connection**. Do not enable the
unpacked and store versions at the same time; duplicate content scripts can
produce duplicate status badges or conflicting page state.

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

The extension does not handle PDFs without usable page metadata, save records, modify the Zotero library, or promise coverage equivalent to Zotero Connector translators. Publishing through the Chrome Web Store does not expand the site-support claims in this table.

## How to use

### Check an article

1. Keep Zotero running. Standard mode uses Zotero's built-in Local API. In enhanced mode, the disabled `Paper Library Checker (<version>)` item in Zotero's **Tools** menu confirms that the add-on has loaded.
2. Open an article-detail page covered by [Supported sites and status](#supported-sites-and-status).
3. Wait for a status badge near the page title or in the lower-right corner.

The extension extracts page metadata and asks the selected backend to match it. Standard mode re-validates Local API search candidates in the service worker; enhanced mode uses the add-on's local in-memory index. The floating `↻` button re-checks an article, manually starts a batch check on supported list pages, and can be dragged. After saving with Zotero Connector or editing an item in Zotero, click `↻` or refresh the page.

### Toolbar popup

Select **Paper Library Checker** in the browser toolbar to see Zotero connection state, the actual active mode, matching/index capability, current-page state, and any automatic fallback reason. When repair is needed, **Fix connection** opens the relevant Options entry point. The legacy connection and index-readiness health fields remain compatible. **Check this page** uses the same manual-check entry point as `↻`.

`Unsupported page` means the extension has no content script on the active tab, such as a browser-internal page or a website outside the manifest site list. It is not a new site-support claim. Browser UI follows the browser display language; the Zotero Tools menu follows the Zotero/Gecko locale. English and Simplified Chinese are included.

### Status legend

| Page badge | Meaning |
| --- | --- |
| `Library: checking` | A check is in progress. |
| `Library: saved` | A matching item was found in the local library. |
| `Library: possible match` | Enhanced mode found a fuzzy match that requires manual confirmation. Standard mode does not produce this state. |
| `Library: not saved` | No match was found using the metadata supplied by the current page. |
| `Library: unrecognized` | No supported metadata was recognized. |
| `Library: choose item` | translation-server returned multiple candidates. |
| `Library: offline` | The extension could not connect using the selected mode. |
| `Library: indexing` | The enhanced-mode local index is not ready yet. |

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
| `Library: offline` | Start Zotero and select **Test connection**. For standard mode, enable Zotero Local API. For enhanced mode, keep the default endpoint and copy the token again if necessary. |
| `Library: indexing` | Wait for the local index and click `↻`; restart Zotero if the status persists. |
| `Library: possible match` | This is a fuzzy title match, not a confirmed saved item. Compare the title, year, and authors in Zotero. |
| `Library: unrecognized` | The page did not provide usable supported metadata. PDF pages are especially likely to lack enough metadata. |
| Reference links are not colored | Enable **Auto-check reference lists** or click `↻`, and confirm that the page has a supported list adapter. |
| A manually loaded extension disappears after restart | The unpacked extension directory must remain in its original location. Use **Load unpacked** again and pair again if it moved. |

## Update or uninstall

Chrome Web Store installations update through the Chrome Web Store channel;
users do not need to download a ZIP to replace the store version. Downloading a
GitHub browser ZIP and clicking **Reload** in `chrome://extensions` or
`edge://extensions` applies only to manual/unpacked installations. Zotero XPI
updates continue through the current GitHub/Zotero update flow. Removing the
browser extension clears its local extension identity and storage, so a later
reinstallation may require pasting the pairing token again and testing the
connection.

To uninstall cleanly:

1. In Zotero, choose **Tools > Paper Library Checker: Revoke pairing token**.
2. Remove the browser extension from `chrome://extensions` or `edge://extensions`.
3. Remove the Zotero add-on from **Tools > Plugins**.
4. If it was installed manually, delete the unpacked browser-extension directory after the browser no longer lists it.

Users upgrading from 0.4.x should read [the dual-mode migration guide](docs/migration-0.5.md). Users upgrading from a 0.2 development build should also follow [the 0.3 migration](docs/migration-0.3.md).

## How it differs from Zotero Connector

Zotero Connector saves items into Zotero. Paper Library Checker does not replace it and does not save items. It checks whether page metadata appears to match an item already in the local library, then displays a page badge or list marker so you can decide whether to save.

## FAQ

### Does Paper Library Checker work with CNKI?

Yes. CNKI Chinese article details are supported and tested. CNKI English details and CNKI reference/list checks are experimental.

### Does it upload my Zotero library?

No. Standard mode reads only matching candidates through Zotero's built-in Local API and processes raw records inside the extension service worker. Enhanced mode uses the add-on's authenticated local in-memory index and returns minimized results. The project does not upload Zotero library data or use it for telemetry. Optional translation-server integration sends only the current public page URL to a separately installed local service.

### Is this a plagiarism checker?

No. Paper Library Checker checks whether a bibliographic item already exists in Zotero. It does not inspect paper full text, calculate text similarity, or detect plagiarism; “Zotero duplicate checking” here means duplicate saved-item detection only.

## Local data flow and privacy

```text
Scholarly page DOM -> content script -> extension service worker
    standard -> Zotero built-in Local API -> service-worker verification
    enhanced -> authenticated add-on API -> add-on in-memory index
Both return only status / match type / confidence
```

Candidate metadata may include title, public identifiers, date, limited creator values, and the current article URL. Matching stays on loopback, and responses do not expose Zotero item IDs, keys, stored URLs, attachments, notes, collections, or unrelated library metadata.

Standard mode requires no token. Raw Zotero Local API item JSON stays in service-worker memory and is not returned to the webpage, stored, logged, uploaded, or used for telemetry. Enhanced-mode pairing secrets remain in `chrome.storage.local`, not sync storage; its add-on requests use versioned HMAC-SHA256 authentication and minimized responses. Legacy bearer-token and token-in-JSON requests fail closed. Optional translation-server integration sends only the current public page URL to a separately installed service at `127.0.0.1:1969`. Page badges remain observable by the visited page.

See [PRIVACY.md](PRIVACY.md), [the threat model](docs/threat-model.md), and [SECURITY.md](SECURITY.md). Do not report vulnerabilities in a public issue.

## Advanced configuration

<details>
<summary>Options intended for advanced users</summary>

- `endpoint`: keep the default `http://127.0.0.1:23119/zotero-checker`.
- `connectionMode=auto`: prefer a healthy compatible enhanced backend, then fall back to standard mode and report the reason.
- `connectionMode=standard`: use only Zotero's built-in Local API; do not probe the add-on.
- `connectionMode=enhanced`: use only the authenticated add-on; do not fall back.
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

Version 0.4.1 is the current public alpha. Its canonical build and targeted Chrome/Zotero smoke passed, including connection, index readiness, saved and not-saved page checks, and the Options connection test. Chrome Web Store version 0.4.1 also passed store installation, re-pairing, popup readiness, and one representative page check. The exact broader runtime target from the 0.4.0 qualification remains Zotero 9.0.6 within the supported Zotero 9.0.x range and Microsoft Edge 151.0.4129.78; store publication does not extend the site-support matrix.

Download the canonical artifacts and [`SHA256SUMS.txt`](https://github.com/he-chun/paper-library-checker/releases/download/v0.4.1/SHA256SUMS.txt) from the [v0.4.1 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.1). The repository-root [`updates.json`](updates.json) is the Zotero update manifest. The public [0.3.0 release qualification](docs/verification/release-qualification-0.3.0.md) remains the historical record for the initial alpha. ScienceDirect is not claimed as a passed live-site capability because a publisher access challenge replaced the normal article DOM.

</details>

## Development

Requires Node.js 20.19 or newer.

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
npm run verify:release
```

The PowerShell compatibility entry remains available as `.\scripts\package-zotero-plugin.ps1`. Synthetic fixture policy and manual site checks are documented in [docs/test-matrix.md](docs/test-matrix.md). Architecture and protocol details are in [docs/architecture.md](docs/architecture.md) and [docs/protocol.md](docs/protocol.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Current priorities are security review, synthetic adapter regressions, and reproducible release validation. User-visible changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

Copyright 2026 he-chun. Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE), the public [license decision record](docs/license-decision.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
