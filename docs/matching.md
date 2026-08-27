# Matching rules

Enhanced mode uses the Zotero plugin's in-memory index and refreshes it when
Zotero emits item notifications. Standard mode searches personal and accessible
group libraries through Zotero's built-in Local API, then independently
re-validates every returned candidate in the extension service worker.

## Result structure

All formal matcher results use the same shape:

```json
{
  "status": "matched",
  "matchType": "doi",
  "confidence": 1,
  "matches": [],
  "reason": "doi_match"
}
```

`confidence` is always a number from `0` to `1`. `matchType` carries the match
category.

## Identifier matching

Identifier matches are exact and highest confidence.

Supported formal keys:

- DOI
- PMID
- ISBN
- CNKI file identifier or a supported CNKI URL

DOIs are normalized by removing `https://doi.org/`, `http://dx.doi.org/`, and
`doi:`, then trimming and lowercasing. PMID and ISBN values are lowercased and
stripped of whitespace and hyphens.

## Title matching

If no identifier matches, titles are normalized and matched exactly.

Normalization:

- Unicode NFKC normalization
- lowercase
- remove all whitespace
- normalize common Chinese and English punctuation variants
- remove punctuation and symbols

When exact normalized titles match, optional hints are used:

- publication year must match when both sides have a year
- first author must match when both sides have creator data

Missing record hints are treated as unknown and do not create a conflict. If
at least one supplied year or creator hint explicitly conflicts with every
record sharing the exact normalized title, the result is `not_found` with
`reason="title_hint_conflict"`. The indexer never falls back to all same-title
records after such a conflict. `Indexer.match()` and `Matcher.matchRecords()`
use this same rule, including for CJK titles and duplicate records across
libraries.

## Fuzzy title matching

If enabled, fuzzy title matching supports both Chinese and English titles:

- Chinese or mixed CJK titles use character n-gram Dice similarity.
- English titles use token Dice similarity.

### N-gram inverted index

To avoid a full scan of every indexed title, the indexer builds an n-gram
inverted index during `upsertItem`:

- CJK titles are indexed as bigrams (n=2).
- Non-CJK titles are indexed as trigrams (n=3).

When a candidate arrives, its title is decomposed into the same n-grams, and
only items that share at least 1 bigram (CJK) or 2 trigrams (non-CJK) are
considered. Candidates are ranked by shared n-gram count and the top 200
proceed to full similarity calculation, capped by a `seenTitleKeys` dedup so
that items sharing the same normalized title are evaluated only once.

Thresholds:

- score `>= 0.92`: `matched`, `matchType="fuzzy"`, `confidence=score`
- score `>= 0.80` and `< 0.92`: `possible_match`, `matchType="fuzzy"`, `confidence=score`
- lower scores return `not_found`

Fuzzy matches still use the same year and author hints when present.

Fuzzy matching and `possible_match` are enhanced-mode capabilities only.
Standard mode implements exact identifiers and normalized exact title matching;
it returns `matched`, `not_found`, or an isolated stable error and never upgrades
a Local API search hit without rechecking identifiers, title, year, and authors.
Identifier matches have confidence `1`; exact title matches retain confidence
`0.95`. Attachments, notes, and annotations are not formal bibliographic items.

Standard batches deduplicate normalized candidates, reuse duplicate results,
and expand results back into input order. Title-bearing candidates use
`titleCreatorYear` without launching a second full-text search; exact identifiers
are still reverified in every returned title candidate. Identifier-only
candidates retain the `everything` fallback needed when DOI, PMID, ISBN, or CNKI
data is stored outside the title index. Search hits from either mode remain
candidates until the same exact matcher rechecks them. During a standard
reference batch, each completed minimized result can update its page row
immediately; the final response still contains the complete input-ordered array.

The shared scheduler has a hard ceiling of six active Local API requests.
Production uses up to four concurrent lightweight title queries, while the
identifier-only `everything` lane remains limited to one because real Zotero
measurements showed that its full-text searches serialize internally. Each lane
is stable within its priority, with detail-page work ahead of queued
reference-list work; lightweight health probes do not join either lane. The
item-query cache is bounded to 256 entries for five seconds; group membership is
cached for thirty seconds. The 30-second per-request timeout accommodates large
real libraries. An item timeout opens a sixty-second fail-fast cooldown, and page
automatic retries back off from sixty seconds to five minutes, preventing
browser aborts or dynamic DOM events from continuously extending Zotero's own
search queue. No persistent full-library index is created.
