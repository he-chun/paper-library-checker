# Security Policy

## Supported versions

Version 0.5.0 is the supported GitHub alpha for Zotero 9.0.x; its accepted
qualification scope is recorded in the 0.5.0 report. The Chrome Web Store
listing remains at 0.4.1 until its separate store update is published. Security
fixes are provided on the latest supported release line.

## Reporting a vulnerability

Prefer GitHub's **Report a vulnerability** action. If that action is not yet
available, do not disclose vulnerability details publicly. You may open an
ordinary issue containing no exploit, secret, metadata, log, or reproduction
details and ask the maintainer to provide a private reporting channel.

Include affected version/commit, prerequisites, minimal reproduction, expected
impact, and a redacted diagnostic log if necessary. Never include a pairing
token. The maintainer should acknowledge a report within seven days and provide
status updates as triage proceeds; this is a target, not a service guarantee.

## Scope

High-value reports include authentication bypass, remote access to the local
API, response data leakage, secret storage or logging, malicious-page boundary
bypass, translation-server URL validation, denial of service, and unsafe release
artifacts. The assumptions and residual risks are in `docs/threat-model.md`.

Enhanced add-on requests use HMAC-SHA256 with a timestamp, cryptographic nonce,
exact body hash, method, and path. The reusable pairing secret is not
transported.
The production request body uses only a strict `{item}` or `{items}` envelope.
Credential-bearing JSON keys and any JSON string equal to the current pairing
secret fail closed with the same minimized `legacy_auth_rejected` response;
neither the key, value, body, nor match location is returned or logged.
Do not include pairing secrets, signed request headers, raw bibliographic
bodies, complete logs, or profile paths in a report. The 0.3.0 qualification
used isolated Zotero and Edge profiles, synthetic data, normal browser
restarts, and independent Zotero-core, project-log, and Edge-console leakage
and coverage checks. See the public
[`release qualification`](docs/verification/release-qualification-0.3.0.md).

Standard mode uses Zotero's built-in read-only Local API and no pairing token.
Only the extension service worker may contact its two fixed loopback roots.
Search responses are treated as untrusted candidates and are re-verified before
a minimized result is returned. Raw item JSON must not reach a page, storage,
logs, telemetry, or a remote service. Reports involving this boundary should
use synthetic metadata and must not attach real Local API responses.
