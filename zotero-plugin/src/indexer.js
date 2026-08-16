/* global Zotero, ZoteroCheck */

ZoteroCheck.Indexer = class {
  constructor({ fuzzyMatching = true } = {}) {
    this.fuzzyMatching = fuzzyMatching;
    this.identifierIndex = new Map();
    this.titleIndex = new Map();
    this.ngramIndex = new Map();
    this.itemsByID = new Map();
    this.notifierID = null;
    this.lastIndexedAt = null;
    this.skippedItemCount = 0;
    this.revision = 0;
  }

  async start() {
    ZoteroCheck.Utils.log("info", "indexer starting", {
      fuzzyMatching: this.fuzzyMatching
    });
    await this.rebuild();
    this.notifierID = Zotero.Notifier.registerObserver(
      this,
      ["item"],
      "zotero-check-indexer"
    );
    ZoteroCheck.Utils.log("info", "indexer notifier registered", {
      notifierID: this.notifierID
    });
  }

  async stop() {
    if (this.notifierID) {
      Zotero.Notifier.unregisterObserver(this.notifierID);
      ZoteroCheck.Utils.log("info", "indexer notifier unregistered", {
        notifierID: this.notifierID
      });
      this.notifierID = null;
    }
    this.clear();
    ZoteroCheck.Utils.log("info", "indexer stopped");
  }

  async notify(event, type, ids) {
    if (type !== "item") {
      return;
    }

    ZoteroCheck.Utils.log("info", "indexer notify", {
      event,
      type,
      count: ids ? ids.length : 0
    });

    if (event === "delete" || event === "trash") {
      for (const id of ids) {
        this.removeItem(id);
      }
      return;
    }

    for (const id of ids) {
      const item = await Zotero.Items.getAsync(id);
      if (item) {
        await this.upsertItem(item);
      }
    }
  }

  clear() {
    this.identifierIndex.clear();
    this.titleIndex.clear();
    this.ngramIndex.clear();
    this.itemsByID.clear();
    this.skippedItemCount = 0;
  }

  async rebuild() {
    this.clear();

    const libraryIDs = Zotero.Libraries.getAll()
      .filter((library) => !library.archived)
      .map((library) => library.libraryID);
    ZoteroCheck.Utils.log("info", "index rebuild started", { libraryCount: libraryIDs.length });

    for (const libraryID of libraryIDs) {
      const itemIDs = await Zotero.DB.columnQueryAsync(
        "SELECT itemID FROM items WHERE libraryID=? AND itemID NOT IN (SELECT itemID FROM deletedItems)",
        [libraryID]
      );
      ZoteroCheck.Utils.log("info", "indexing library", { itemCount: itemIDs.length });

      const BATCH_SIZE = 50;
      for (let batchStart = 0; batchStart < itemIDs.length; batchStart += BATCH_SIZE) {
        const batch = itemIDs.slice(batchStart, batchStart + BATCH_SIZE);
        const items = await Promise.all(
          batch.map((id) => Zotero.Items.getAsync(id).catch(() => null))
        );
        for (const item of items) {
          if (item) {
            await this.upsertItem(item);
          }
        }
      }
    }

    this.lastIndexedAt = new Date().toISOString();
    this.revision += 1;
    ZoteroCheck.Utils.log("info", "index rebuild finished", this.stats());
  }

  removeItem(itemID) {
    const old = this.itemsByID.get(itemID);
    if (!old) {
      return;
    }

    for (const [type, value] of Object.entries(old.identifiers)) {
      this.deleteFromMapSet(this.identifierIndex, `${type}:${value}`, itemID);
    }
    if (old.titleKey) {
      this.deleteFromMapSet(this.titleIndex, old.titleKey, itemID);
      for (const gram of this.ngramsFromKey(old.titleKey)) {
        this.deleteFromMapSet(this.ngramIndex, gram, itemID);
      }
    }
    this.itemsByID.delete(itemID);
    this.revision += 1;
  }

  async upsertItem(item) {
    try {
      if (!item || !item.isRegularItem || !item.isRegularItem()) {
        return;
      }

      await this.ensureItemDataLoaded(item);
      this.removeItem(item.id);

      const identifiers = this.collectItemIdentifiers(item);
      const title = this.getFieldSafe(item, "title");
      const titleKey = ZoteroCheck.Matcher.normalizeTitle(title);
      const year = ZoteroCheck.Utils.extractYear(this.getFieldSafe(item, "date"));
      const creators = this.getCreatorsSafe(item);
      const result = ZoteroCheck.Utils.itemToResult(item);

      this.itemsByID.set(item.id, {
        item,
        result,
        identifiers,
        titleRaw: title,
        titleKey,
        year,
        creators
      });

      for (const [type, value] of Object.entries(identifiers)) {
        this.addToMapSet(this.identifierIndex, `${type}:${value}`, item.id);
      }
      if (titleKey) {
        this.addToMapSet(this.titleIndex, titleKey, item.id);
        for (const gram of this.ngramsFromKey(titleKey)) {
          this.addToMapSet(this.ngramIndex, gram, item.id);
        }
      }
      this.revision += 1;
    } catch (error) {
      this.removeItem(item && item.id);
      this.skippedItemCount += 1;
      ZoteroCheck.Utils.log("error", "index item skipped", { message: "item_load_failed" });
    }
  }

  async ensureItemDataLoaded(item) {
    if (!item) {
      return;
    }

    if (item.loadData) {
      await item.loadData();
      return;
    }
    if (item.loadAllData) {
      await item.loadAllData();
    }
  }

  getCreatorsSafe(item) {
    try {
      return item.getCreators
        ? item.getCreators().map((creator) =>
            ZoteroCheck.Utils.normalizePerson(
              `${creator.lastName || ""}${creator.firstName || ""}`
            )
          )
        : [];
    } catch (error) {
      return [];
    }
  }

  collectItemIdentifiers(item) {
    const identifiers = {};
    const fields = ["DOI", "ISBN", "PMID"];
    for (const field of fields) {
      const value = this.getFieldSafe(item, field);
      if (value) {
        const type = field.toLowerCase();
        identifiers[type] = ZoteroCheck.Matcher.normalizeIdentifier(value, type);
      }
    }

    const extra = this.getFieldSafe(item, "extra") || "";
    const patterns = [
      ["doi", /\bdoi:\s*([^\s]+)/i],
      ["pmid", /\bpmid:\s*(\d+)/i],
      ["isbn", /\bisbn:\s*([0-9Xx -]+)/i],
      ["cnki", /\bcnki(?:FileID)?:\s*(\S+)/i]
    ];
    for (const [name, pattern] of patterns) {
      const match = extra.match(pattern);
      if (match && !identifiers[name]) {
        identifiers[name] = ZoteroCheck.Matcher.normalizeIdentifier(match[1], name);
      }
    }

    // Extract CNKI fileID from item URL (e.g. filename=XXX or FileName=XXX)
    if (!identifiers.cnki) {
      const url = this.getFieldSafe(item, "url") || "";
      const cnkiMatch = url.match(/[?&](?:filename|FileName)=([^&]+)/);
      if (cnkiMatch) {
        identifiers.cnki = ZoteroCheck.Matcher.normalizeCNKI(
          decodeURIComponent(cnkiMatch[1])
        );
      }
    }

    return Object.fromEntries(Object.entries(identifiers).filter(([, value]) => value));
  }

  getFieldSafe(item, field) {
    try {
      return item.getField(field);
    } catch (error) {
      return "";
    }
  }

  match(candidate) {
    const normalizedCandidate = this.normalizeCandidate(candidate);

    for (const type of ZoteroCheck.Matcher.IDENTIFIER_PRIORITY) {
      const value = normalizedCandidate.identifiers[type];
      if (!value) {
        continue;
      }
      const ids = this.identifierIndex.get(`${type}:${value}`);
      if (ids && ids.size) {
        return this.buildResult([...ids], "matched", type, 1, `${type}_match`);
      }
    }

    if (normalizedCandidate.titleKey) {
      const exactTitleIDs = this.titleIndex.get(normalizedCandidate.titleKey);
      if (exactTitleIDs && exactTitleIDs.size) {
        const filtered = this.filterByBibliographicHints([...exactTitleIDs], normalizedCandidate);
        if (!filtered.length) {
          return ZoteroCheck.Matcher.createResult(
            "not_found",
            null,
            0,
            [],
            "title_hint_conflict"
          );
        }
        return this.buildResult(
          filtered,
          "matched",
          "title",
          0.95,
          "title_match"
        );
      }
    }

    if (this.fuzzyMatching && normalizedCandidate.titleKey) {
      const fuzzyMatch = this.findFuzzyTitleMatches(normalizedCandidate);
      if (fuzzyMatch.ids.length) {
        return this.buildResult(
          fuzzyMatch.ids,
          fuzzyMatch.score >= 0.92 ? "matched" : "possible_match",
          "fuzzy",
          fuzzyMatch.score,
          "fuzzy_title_match"
        );
      }
    }

    return ZoteroCheck.Matcher.createResult(
      "not_found",
      null,
      0,
      [],
      normalizedCandidate.titleKey || Object.keys(normalizedCandidate.identifiers).length
        ? "no_match"
        : "no_metadata"
    );
  }

  normalizeCandidate(candidate = {}) {
    return ZoteroCheck.Matcher.normalizeCandidate(candidate);
  }

  filterByBibliographicHints(itemIDs, candidate) {
    return itemIDs.filter((id) => {
      const indexed = this.itemsByID.get(id);
      if (!indexed) {
        return false;
      }

      if (candidate.year && indexed.year && candidate.year !== indexed.year) {
        return false;
      }

      if (candidate.creators.length && indexed.creators.length) {
        return candidate.creators.some((creator) => indexed.creators.includes(creator));
      }

      return true;
    });
  }

  findFuzzyTitleMatches(candidate) {
    const candidateKey = candidate.titleKey;
    const candidateRaw = candidate.titleRaw || candidateKey;
    const candidateGrams = this.ngramsFromKey(candidateKey);

    const candidateIDs = new Map();
    const minSharedGrams = /[㐀-鿿豈-﫿]/.test(candidateKey) ? 1 : 2;
    for (const gram of candidateGrams) {
      const ids = this.ngramIndex.get(gram);
      if (!ids) {
        continue;
      }
      for (const id of ids) {
        candidateIDs.set(id, (candidateIDs.get(id) || 0) + 1);
      }
    }

    const topIDs = [...candidateIDs.entries()]
      .filter(([, count]) => count >= minSharedGrams)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);

    const matches = [];
    const seenTitleKeys = new Set();
    for (const [id] of topIDs) {
      const entry = this.itemsByID.get(id);
      if (!entry || seenTitleKeys.has(entry.titleKey)) {
        continue;
      }
      seenTitleKeys.add(entry.titleKey);

      const similarity = ZoteroCheck.Matcher.titleSimilarity(
        candidateRaw,
        entry.titleRaw || entry.titleKey
      );
      if (similarity < 0.8) {
        continue;
      }
      const sameKeyIDs = this.titleIndex.get(entry.titleKey);
      if (!sameKeyIDs) {
        continue;
      }
      const filtered = this.filterByBibliographicHints([...sameKeyIDs], candidate);
      if (filtered.length) {
        matches.push({ ids: filtered, score: similarity });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    if (!matches.length) {
      return { ids: [], score: 0 };
    }
    const bestScore = matches[0].score;
    return {
      ids: [...new Set(matches.filter((match) => match.score === bestScore).flatMap((match) => match.ids))],
      score: bestScore
    };
  }

  ngramsFromKey(key) {
    if (!key) {
      return [];
    }
    const isCJK = /[㐀-鿿豈-﫿]/.test(key);
    const size = isCJK ? 2 : 3;
    if (key.length <= size) {
      return [key];
    }
    const grams = [];
    for (let i = 0; i <= key.length - size; i += 1) {
      grams.push(key.slice(i, i + size));
    }
    return grams;
  }

  buildResult(itemIDs, status, matchType, confidence, reason) {
    const matches = [...new Set(itemIDs)]
      .map((id) => this.itemsByID.get(id))
      .filter(Boolean)
      .map(({ result }) => result);

    return ZoteroCheck.Matcher.createResult(status, matchType, confidence, matches, reason);
  }

  addToMapSet(map, key, value) {
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key).add(value);
  }

  deleteFromMapSet(map, key, value) {
    const set = map.get(key);
    if (!set) {
      return;
    }
    set.delete(value);
    if (!set.size) {
      map.delete(key);
    }
  }

  stats() {
    return {
      itemCount: this.itemsByID.size,
      identifierKeyCount: this.identifierIndex.size,
      titleKeyCount: this.titleIndex.size,
      ngramKeyCount: this.ngramIndex.size,
      skippedItemCount: this.skippedItemCount,
      revision: this.revision,
      fuzzyMatching: this.fuzzyMatching,
      lastIndexedAt: this.lastIndexedAt
    };
  }
};
