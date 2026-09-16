[CmdletBinding()]
param([string]$MakeNsis = "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe")
$ErrorActionPreference = "Stop"
$testId = [guid]::NewGuid().ToString('N')
$testOutput = Join-Path ([System.IO.Path]::GetTempPath()) "veritypdf-installer-path-test-$testId.exe"
$hookFile = (Resolve-Path (Join-Path $PSScriptRoot '../src-tauri/installer/upgrade-hooks.nsh')).Path
& $MakeNsis /V2 "/DTEST_ID=$testId" "/DTEST_OUTPUT=$testOutput" "/DHOOK_FILE=$hookFile" (Join-Path $PSScriptRoot 'test-nsis-upgrade-path.nsi')
if ($LASTEXITCODE -ne 0) { throw "NSIS hook test compilation failed." }
try {
    $process = Start-Process -FilePath $testOutput -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "NSIS upgrade-path tests failed: $($process.ExitCode)" }
    Write-Output 'NSIS upgrade-path tests passed: legacy, current, quoted/custom directory, and fresh installation.'
} finally {
    Remove-Item -LiteralPath $testOutput -Force -ErrorAction SilentlyContinue
}
