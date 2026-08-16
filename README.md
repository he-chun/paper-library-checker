# Paper Library Checker

**English** | [简体中文](README.zh-CN.md)

**A third-party add-on for Zotero**

Paper Library Checker marks scholarly articles that are already present in a
local Zotero library. It combines a Chrome/Edge extension with a Zotero desktop
add-on and keeps library matching on the user's computer.

> Alpha software: protocol and installation details may change before the first
> stable release.

Zotero is a registered trademark of the Corporation for Digital Scholarship.
This independent project is not affiliated with or endorsed by the Zotero project.

## How it differs from Zotero Connector

Zotero Connector saves items into Zotero. Paper Library Checker does not replace
it and does not save items. It checks whether page metadata appears to match an
item already in the local library, then displays a page badge or list marker.

## Support matrix

| Scenario | Article detail | Reference/list batch |
| --- | --- | --- |
| CNKI Chinese | Supported and tested | Experimental |
| CNKI English | Experimental | Experimental |
| ScienceDirect | Best effort; live access may be challenged | Best effort |
| MDPI | Supported and tested | Not supported |
| Generic COinS/JSON-LD/citation/DC | Automated regression coverage | Not supported |
| Other listed scholarly domains | Experimental / best effort | Not supported |

Version 0.3.0 is the first public alpha. Its canonical build, Zotero runtime,
and persistent Edge installation gates passed. The exact tested desktop target
is Zotero 9.0.6 within the supported Zotero 9.0.x range. Microsoft Edge
151.0.4129.78 is the primary and only release-gated browser; Chrome remains
experimental and was not used to qualify the alpha. See the public
[release qualification](docs/verification/release-qualification-0.3.0.md).
ScienceDirect is not claimed as a passed live-site capability because a
publisher access challenge replaced the normal article DOM.

Canonical release checksums:

| Asset | SHA-256 |
| --- | --- |
| Zotero XPI | `91331ef1bcee06c34bbcadaaf956866b5c06125999da630f48f0f6837234ef59` |
| Edge extension ZIP | `ef69fec94e4ac8bb9de87b4b1c6ab42b226c50d895a6df893150da2f07dc9bd5` |
| LICENSE | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `updates.json` | `9f4bc8e052e7a8325b99a84375b9d81b2a2876b24fde1797a031f18c14573420` |

Release assets are distributed from the
[v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0).
The Zotero update manifest is the repository-root [`updates.json`](updates.json).

Unknown sites are never scanned automatically for references. Broad article
detection remains experimental and disabled by default. The extension does not
handle PDFs without usable page metadata, save records, modify the Zotero
library, or promise coverage equivalent to Zotero Connector translators.

## Local data flow

```text
Scholarly page DOM
    -> isolated browser content script
    -> extension service worker
    -> authenticated HTTP loopback request
    -> Zotero add-on in-memory index
    -> status / match type / confidence
```

Candidate metadata may include title, public identifiers, date, limited creator
values, and the current article URL. Match responses do not expose Zotero item
IDs, keys, library metadata, stored URLs, attachments, notes, or collections.
The project has no telemetry and does not upload Zotero library data.

Optional Zotero translation-server integration sends the current public page
URL to a separately installed service at `127.0.0.1:1969`. See
[PRIVACY.md](PRIVACY.md) and [the threat model](docs/threat-model.md).

## Install the Zotero add-on

1. Download `paper-library-checker-zotero-0.3.0.xpi` from the
   [v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0).
2. In Zotero 9, open **Tools > Plugins**, choose **Install Plugin From File**,
   and select the downloaded XPI.
3. Restart Zotero.

Users do not need to build the add-on from source.

The add-on uses Zotero's HTTP server on loopback port `23119`. It generates a
256-bit pairing token on first start and stores it in a local Zotero preference.

## Install and pair the browser extension

1. Download `paper-library-checker-extension-0.3.0.zip` from the
   [v0.3.0 GitHub Release](https://github.com/he-chun/paper-library-checker/releases/tag/v0.3.0).
2. Extract it to a stable directory that will not be moved or deleted.
3. Open `edge://extensions` and enable **Developer mode**.
4. Choose **Load unpacked** and select the extracted directory that directly
   contains `manifest.json`.
5. In Zotero, choose **Tools > Paper Library Checker: Copy pairing token**.
6. Open extension options, paste the token into **Pairing token**, and save.
7. Reload an open article page.

The extension is not distributed through the Microsoft Edge Add-ons Store.
Chrome may be used experimentally, but is not a 0.3.0 alpha release gate.

The browser stores the secret in `chrome.storage.local`. Non-sensitive options
use `chrome.storage.sync`. The Zotero Tools menu can reset or revoke the token.
Upgrading from a 0.2 development build requires
[the 0.3 migration](docs/migration-0.3.md).

## Options

- `translationServerMode`: `off`, `auto`, or `always`.
- `enablePageGlow`: optional saved-state page edge; default `false`.
- `autoCheckReferenceLists`: automatic supported-site batch checks; default `false`.
- `broadPageDetection`: article-detail detection on the supported websites where
  this extension is injected; default `false`. It does not grant access to sites
  outside the manifest.

ScienceDirect and MDPI pages with `citation_doi` normally use the generic
extractor in `auto` mode. `always` forces translation-server first. MDPI
References are not scanned. Before local API serialization, creator values from
all extractor and translation-server paths are deduplicated in first-seen order
and capped at the protocol maximum of 20; the Zotero service still rejects
direct requests above that limit.

## Development

Requires Node.js 20.19 or newer.

```powershell
npm ci
npm test
npm run check
npm run build
npm run inspect:artifacts
```

The PowerShell compatibility entry remains available:

```powershell
.\scripts\package-zotero-plugin.ps1
```

Synthetic fixture policy and manual site checks are documented under `test/`
and [docs/test-matrix.md](docs/test-matrix.md). Architecture and protocol details
are in [docs/architecture.md](docs/architecture.md) and
[docs/protocol.md](docs/protocol.md).

## Privacy and security

All local API endpoints require a versioned HMAC-SHA256 request signature over
the method, path, timestamp, nonce, and exact body hash. The reusable pairing
secret is never placed in a request. Legacy bearer-token and token-in-JSON
requests fail closed. Requests and caches are bounded, responses are minimized,
and project logs redact secrets and rotate locally. Release qualification used
Zotero 9.0.6 and a clean Microsoft Edge profile, including persistent native
installation and normal Edge restarts. Page badges remain observable by the
visited page; this boundary is documented in
[PRIVACY.md](PRIVACY.md).

Do not report vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License status

Copyright 2026 he-chun. Licensed under the Apache License, Version 2.0.
See [LICENSE](LICENSE), the public
[license decision record](docs/license-decision.md), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Current priorities are security review,
synthetic adapter regressions, and reproducible release validation.
