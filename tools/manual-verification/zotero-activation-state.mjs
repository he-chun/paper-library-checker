export const ACTIVATION_STATES = Object.freeze([
  "STARTUP_MARKER_EXPECTED_WHILE_RUNNING",
  "STARTUP_MARKER_REMOVED_AFTER_GRACEFUL_EXIT",
  "STARTUP_CANARY_CLEANUP_ANOMALY",
  "PROFILE_LOCAL_DIR_UNRESOLVED",
  "CANARY_INSTALL_REJECTED",
  "CANARY_INSTALLED_INACTIVE",
  "CANARY_STARTUP_NOT_CALLED",
  "CANARY_STARTUP_PASS",
  "PRODUCT_TEST_NOT_STARTED"
]);

export function classifyActivationState({
  profileLocalDirResolved,
  running = false,
  startupMarkerExists = false,
  canary,
  product
}) {
  if (!profileLocalDirResolved) {
    return {
      startupMarkerStatus: "PROFILE_LOCAL_DIR_UNRESOLVED",
      canaryStatus: "PRODUCT_TEST_NOT_STARTED",
      harnessStatus: "PROFILE_LOCAL_DIR_UNRESOLVED",
      productTestAllowed: false
    };
  }

  const startupMarkerStatus = running && startupMarkerExists
    ? "STARTUP_MARKER_EXPECTED_WHILE_RUNNING"
    : !running && startupMarkerExists
      ? "STARTUP_CANARY_CLEANUP_ANOMALY"
      : "STARTUP_MARKER_REMOVED_AFTER_GRACEFUL_EXIT";

  let canaryStatus = "PRODUCT_TEST_NOT_STARTED";
  if (canary) {
    if (!canary.installed) canaryStatus = "CANARY_INSTALL_REJECTED";
    else if (!canary.active) canaryStatus = "CANARY_INSTALLED_INACTIVE";
    else if (!canary.startupCalled) canaryStatus = "CANARY_STARTUP_NOT_CALLED";
    else if (canary.restartPassed && canary.disableEnablePassed && canary.uninstallPassed) {
      canaryStatus = "CANARY_STARTUP_PASS";
    } else canaryStatus = "CANARY_STARTUP_NOT_CALLED";
  }

  let productStatus = "PRODUCT_TEST_NOT_STARTED";
  if (canaryStatus === "CANARY_STARTUP_PASS" && product) {
    if (!product.installed) productStatus = "PRODUCT_INSTALL_REJECTED";
    else if (product.appDisabled && product.compatibilityReason === "strict_max_version") productStatus = "PRODUCT_COMPATIBILITY_RANGE_REJECTION";
    else if (!product.active) productStatus = "PRODUCT_INSTALLED_INACTIVE";
    else productStatus = "PRODUCT_BASELINE_ACTIVATION_PASS";
  }

  return {
    startupMarkerStatus,
    canaryStatus,
    harnessStatus: canaryStatus,
    productTestAllowed: canaryStatus === "CANARY_STARTUP_PASS",
    productStatus
  };
}
