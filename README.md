# Paper Library Checker

**English** | [简体中文](README.zh-CN.md)

**A local-first Zotero browser extension that tells you whether the paper you are viewing is already saved—before you create a duplicate item.**

Paper Library Checker works on CNKI, MDPI, and other supported scholarly pages. It compares webpage metadata with your local Zotero 9 library and displays `Saved`, `Possible match`, or `Not saved` directly on the page. It helps you check whether a paper is already saved in Zotero and prevent duplicate Zotero items without telemetry or uploading your Zotero library.

[Download v0.4.0](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0) · [Quick start](#quick-start) · [Supported sites](#supported-sites-and-status) · [How it works](#local-data-flow-and-privacy) · [简体中文](README.zh-CN.md)

> Alpha software: protocol and installation details may change before the first stable release.

Zotero is a registered trademark of the Corporation for Digital Scholarship. This independent project is not affiliated with or endorsed by the Zotero project.

## Why use it?

- Your Zotero library is large enough that you sometimes forget whether you already saved a paper.
- You want to avoid duplicate items before clicking Zotero Connector to save.
- You regularly search Chinese-language literature on CNKI.
- You browse many articles and reference lists during literature or systematic reviews.
- You want library matching to happen entirely on your computer.

## Quick start

Paper Library Checker consists of a Zotero desktop add-on and a Chrome/Edge extension. Keep Zotero running while using it.

1. Download `paper-library-checker-zotero-0.4.0.xpi` and `paper-library-checker-extension-0.4.0.zip` from the [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0).
2. In Zotero 9, open **Tools > Plugins**, choose **Install Plugin From File**, select the XPI, and restart Zotero.
3. Extract the browser ZIP to a stable directory. Open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the directory that directly contains `manifest.json`.
4. In Zotero, choose **Tools > Paper Library Checker: Copy pairing token**. Open the extension **Options**, paste it into **Pairing token**, click **Save**, and then **Test connection**.
5. Reload an open article page. A successful setup displays `Connected to Paper Library Checker 0.4.0`.

Users do not need to build either component from source. The extension is not distributed through the Microsoft Edge Add-ons Store. Keep the unpacked extension directory in its original location; moving, renaming, or deleting it can disable the extension. Chrome may be used experimentally, but is not a 0.4.0 alpha release gate.

The add-on uses Zotero's HTTP server on loopback port `23119`, generates a 256-bit pairing token on first start, and stores it in a local Zotero preference. The browser stores the secret in `chrome.storage.local`; non-sensitive options use `chrome.storage.sync`. Upgrading from a 0.2 development build requires [the 0.3 migration](docs/migration-0.3.md).

## Supported sites and status

| Scenario | Article detail | Reference/list batch |
| --- | --- | --- |
| CNKI Chinese | Supported and tested | Experimental |
| CNKI English | Experimental | Experimental |
| ScienceDirect | Best effort; live access may be challenged | Best effort |
| MDPI | Supported and tested | Not supported |
| Generic COinS/JSON-LD/citation/DC | Automated regression coverage | Not supported |
| Other listed scholarly domains | Experimental / best effort | Not supported |

Chrome remains experimental. Unknown sites are never scanned automatically for references. Broad article detection remains experimental and disabled by default. The extension does not handle PDFs without usable page metadata, save records, modify the Zotero library, or promise coverage equivalent to Zotero Connector translators.

## How to use

### Check an article

1. Keep Zotero running. The disabled `Paper Library Checker (0.4.0)` item in Zotero's **Tools** menu confirms that the add-on has loaded.
2. Open an article-detail page covered by [Supported sites and status](#supported-sites-and-status).
3. Wait for a status badge near the page title or in the lower-right corner.

The extension extracts page metadata and compares it with the Zotero add-on's local in-memory index. The floating `↻` button re-checks an article, manually starts a batch check on supported list pages, and can be dragged. After saving with Zotero Connector or editing an item in Zotero, click `↻` or refresh the page.

### Toolbar popup

Select **Paper Library Checker** in the browser toolbar to see **Zotero** (`Connected` or `Offline`), **Index** (`Ready` or `Indexing`), and **Current page** (`Saved`, `Possible match`, `Not saved`, `Unrecognized`, `Not checked`, `Unsupported page`, or `Error`). **Check this page** uses the same manual-check entry point as `↻`; **Open options** opens the extension Options page.

`Unsupported page` means the extension has no content script on the active tab, such as a browser-internal page or a website outside the manifest site list. It is not a new site-support claim. The popup does not read or display the pairing token or add broad site access. Browser UI follows the browser display language; the Zotero Tools menu follows the Zotero/Gecko locale. English and Simplified Chinese are included.

### Status legend

| UI text | State |
| --- | --- |
| `Library: checking` | A check is in progress. |
| `Library: saved` | A matching item was found in the local library. |
| `Library: possible match` | A fuzzy match was found and requires manual confirmation. |
| `Library: not saved` | No match was found using the metadata supplied by the current page. |
| `Library: unrecognized` | No supported metadata was recognized. |
| `Library: choose item` | translation-server returned multiple candidates. |
| `Library: offline` | The extension could not connect to the add-on or pairing failed. |
| `Library: indexing` | The local index is not ready yet. |

Badge and page-glow colors use red for saved/matched, orange for possible matches, blue for not saved, yellow for checking/unrecognized/choice, and purple for offline/indexing/error. `Library: not saved` means that no match was found using the metadata supplied by the current page; it is not absolute proof about the entire Zotero library.

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
| No badge appears | Confirm that Zotero is running, the add-on is loaded, and the extension is enabled. Check for citation, DC, COinS, JSON-LD, or CNKI metadata. Refresh or click `↻`. `broadPageDetection` works only where the extension is already injected. |
| `Library: offline` | Keep the default endpoint, click **Save**, and check whether the token was reset or revoked. Click **Test connection** and copy the token again if necessary. |
| `Library: indexing` | Wait for the local index and click `↻`; restart Zotero if the status persists. |
| `Library: possible match` | This is a fuzzy title match, not a confirmed saved item. It requires manual confirmation in Zotero by comparing the title, year, and authors. |
| `Library: unrecognized` | The page did not provide usable supported metadata. PDF pages are especially likely to lack enough metadata. |
| Reference links are not colored | Enable **Auto-check reference lists** or click `↻`, and confirm that the page has a supported list adapter. |
| Edge extension disappears after restart | The unpacked extension directory must remain in its original location; do not move, rename, or delete it. Use **Load unpacked** again and pair again if it moved. |

## How it differs from Zotero Connector

Zotero Connector saves items into Zotero. Paper Library Checker does not replace it and does not save items. It checks whether page metadata appears to match an item already in the local library, then displays a page badge or list marker so you can decide whether to save.

## FAQ

### How do I check whether a paper is already saved in Zotero?

Keep Zotero running, open a supported article page, and read the page badge or toolbar popup. `Saved` means a match was found, `Possible match` requires manual confirmation, and `Not saved` means no match was found from that page's metadata—not absolute proof about the entire library.

### How can I prevent duplicate Zotero items?

Check the status before using Zotero Connector. Do not save when the result is `Saved`; compare the title, year, and authors in Zotero when the result is `Possible match`.

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

Candidate metadata may include title, public identifiers, date, limited creator values, and the current article URL. Match responses do not expose Zotero item IDs, keys, library metadata, stored URLs, attachments, notes, or collections. The project has no telemetry and does not upload Zotero library data.

Optional Zotero translation-server integration sends the current public page URL to a separately installed service at `127.0.0.1:1969`. All local API endpoints require a versioned HMAC-SHA256 request signature. The reusable pairing secret is never placed in a request; legacy bearer-token and token-in-JSON requests fail closed. Page badges remain observable by the visited page. See [PRIVACY.md](PRIVACY.md), [the threat model](docs/threat-model.md), and [SECURITY.md](SECURITY.md). Do not report vulnerabilities in a public issue.

## Advanced configuration

- `endpoint`: keep the default `http://127.0.0.1:23119/zotero-checker`.
- `translationServerMode=off`: never use translation-server.
- `translationServerMode=auto`: try translation-server only when needed on priority academic domains; fall back to the local extractor if it fails.
- `translationServerMode=always`: try translation-server first.
- `enablePageGlow`: visual result cue only; default `false`.
- `autoCheckReferenceLists`: automatic supported-site batch checks; default `false`. Manual `↻` checks remain available.
- `broadPageDetection`: article-detail detection only where the manifest already injects the extension; default `false`. It does not expand host permissions.

ScienceDirect and MDPI pages with `citation_doi` normally use the generic extractor in `auto` mode. MDPI References are not scanned. Creator values are deduplicated in first-seen order and capped at the protocol maximum of 20.

## Release verification

<details>
<summary>Release verification and SHA-256 checksums</summary>

Version 0.4.0 is the current public alpha. Its canonical build, targeted Zotero runtime smoke, persistent Edge installation, toolbar popup, manual page check, and bilingual UI gates passed. The exact tested desktop target is Zotero 9.0.6 within the supported Zotero 9.0.x range. Microsoft Edge 151.0.4129.78 is the primary release-tested browser; Chrome remains experimental.

| Asset | SHA-256 |
| --- | --- |
| Zotero XPI | `85cc29a5129092a759528e2ca63a6700877c3cedb1b5fe58872f52d3e1c765e7` |
| Edge extension ZIP | `dab1b40c9384b5c966a77d8d96a139bbf47dc3a059b44d75c5abecd61ca5100f` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `57700df0e04a08b6494e96ed1644859803076c97247bacce43d5e5fd7c63693f` |

Assets are distributed from the [v0.4.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.4.0), and the Zotero update manifest is the repository-root [`updates.json`](updates.json). The public [0.3.0 release qualification](docs/verification/release-qualification-0.3.0.md) remains the historical record for the initial alpha. ScienceDirect is not claimed as a passed live-site capability because a publisher access challenge replaced the normal article DOM.

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

Read [CONTRIBUTING.md](CONTRIBUTING.md). Current priorities are security review, synthetic adapter regressions, and reproducible release validation.

## License

Copyright 2026 he-chun. Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE), the public [license decision record](docs/license-decision.md), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
