/* global Components, Zotero */

var ZoteroCheck = ZoteroCheck || {};

ZoteroCheck.Utils = {
  log(level, message, details = null) {
    const normalizedLevel = String(level || "info").toUpperCase();
    const suffix = details ? ` ${ZoteroCheck.Security.redact(this.safeJSONStringify(details))}` : "";
    const line = `[${new Date().toISOString()}] [${normalizedLevel}] ${message}${suffix}`;

    try {
      Zotero.debug(`[Paper Library Checker] ${message}${suffix}`);
    } catch (error) {
      // Zotero.debug is best-effort during early startup and shutdown.
    }

    this.appendLogLine(line);
  },

  appendLogLine(line) {
    try {
      const file = Zotero.getProfileDirectory();
      file.append("zotero-check.log");

      if (file.exists() && file.fileSize > 1024 * 1024) {
        const rotated = Zotero.getProfileDirectory();
        rotated.append("zotero-check.log.1");
        if (rotated.exists()) rotated.remove(false);
        file.moveTo(null, "zotero-check.log.1");
      }

      const stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
        .createInstance(Components.interfaces.nsIFileOutputStream);
      stream.init(file, 0x02 | 0x08 | 0x10, 0o644, 0);

      const converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
        .createInstance(Components.interfaces.nsIConverterOutputStream);
      converter.init(stream, "UTF-8");
      converter.writeString(`${line}\n`);
      converter.close();
    } catch (error) {
      try {
        Zotero.debug(`[Paper Library Checker] failed to write log: ${error}`);
      } catch (ignored) {
        // Nothing else is available here.
      }
    }
  },

  safeJSONStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  },

  normalizeIdentifier(value) {
    if (ZoteroCheck.Matcher) {
      return ZoteroCheck.Matcher.normalizeIdentifier(value);
    }
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^doi:\s*/i, "")
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/\s+/g, "");
  },

  normalizeTitle(value) {
    if (ZoteroCheck.Matcher) {
      return ZoteroCheck.Matcher.normalizeTitle(value);
    }
    return String(value || "")
      .normalize("NFKC")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/[：:]\s*(附视频|全文|pdf|html)$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  },

  extractYear(value) {
    if (ZoteroCheck.Matcher) {
      return ZoteroCheck.Matcher.extractYear(value);
    }
    const match = String(value || "").match(/(?:18|19|20)\d{2}/);
    return match ? match[0] : "";
  },

  normalizePerson(value) {
    if (ZoteroCheck.Matcher) {
      return ZoteroCheck.Matcher.normalizePerson(value);
    }
    return String(value || "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim()
      .toLowerCase();
  },

  async readRequestJSON(request) {
    if (!request || !request.bodyInputStream) {
      return {};
    }

    const stream = request.bodyInputStream;
    const available = stream.available();
    if (!available) {
      return {};
    }

    const scriptableStream = Components.classes[
      "@mozilla.org/scriptableinputstream;1"
    ].createInstance(Components.interfaces.nsIScriptableInputStream);
    scriptableStream.init(stream);
    const rawBody = scriptableStream.read(available);
    scriptableStream.close();

    if (!rawBody) {
      return {};
    }
    return JSON.parse(rawBody);
  },

  itemToResult(item) {
    const creators = item.getCreators
      ? item.getCreators().map((creator) => {
          const firstName = creator.firstName || "";
          const lastName = creator.lastName || "";
          return `${lastName}${firstName ? " " + firstName : ""}`.trim();
        })
      : [];

    let itemType = "";
    try {
      if (item.itemType) {
        itemType = item.itemType;
      } else if (typeof Zotero !== "undefined" && Zotero.ItemTypes) {
        itemType = Zotero.ItemTypes.getName(item.itemTypeID) || "";
      }
    } catch (error) {
      itemType = "";
    }

    return {
      title: item.getField("title") || "",
      creators: creators.slice(0, 3),
      year: this.extractYear(item.getField("date") || ""),
      itemType
    };
  }
};
