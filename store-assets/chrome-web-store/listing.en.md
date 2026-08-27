# Chrome Web Store listing — English

## Store name

Paper Library Checker

## Summary

Check whether papers on supported scholarly sites are already in your local Zotero library.

## Recommended category

Workflow & Planning

Paper Library Checker helps researchers perform literature-management
workflows more efficiently by checking whether scholarly articles are already
present in their local Zotero library.

## Description

Paper Library Checker is an alpha, local-first companion for Zotero. On
supported scholarly article pages, it reads public bibliographic metadata and
checks that metadata against the user's local Zotero library. It can display
Saved, Possible match, Not saved, or Unrecognized so the user can decide
whether to save the item.

Requirements:

- Zotero 9.0.x.
- Zotero must be running with its built-in Local API enabled.

Offline is expected when Zotero is not running or the selected backend cannot
connect.

Standard mode requires no Paper Library Checker Zotero add-on and supports
exact identifier/title matching plus reference-list batch checks. The optional
enhanced mode uses the companion add-on for faster batches, complete fuzzy
matching, Possible match, and real-time index updates. Automatic mode prefers a
healthy compatible enhanced backend and otherwise reports its fallback to
standard mode.

The extension does not save papers and does not replace Zotero Connector. In
standard mode, raw Local API records are processed only in extension
service-worker memory and never returned to a webpage. Enhanced mode uses
authenticated loopback requests and minimized results. The extension does not
upload the user's Zotero library or use it for telemetry. There is no telemetry,
advertising, or developer-operated server.

Chrome is the target browser for this Chrome Web Store listing. Microsoft Edge
can usually install extensions from the Chrome Web Store, but not every Edge
environment is guaranteed.

Current support boundaries remain unchanged: CNKI Chinese article details are
supported and tested; CNKI English and CNKI list/reference checks are
experimental; ScienceDirect is best effort when site access controls replace
the article page; MDPI article details are supported and tested, but MDPI
References are not supported. Other manifest-listed scholarly sites use
experimental or best-effort generic metadata extraction. A listed domain is not
itself a promise of verified support for every page.

Paper Library Checker remains alpha software. It is an independent project and
is not affiliated with or endorsed by Zotero, Google Chrome, Microsoft Edge,
or their publishers.
