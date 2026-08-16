# Migrating to 0.3.0

Paper Library Checker `0.3.x` supports Zotero `9.0.x` only. Zotero 7 and Zotero 8 are unsupported; Zotero 10 beta is unsupported and has not been tested. The verified runtime target for this migration is Zotero `9.0.6`.

Version `0.2.0` was a pre-release development build. Upgrade the Zotero XPI
and browser extension together to `0.3.0`, then confirm pairing again. The HMAC
protocol and local-first privacy model are retained.

The `0.3.0` local API accepts only `{ "item": { ... } }` for `/check` and
`{ "items": [ ... ] }` for `/batch-check`. The former `candidate` alias and
bare-candidate body are no longer accepted. Production clients never place the
pairing secret in business JSON; credential-bearing keys or any JSON value that
equals the current pairing secret fail closed with `legacy_auth_rejected`.

The production XPI retains `install.rdf`, `chrome.manifest`, and `defaults/preferences/prefs.js`. A Zotero 9 manifest-only diagnostic package passed initial activation but failed the disable/enable lifecycle, so those files were not removed without evidence.
