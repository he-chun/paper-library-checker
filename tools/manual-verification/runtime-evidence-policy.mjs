const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function sameInventory(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function evaluateExactArtifactReuse(candidate = {}, evidence = {}) {
  const reasons = [];
  if (!SHA256.test(candidate.xpiSha256 || "") || candidate.xpiSha256 !== evidence.xpiSha256) reasons.push("XPI_SHA256_MISMATCH");
  if (!candidate.pluginVersion || candidate.pluginVersion !== evidence.pluginVersion) reasons.push("PLUGIN_VERSION_MISMATCH");
  if (!candidate.zoteroVersion || candidate.zoteroVersion !== evidence.zoteroVersion) reasons.push("ZOTERO_VERSION_MISMATCH");
  if (!sameInventory(candidate.packageInventory, evidence.packageInventory)) reasons.push("PACKAGE_INVENTORY_MISMATCH");
  if (candidate.productionCodeChanged !== false) reasons.push("PRODUCTION_CODE_CHANGED_OR_UNDECLARED");
  if (candidate.packagingCodeChanged !== false) reasons.push("PACKAGING_CODE_CHANGED_OR_UNDECLARED");
  if (evidence.pluginsUiInstall !== "PASS") reasons.push("PLUGINS_UI_INSTALL_NOT_PASS");
  for (const field of ["startup", "authenticatedHealth", "restart", "disableEnable", "uninstallReinstall"]) {
    if (evidence[field] !== "PASS") reasons.push(`${field.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}_NOT_PASS`);
  }
  if (evidence.invalidated !== false) reasons.push("EVIDENCE_INVALIDATED_OR_UNDECLARED");
  return {
    accepted: reasons.length === 0,
    classification: reasons.length === 0 ? "PASS_REUSED_EXACT_ARTIFACT_EVIDENCE" : "BLOCKED",
    reasons
  };
}

export function evaluateEdgeCleanProfile(assertions = {}) {
  const reasons = [];
  const requiredTrue = ["profileCreatedForThisTest", "targetExtensionLoaded", "developerMode", "profileDeletedOrSanitizedAfterTest"];
  const requiredFalse = ["syncEnabled", "importedHistory", "importedPasswords", "importedFavorites", "otherExtensionsInstalled", "guestProfile", "dailyProfile"];
  for (const field of requiredTrue) if (assertions[field] !== true) reasons.push(`${field}_MUST_BE_TRUE`);
  for (const field of requiredFalse) if (assertions[field] !== false) reasons.push(`${field}_MUST_BE_FALSE`);
  return { accepted: reasons.length === 0, reasons };
}

export function validateRuntimeResultSchema(result = {}, { forNewPass = false } = {}) {
  if (result.schemaVersion === 1) {
    const reasons = forNewPass ? ["SCHEMA_1_CANNOT_ESTABLISH_NEW_PASS"] : [];
    return { readable: true, canProduceNewPass: false, valid: !forNewPass, reasons };
  }
  const reasons = [];
  if (result.schemaVersion !== 2) reasons.push("UNSUPPORTED_SCHEMA_VERSION");
  if (!SHA40.test(result.sourceProductSha || "")) reasons.push("INVALID_SOURCE_PRODUCT_SHA");
  if (!SHA40.test(result.testSnapshotSha || "")) reasons.push("INVALID_TEST_SNAPSHOT_SHA");
  if (result.sourceProductSha === result.testSnapshotSha) reasons.push("PRODUCT_AND_TEST_SNAPSHOT_ROLES_CONFLATED");
  if (result.resultCommitSha !== null && !SHA40.test(result.resultCommitSha || "")) reasons.push("INVALID_RESULT_COMMIT_SHA");
  if (result.resultCommitSha && [result.sourceProductSha, result.testSnapshotSha].includes(result.resultCommitSha)) reasons.push("RESULT_COMMIT_ROLE_CONFLATED");
  if (!result.artifactSha256 || !Object.values(result.artifactSha256).some(value => SHA256.test(value))) reasons.push("MISSING_ARTIFACT_SHA256");
  if (!Array.isArray(result.evidenceSources)) reasons.push("INVALID_EVIDENCE_SOURCES");
  if (!result.evidenceReuse || typeof result.evidenceReuse !== "object") reasons.push("INVALID_EVIDENCE_REUSE");
  if (!result.runtimeStatus || typeof result.runtimeStatus !== "object") reasons.push("INVALID_RUNTIME_STATUS");
  return { readable: result.schemaVersion === 2, canProduceNewPass: reasons.length === 0, valid: reasons.length === 0, reasons };
}
