param(
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"

if ($Root) {
  $root = (Resolve-Path $Root).Path
}
else {
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$packager = Join-Path $root "scripts\package.mjs"
if (-not (Test-Path -LiteralPath $packager)) {
  throw "Missing cross-platform packager: $packager"
}

& node $packager
if ($LASTEXITCODE -ne 0) {
  throw "Node packager failed with exit code $LASTEXITCODE"
}

$version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$xpi = Join-Path $root "dist\paper-library-checker-zotero-$version.xpi"
if (-not (Test-Path -LiteralPath $xpi)) {
  throw "Expected XPI was not created: $xpi"
}

Write-Host "Created $xpi through the shared cross-platform packager."
