(function (root, factory) {
  const api = factory(
    root.PLCDirectLocalApiBackend ||
      (typeof require === "function" ? require("./direct-local-api-backend.js") : null)
  );
  root.PLCLocalApiBackend = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (directBackend) {
  "use strict";

  if (!directBackend) throw new Error("direct_local_api_backend_unavailable");
  return directBackend;
});
