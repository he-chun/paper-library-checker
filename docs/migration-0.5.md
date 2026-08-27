# Migrating to the dual-mode release

The 0.5.0 release candidate changes the default connection method to
`auto`. Existing installations require no destructive migration.

## What happens after update

- `auto` first tries a healthy, version-compatible enhanced backend and then
  falls back to Zotero's built-in Local API.
- Existing `endpoint` values remain in `chrome.storage.sync`.
- Existing pairing tokens remain in `chrome.storage.local`.
- Selecting or saving standard mode does not validate, overwrite, move, or
  delete either enhanced-mode value.
- Returning to enhanced mode restores the previously saved endpoint and token.
- Unknown mode values are treated as `auto` without rewriting the stored value,
  so downgrade and recovery remain possible.

## Recommended migration

1. Update the browser extension and keep Zotero running.
2. Open **Options** and leave **Automatic (recommended)** selected.
3. Select **Test connection**. This asks the service worker to probe the same
   backend resolver used for page checks.
4. Open the popup and confirm the reported active mode and matching capability.

Users who do not need fuzzy matching may remove or disable the companion XPI
after explicitly selecting standard mode. Users who keep the XPI and a valid
64-character token receive enhanced mode automatically. Removing the browser
extension still clears extension storage according to browser behavior.

## Downgrade

Because the enhanced endpoint and token are retained in their original storage
locations, reinstalling 0.4.1 can reuse them when the extension identity and
browser profile are unchanged. Do not run unpacked and store installations at
the same time.
