$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$packagePath = Join-Path $projectRoot "package.json"

$vsce = Get-Command "vsce.cmd" -ErrorAction SilentlyContinue
if (-not $vsce) {
    throw "vsce.cmd was not found. Install it with 'npm install --global @vscode/vsce', then run this script again."
}

$packageText = Get-Content -LiteralPath $packagePath -Raw
$versionPattern = '("version"\s*:\s*")(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(")'
$versionMatch = [regex]::Match($packageText, $versionPattern)
if (-not $versionMatch.Success) {
    throw "package.json does not contain a numeric major.minor.patch version."
}

$oldVersion = "{0}.{1}.{2}" -f $versionMatch.Groups["major"].Value, $versionMatch.Groups["minor"].Value, $versionMatch.Groups["patch"].Value
$newVersion = "{0}.{1}.{2}" -f [int]$versionMatch.Groups["major"].Value, [int]$versionMatch.Groups["minor"].Value, ([int]$versionMatch.Groups["patch"].Value + 1)
$newVersionProperty = $versionMatch.Value.Replace($oldVersion, $newVersion)
$packageText = $packageText.Remove($versionMatch.Index, $versionMatch.Length).Insert($versionMatch.Index, $newVersionProperty)
[System.IO.File]::WriteAllText($packagePath, $packageText, [System.Text.UTF8Encoding]::new($false))

$package = $packageText | ConvertFrom-Json
$outputPath = Join-Path $projectRoot ("{0}-{1}.vsix" -f $package.name, $package.version)

Push-Location $projectRoot
try {
    & $vsce.Source package --out $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "VSIX packaging failed with exit code $LASTEXITCODE."
    }
    Write-Host "Built: $outputPath"
}
finally {
    Pop-Location
}
