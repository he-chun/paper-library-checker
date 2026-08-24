# Chrome Web Store submission checklist

These are maintainer/dashboard actions. This repository task does not log in to
the Chrome Web Store dashboard or mark them complete.

Repository-prepared evidence:

- [x] Three reviewed English screenshots from the real UI are present at 1280 x 800.
- [x] The minimal Chrome/Zotero smoke completed without an unhandled error.
- [ ] Optional Simplified Chinese screenshots may be added as a later localization enhancement.
- [x] GitHub Release v0.4.1 and its reviewer XPI are public and hash-verified.
- [ ] No browser ZIP has been uploaded to the Chrome Web Store dashboard.

- [ ] Chrome Web Store developer account is registered.
- [ ] Contact email is verified.
- [ ] Account security settings are complete.
- [x] GitHub Release v0.4.1 exists.
- [x] Reviewer XPI link is accessible and its SHA-256 matches the release checksum.
- [x] The 0.4.1 Chrome ZIP SHA-256 has been checked.
- [ ] Manifest name, version, description, and icons are correct.
- [ ] `manifest.json` is at the ZIP root.
- [ ] Production icons 16, 32, 48, and 128 are in the ZIP.
- [ ] Store icon is a 128 × 128 PNG.
- [ ] At least one real 1280 x 800 screenshot is uploaded to the dashboard.
- [ ] English and Simplified Chinese listing text is filled in consistently.
- [ ] Category is selected.
- [ ] Privacy practices are filled in.
- [ ] Permission justifications are filled in.
- [ ] Remote code is set to **No**.
- [ ] Privacy Policy URL is accessible.
- [ ] Distribution is selected.
- [ ] Reviewer instructions are filled in.
- [ ] Maintainer has decided whether to use deferred publishing.
- [ ] The Chrome Web Store item ID assigned after first upload is recorded.
- [ ] README gains a Chrome Web Store install link only after the listing is actually live.

Hard submission gate: do not submit for Chrome Web Store review until the
GitHub v0.4.1 Release and reviewer XPI actually exist and their hashes have
been verified.
