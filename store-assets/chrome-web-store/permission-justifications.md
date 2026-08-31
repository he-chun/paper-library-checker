# Chrome Web Store permission justifications

The 0.5.0 candidate permission set is unchanged from 0.4.1.

## `storage`

Stores ordinary extension settings and the local pairing credential. The
pairing token is stored in `chrome.storage.local` and is not sent to the
maintainer.

## `http://localhost:23119/*` and `http://127.0.0.1:23119/*`

Connect either to Zotero's built-in read-only Local API for standard-mode exact
matching or to the companion Paper Library Checker Zotero add-on for enhanced
health, indexing, and authenticated local-library matching. Both destinations
use fixed loopback hosts and port 23119.

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
