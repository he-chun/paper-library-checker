# Chrome Web Store publication assets

This directory contains the maintainer-owned listing material for the published
Chrome Web Store listing of Paper Library Checker 0.4.1. It is part of the
public source export but is deliberately excluded from the production browser
extension ZIP.

The text files also contain the prepared dual-mode copy and reviewer flow for
the qualified 0.5.0 release candidate. The listing remains recorded as 0.4.1
until the 0.5.0 package is submitted and published.

- Listing status: **Published**
- Version: **0.4.1**
- Item ID: `pmfobjnkoiiplambnbbkfdlfjcbdogon`
- Store URL: https://chromewebstore.google.com/detail/paper-library-checker/pmfobjnkoiiplambnbbkfdlfjcbdogon

- `source/icon-master-1024.png` is the cleaned archival master.
- `store-icon-128.png` is the store listing icon.
- `promo-small-440x280.png` is the small promotional tile.
- `screenshots/en` contains three reviewed 1280 x 800 captures from the real
  extension UI using dedicated browser and Zotero profiles. The optional
  `screenshots/zh_CN` directory is reserved for a future localization enhancement;
  Simplified Chinese screenshots are not a publication blocker.
- The listing, privacy, permission, reviewer, provenance, and submission files
  record the published listing. The Chrome Web Store dashboard remains
  maintainer-only.

The recommended Chrome Web Store category is **Workflow & Planning** because
the extension helps researchers perform literature-management workflows more
efficiently by checking whether scholarly articles are already present in
their local Zotero library.

The reviewer XPI is available from GitHub Release v0.4.1 and its checksum was
verified against the published `SHA256SUMS.txt`.

## Store installation smoke

The maintainer completed the following minimal verification with the published
store package; this does not expand the supported-site matrix:

```text
CWS_PUBLIC_LISTING=PASS
CWS_INSTALL=PASS
CWS_VERSION_0_4_1=PASS
CWS_EXTENSION_ID_MATCH=PASS
CWS_REPAIR_TOKEN=PASS
CWS_CONNECTED_READY=PASS
CWS_ONE_PAGE_CHECK=PASS
CWS_DUPLICATE_CONTENT_SCRIPT=NONE
```

Paper Library Checker is an independent project and is not affiliated with or
endorsed by Zotero, Google Chrome, Microsoft Edge, or their publishers.

The listing constraints were checked against Chrome's official documentation:
[listing guidance](https://developer.chrome.com/docs/webstore/best-listing),
[category guidance](https://developer.chrome.com/docs/webstore/best-practices#choose-your-extensions-category-well),
[dashboard listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing),
and [image requirements](https://developer.chrome.com/docs/webstore/images).
