# Chrome Web Store privacy practices

## Single purpose

Read public bibliographic information from supported scholarly web pages,
compare it on the user's computer with the user's local Zotero library, and
display states such as Saved, Possible match, and Not saved.

## Data handled

The extension may handle public bibliographic information from the current
page, the current page URL, title, DOI and other public identifiers, authors,
year, a local pairing token, and local connection, index, and match state.

This data is processed on the user's computer. It is not sent to the
maintainer, sold, used for advertising, used for profiling, or used for credit,
insurance, employment, or any unrelated purpose. The project has no telemetry.
The extension does not upload the user's Zotero library.

The pairing token is stored in `chrome.storage.local` and is not sent to the
maintainer. Authenticated matching communicates with the companion Zotero
add-on on the loopback interface. If enabled by the user, the extension may
send the current public page URL to a separately installed translation-server
on the loopback interface.

## Limited Use

User data is used only to provide or improve the extension's single purpose.
It is not sold, used for advertising, transferred for unrelated purposes, or
used to determine creditworthiness or for lending purposes.

## Remote code

No, this extension does not use remote code.

Production code does not load remote scripts, evaluate remotely obtained
content, pass remotely obtained content to `eval` or `new Function`, download
code for execution, or let remote configuration control code execution.
Communication with the companion Zotero add-on on localhost and the optional
localhost translation-server is local service communication, not remote code.

## Privacy Policy URL

https://github.com/he-chun/paper-library-checker/blob/main/PRIVACY.md
