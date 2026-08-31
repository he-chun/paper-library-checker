# Chrome Web Store reviewer instructions

Paper Library Checker has no external account, paid service, or
maintainer-operated server requirement. Standard mode requires Zotero 9.0.x but
does not require the companion add-on.

1. Install Zotero 9.0.x.
2. Start Zotero and enable its built-in Local API if disabled.
3. Open extension **Options**, choose **Standard mode**, and select **Test connection**. No token is required.
4. Open the popup and confirm **Connected**, **Standard**, and **Exact matching and batch**.
5. Open a supported public scholarly article page and choose **Check this page**.
6. Observe **Saved**, **Not saved**, or **Unrecognized**. Standard mode does not claim Possible match.

To review optional enhanced mode:

1. Download the companion XPI from the candidate GitHub Release, install it via
   **Tools → Plugins → Install Plugin From File**, and restart Zotero.
2. Choose **Paper Library Checker: Copy pairing token** in Zotero's Tools menu.
3. In extension Options choose **Enhanced mode**, paste the 64-character token,
   save, and test the connection.
4. Confirm the popup reports **Enhanced** and the full matching/real-time index
   capability. Automatic mode should prefer this backend; disabling it should
   produce a visible standard-mode fallback reason and repair action.

Offline is expected when Zotero is not running. Explicit enhanced mode is
offline when the companion add-on is absent or unpaired. A
synthetic Zotero item and a public or synthetic article page with citation
metadata may be used for review. No real library data is required.
