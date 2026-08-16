param(
  [Parameter(Mandatory = $true)][string]$ZoteroExe,
  [Parameter(Mandatory = $true)][string]$ProfileDirectory,
  [Parameter(Mandatory = $true)][string]$CanaryDirectory,
  [Parameter(Mandatory = $true)][string]$ExpectedZoteroVersion,
  [string]$ProductDirectory,
  [string]$ProductXpi,
  [int]$WaitSeconds = 15
)

$ErrorActionPreference = "Stop"
$productId = "paper-library-checker@he-chun.github.io"
$canaryId = "paper-library-checker-canary@he-chun.github.io"
$markerName = "plc-activation-canary.local.json"

if ($ProductDirectory -and $ProductXpi) { throw "Choose ProductDirectory or ProductXpi, not both" }
if (Test-Path -LiteralPath $ProfileDirectory) { throw "ProfileDirectory must be new" }

New-Item -ItemType Directory -Path $ProfileDirectory | Out-Null
$resolvedZotero = (Resolve-Path $ZoteroExe).Path
$actualVersion = (Get-Item -LiteralPath $resolvedZotero).VersionInfo.ProductVersion
if ($actualVersion -ne $ExpectedZoteroVersion) {
  throw "Zotero version mismatch: expected $ExpectedZoteroVersion, received $actualVersion"
}
[System.IO.File]::WriteAllLines(
  (Join-Path $ProfileDirectory "user.js"),
  @(
    'user_pref("app.update.auto", false);',
    'user_pref("app.update.enabled", false);',
    'user_pref("extensions.update.autoUpdateDefault", false);'
  ),
  [System.Text.UTF8Encoding]::new($false)
)
$initial = Start-Process -FilePath $resolvedZotero -ArgumentList @(
  "-no-remote", "-profile", $ProfileDirectory, "-datadir", "profile"
) -PassThru -WindowStyle Hidden
$initDeadline = (Get-Date).AddSeconds($WaitSeconds)
while ((-not (Test-Path -LiteralPath (Join-Path $ProfileDirectory "zotero\zotero.sqlite")) -or
    -not (Get-Process -Id $initial.Id -ErrorAction SilentlyContinue).MainWindowHandle) -and
    (Get-Date) -lt $initDeadline) {
  Start-Sleep -Milliseconds 250
}
if (-not (Test-Path -LiteralPath (Join-Path $ProfileDirectory "zotero\zotero.sqlite"))) {
  throw "Isolated Zotero data directory did not initialize"
}
$parent = Get-Process -Id $initial.Id -ErrorAction SilentlyContinue
if ($parent -and $parent.MainWindowHandle) { $parent.CloseMainWindow() | Out-Null }
$closeDeadline = (Get-Date).AddSeconds(10)
while ((Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" |
    Where-Object ExecutablePath -eq $resolvedZotero) -and (Get-Date) -lt $closeDeadline) {
  Start-Sleep -Milliseconds 250
}
if (Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" |
    Where-Object ExecutablePath -eq $resolvedZotero) {
  [pscustomobject]@{
    classification = "BLOCKED"
    reason = "ISOLATED_PROFILE_DID_NOT_CLOSE_CLEANLY"
    canaryMarker = $false
    endpointReady = $false
  } | ConvertTo-Json
  exit 2
}
$extensions = New-Item -ItemType Directory -Path (Join-Path $ProfileDirectory "extensions")
[System.IO.File]::WriteAllText(
  (Join-Path $extensions.FullName $canaryId),
  (Resolve-Path $CanaryDirectory).Path,
  [System.Text.Encoding]::ASCII
)
if ($ProductDirectory) {
  [System.IO.File]::WriteAllText(
    (Join-Path $extensions.FullName $productId),
    (Resolve-Path $ProductDirectory).Path,
    [System.Text.Encoding]::ASCII
  )
}
if ($ProductXpi) {
  Copy-Item -LiteralPath $ProductXpi -Destination (Join-Path $extensions.FullName "$productId.xpi")
}
$prefs = Join-Path $ProfileDirectory "prefs.js"
if (Test-Path -LiteralPath $prefs) {
  $filtered = Get-Content -LiteralPath $prefs | Where-Object {
    $_ -notmatch 'extensions\.lastApp(BuildId|Version)'
  }
  [System.IO.File]::WriteAllLines($prefs, $filtered, [System.Text.UTF8Encoding]::new($false))
}

$debugOutput = Join-Path $ProfileDirectory "activation-debug.local.txt"
$debugError = Join-Path $ProfileDirectory "activation-error.local.txt"
$process = Start-Process -FilePath $resolvedZotero -ArgumentList @(
  "-no-remote", "-profile", $ProfileDirectory, "-datadir", "profile", "-purgecaches", "-ZoteroDebugText"
) -PassThru -WindowStyle Hidden -RedirectStandardOutput $debugOutput -RedirectStandardError $debugError
try {
  $startupMarkerStatus = if (Test-Path -LiteralPath (Join-Path $ProfileDirectory ".startup-incomplete")) {
    "STARTUP_MARKER_EXPECTED_WHILE_RUNNING"
  } else {
    "PROFILE_LOCAL_DIR_UNRESOLVED"
  }
  $marker = Join-Path $ProfileDirectory $markerName
  $deadline = (Get-Date).AddSeconds($WaitSeconds)
  while (-not (Test-Path -LiteralPath $marker) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $marker)) {
    [pscustomobject]@{
      classification = "BOOTSTRAP_NOT_LOADED"
      startupMarkerStatus = $startupMarkerStatus
      canaryMarker = $false
      endpointReady = $false
    } | ConvertTo-Json
    exit 2
  }
  $result = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
  $endpointReady = $false
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:23119/zotero-checker/health" -TimeoutSec 2 -SkipHttpErrorCheck | Out-Null
    $endpointReady = $true
  } catch {}
  $classification = if (-not $result.product.installed) {
    "INSTALL_REJECTED"
  } elseif ($result.product.appDisabled) {
    "INSTALLED_APP_DISABLED"
  } elseif ($result.product.userDisabled) {
    "INSTALLED_USER_DISABLED"
  } elseif (-not $result.product.isActive) {
    "INSTALLED_INACTIVE_UNKNOWN"
  } elseif ($endpointReady) {
    "ACTIVE_ENDPOINT_READY"
  } else {
    "STARTUP_COMPLETE_ENDPOINT_MISSING"
  }
  [pscustomobject]@{
    classification = $classification
    startupMarkerStatus = $startupMarkerStatus
    canaryMarker = [bool]$result.startupMarker
    canary = $result.canary
    product = $result.product
    endpointReady = $endpointReady
  } | ConvertTo-Json -Depth 5
  if ($classification -eq "ACTIVE_ENDPOINT_READY") { exit 0 }
  exit 2
} finally {
  Get-Process -Id $process.Id -ErrorAction SilentlyContinue |
    ForEach-Object { $_.CloseMainWindow() | Out-Null }
}
