[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Package,
    [string]$ArtifactDirectory = "smoke-artifacts"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$packagePath = (Resolve-Path -LiteralPath $Package).Path
$artifactPath = [System.IO.Path]::GetFullPath($ArtifactDirectory)
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null
$unpackedPath = $null

function Find-WindowsSdkTool {
    param([Parameter(Mandatory)][string]$Name)
    $kitsRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
    $tool = Get-ChildItem -LiteralPath $kitsRoot -Filter $Name -Recurse `
        -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\(arm64|x64)\\$([regex]::Escape($Name))$" } |
        Sort-Object -Property FullName -Descending |
        Select-Object -First 1
    if (-not $tool) { throw "$Name was not found in the Windows SDK." }
    return $tool.FullName
}

# Add-AppxPackage is not reliable on GitHub's hosted ARM image and can block
# inside the deployment service indefinitely. An unpacked MSIX executable does
# not have package identity, so it cannot faithfully represent a Store launch
# either. Authenticode policy verification can also block while it checks online
# revocation endpoints. Partner Center performs signing and installation
# validation; here we validate the MSIX, manifest, and ARM64 payload with the
# native Windows SDK.
$makeAppx = Find-WindowsSdkTool -Name "makeappx.exe"
$unpackedPath = Join-Path $env:RUNNER_TEMP "veritypdf-arm64-unpacked"
if (Test-Path -LiteralPath $unpackedPath) {
    Remove-Item -LiteralPath $unpackedPath -Recurse -Force
}
& $makeAppx unpack /p $packagePath /d $unpackedPath /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx could not unpack the ARM64 MSIX." }
$executable = Join-Path $unpackedPath "verity-pdf.exe"

if (-not (Test-Path -LiteralPath $executable)) {
    throw "The packaged ARM64 executable is missing."
}
$bytes = [System.IO.File]::ReadAllBytes($executable)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
if ($machine -ne 0xAA64) {
    throw ("Expected PE machine AA64, found {0:X4}." -f $machine)
}

[xml]$manifest = Get-Content -LiteralPath (Join-Path $unpackedPath "AppxManifest.xml")
$identity = $manifest.Package.Identity
if ($identity.ProcessorArchitecture -ne "arm64") {
    throw "The package manifest architecture is '$($identity.ProcessorArchitecture)', not arm64."
}
$application = $manifest.Package.Applications.Application | Select-Object -First 1
if (-not $application -or $application.Executable -ne "verity-pdf.exe") {
    throw "The package manifest does not declare the VerityPDF executable."
}

@{
    package = Split-Path -Leaf $packagePath
    architecture = $identity.ProcessorArchitecture
    executable = $application.Executable
    machine = ("{0:X4}" -f $machine)
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifactPath "arm64-package-validation.json")
