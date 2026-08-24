# Chrome Web Store permission justifications

The 0.4.1 permission set is unchanged from 0.4.0.

## `storage`

Stores ordinary extension settings and the local pairing credential. The
pairing token is stored in `chrome.storage.local` and is not sent to the
maintainer.

## `http://localhost:23119/*` and `http://127.0.0.1:23119/*`

Connect to the companion Paper Library Checker Zotero add-on on the same
computer for health, indexing, and authenticated local-library matching.

## `http://localhost:1969/*` and `http://127.0.0.1:1969/*`

When the user enables it, connect to a separately installed translation-server
on the same computer to extract public bibliographic metadata from the current
public page URL.

## Explicit scholarly-site matches

The manifest explicitly lists scholarly sites where the content script may
read public bibliographic metadata from the current article page and display a
local match result. The extension does not request `<all_urls>`, collect browsing
history for the developer, intercept all network requests, or modify browser
settings. It does not request `tabs` or `activeTab`.
