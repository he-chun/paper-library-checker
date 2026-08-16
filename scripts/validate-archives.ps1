$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$dist = if ($env:PLC_DIST_DIR) { $env:PLC_DIST_DIR } else { "dist" }
$artifacts = @(Get-ChildItem -LiteralPath $dist -File | Where-Object { $_.Extension -in ".xpi", ".zip" })
if ($artifacts.Count -ne 2) { throw "Expected two artifacts, found $($artifacts.Count)" }

foreach ($artifact in $artifacts) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead($artifact.FullName)
  try {
    $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $total = [int64]0
    foreach ($entry in $archive.Entries) {
      $name = $entry.FullName
      if ([string]::IsNullOrWhiteSpace($name) -or $name.Contains("\") -or $name.Contains([char]0) -or
          $name.StartsWith("/") -or $name -match '^[A-Za-z]:' -or
          ($name.Split('/') | Where-Object { $_ -in @('', '.', '..') })) {
        throw "Unsafe archive entry: $name"
      }
      if (-not $names.Add($name)) { throw "Duplicate archive entry: $name" }
      if ($entry.Length -gt 32MB) { throw "Archive entry too large: $name" }
      if ($entry.CompressedLength -gt 0 -and ($entry.Length / $entry.CompressedLength) -gt 1000) {
        throw "Suspicious compression ratio: $name"
      }
      $total += $entry.Length
      if ($total -gt 128MB) { throw "Archive total uncompressed size is too large" }
      $stream = $entry.Open()
      try {
        $buffer = New-Object byte[] 65536
        $readTotal = [int64]0
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) { $readTotal += $read }
        if ($readTotal -ne $entry.Length) { throw "Incomplete archive entry: $name" }
      } finally {
        $stream.Dispose()
      }
    }
    $required = @("manifest.json", "LICENSE", "THIRD_PARTY_NOTICES.md")
    if (Test-Path -LiteralPath "NOTICE" -PathType Leaf) { $required += "NOTICE" }
    foreach ($name in $required) {
      if (-not $names.Contains($name)) { throw "Required root file missing: $name" }
    }
    Write-Output "validated $($artifact.Name): entries=$($names.Count) uncompressed=$total"
  } finally {
    $archive.Dispose()
  }
}
