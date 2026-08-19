/* global Zotero, ZoteroCheck */

ZoteroCheck.Server = class {
  constructor({ port = 23119, token = "", fuzzyMatching = true, batchLimit = 200 } = {}) {
    this.port = port;
    this.token = token;
    this.batchLimit = Math.min(ZoteroCheck.Security.MAX_BATCH_ITEMS, Math.max(1, Number(batchLimit) || 200));
    this.indexer = new ZoteroCheck.Indexer({ fuzzyMatching });
    this.pluginVersion = "0.4.0";
    this.endpointPrefix = "/zotero-checker";
    this.endpointKeys = [];
    this.requestCache = new Map();
    this.requestCacheMaxEntries = 500;
    this.requestCacheTTL = 5 * 60 * 1000;
    this.batchCache = new Map();
    this.batchCacheMaxEntries = 100;
    this.batchCacheTTL = 30 * 1000;
    this.rateLimiter = new ZoteroCheck.Security.RateLimiter();
    this.replayCache = new ZoteroCheck.Security.ReplayCache();
    this.ready = false;
    this.indexError = null;
  }

  async start() {
    this.registerEndpoints();
    ZoteroCheck.Utils.log("info", "endpoints registered", { port: this.port, endpointPrefix: this.endpointPrefix });
    try {
      await this.indexer.start();
      this.ready = true;
      this.indexError = null;
      ZoteroCheck.Utils.log("info", "index ready", { itemCount: this.indexer.stats().itemCount });
    } catch (error) {
      this.ready = false;
      this.indexError = "index_not_ready";
      Zotero.logError(error);
      ZoteroCheck.Utils.log("error", "index failed");
    }
  }

  async stop() {
    this.unregisterEndpoints();
    this.requestCache.clear();
    this.batchCache.clear();
    this.replayCache.clear();
    await this.indexer.stop();
  }

  setToken(token) {
    this.token = token;
    this.requestCache.clear();
    this.batchCache.clear();
    this.replayCache.clear();
  }

  registerEndpoints() {
    const server = this;
    const makeEndpoint = (methods, handler) => {
      const Endpoint = function () {};
      Endpoint.prototype = {
        supportedMethods: methods,
        supportedDataTypes: [ZoteroCheck.Security.CONTENT_TYPE],
        init: async (request) => {
          const response = await handler(request || {});
          return [response.status, server.responseHeaders(), JSON.stringify(response.payload)];
        }
      };
      return Endpoint;
    };

    const endpoints = {
      [`${this.endpointPrefix}/health`]: makeEndpoint(["GET"], (request) => this.handleHealth(request)),
      [`${this.endpointPrefix}/check`]: makeEndpoint(["POST"], (request) => this.handleCheck(request)),
      [`${this.endpointPrefix}/batch-check`]: makeEndpoint(["POST"], (request) => this.handleBatchCheck(request))
    };
    for (const [path, endpoint] of Object.entries(endpoints)) {
      Zotero.Server.Endpoints[path] = endpoint;
      this.endpointKeys.push(path);
    }
  }

  responseHeaders() {
    return {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    };
  }

  async preflight(request) {
    let authenticated;
    try {
      authenticated = await ZoteroCheck.Security.authenticateRequest({
        secret: this.token,
        request,
        method: request.method,
        path: request.pathname,
        replayCache: this.replayCache
      });
    } catch (error) {
      if (error instanceof ZoteroCheck.Security.ValidationError) return this.errorResponse(error.status, error.code);
      return this.errorResponse(401, "authentication_failed");
    }
    if (!this.rateLimiter.allow()) {
      return this.errorResponse(429, "rate_limited");
    }
    return { authenticated };
  }

  async handleHealth(request) {
    const preflight = await this.preflight(request);
    if (!preflight.authenticated) return preflight;
    return {
      status: 200,
      payload: { ok: true, version: this.pluginVersion, indexReady: this.ready }
    };
  }

  async handleCheck(request) {
    const preflight = await this.preflight(request);
    if (!preflight.authenticated) return preflight;
    try {
      const body = this.parseAuthenticatedJSON(preflight.authenticated.bodyText);
      ZoteroCheck.Security.assertNoEmbeddedCredentials(body, this.token);
      this.validateCheckEnvelope(body);
      const candidate = ZoteroCheck.Security.sanitizeCandidate(body.item);
      return { status: 200, payload: this.buildCheckResult(candidate) };
    } catch (error) {
      return this.validationResponse(error);
    }
  }

  async handleBatchCheck(request) {
    const preflight = await this.preflight(request);
    if (!preflight.authenticated) return preflight;
    try {
      const body = this.parseAuthenticatedJSON(preflight.authenticated.bodyText);
      ZoteroCheck.Security.assertNoEmbeddedCredentials(body, this.token);
      this.validateBatchEnvelope(body);
      const items = ZoteroCheck.Security.sanitizeBatch(body.items, this.batchLimit);
      const batchKey = this.getCacheKey(items);
      const cached = this.getCached(this.batchCache, batchKey, this.batchCacheTTL, "results");
      if (cached) return { status: 200, payload: { results: cached } };
      const results = items.map((item) => this.buildCheckResult(item));
      this.setCached(this.batchCache, batchKey, { results }, this.batchCacheMaxEntries);
      return { status: 200, payload: { results } };
    } catch (error) {
      return this.validationResponse(error);
    }
  }

  parseAuthenticatedJSON(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ZoteroCheck.Security.ValidationError("malformed_json", 400);
    }
  }

  isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  validateCheckEnvelope(body) {
    if (!this.isPlainObject(body) || !this.isPlainObject(body.item)) {
      throw new ZoteroCheck.Security.ValidationError("invalid_check_envelope", 422);
    }
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "item") {
      throw new ZoteroCheck.Security.ValidationError("invalid_check_envelope", 422);
    }
  }

  validateBatchEnvelope(body) {
    if (!this.isPlainObject(body) || !Array.isArray(body.items)) {
      throw new ZoteroCheck.Security.ValidationError("invalid_batch_envelope", 422);
    }
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "items") {
      throw new ZoteroCheck.Security.ValidationError("invalid_batch_envelope", 422);
    }
  }

  buildCheckResult(item) {
    if (!this.ready) {
      return { status: "error", matchType: null, confidence: 0, error: "index_not_ready" };
    }
    const cacheKey = this.getCacheKey(item);
    const cached = this.getCached(this.requestCache, cacheKey, this.requestCacheTTL, "result");
    if (cached) return cached;
    const result = ZoteroCheck.Security.minimizeResult(this.indexer.match(item));
    this.setCached(this.requestCache, cacheKey, { result }, this.requestCacheMaxEntries);
    return result;
  }

  getCacheKey(value) {
    const serialized = JSON.stringify(value);
    if (serialized.length > ZoteroCheck.Security.MAX_CACHE_KEY_BYTES) {
      throw new ZoteroCheck.Security.ValidationError("cache_key_too_large", 413);
    }
    return `${this.indexer.revision}:${serialized}`;
  }

  getCached(cache, key, ttl, property) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > ttl) {
      cache.delete(key);
      return null;
    }
    return entry[property];
  }

  setCached(cache, key, value, maximum) {
    cache.set(key, { createdAt: Date.now(), ...value });
    while (cache.size > maximum) cache.delete(cache.keys().next().value);
  }

  validationResponse(error) {
    if (error instanceof ZoteroCheck.Security.ValidationError) {
      return this.errorResponse(error.status, error.code);
    }
    Zotero.logError(error);
    return this.errorResponse(400, "invalid_request");
  }

  errorResponse(status, error) {
    return { status, payload: { status: "error", matchType: null, confidence: 0, error } };
  }

  unregisterEndpoints() {
    for (const key of this.endpointKeys) delete Zotero.Server.Endpoints[key];
    this.endpointKeys = [];
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ZoteroCheck.Server;
}
