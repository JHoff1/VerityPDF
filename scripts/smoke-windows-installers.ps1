[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Msi,
    [Parameter(Mandatory)][string]$Nsis,
    [Parameter(Mandatory)][string]$Pdf,
    [string]$PreviousMsi,
    [string]$PreviousNsis,
    [string]$ArtifactDirectory = "smoke-artifacts"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$msiPath = (Resolve-Path -LiteralPath $Msi).Path
$nsisPath = (Resolve-Path -LiteralPath $Nsis).Path
$pdfPath = (Resolve-Path -LiteralPath $Pdf).Path
$artifactPath = [System.IO.Path]::GetFullPath($ArtifactDirectory)
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null

function Invoke-Msi {
    param([string[]]$Arguments, [string]$Label = "msi")
    $logPath = Join-Path $artifactPath "$Label-msiexec.log"
    $loggedArguments = @($Arguments) + @("/l*v", $logPath)
    $process = Start-Process msiexec.exe -ArgumentList $loggedArguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 1641, 3010)) {
        throw "msiexec failed with exit code $($process.ExitCode)."
    }
}

function Get-VerityInstall {
    $entries = @(
        Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" `
            -ErrorAction SilentlyContinue
        Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" `
            -ErrorAction SilentlyContinue
        Get-ItemProperty "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" `
            -ErrorAction SilentlyContinue
    ) | Where-Object {
        $_.PSObject.Properties["DisplayName"] -and
        $_.DisplayName -like "VerityPDF*"
    } | Sort-Object {
        $displayVersion = if ($_.PSObject.Properties["DisplayVersion"]) {
            $_.DisplayVersion
        } else {
            "0.0.0"
        }
        [version]($displayVersion -replace '[^0-9.]', '')
    } -Descending
    return $entries | Select-Object -First 1
}

function Find-InstalledExecutable {
    $entry = Get-VerityInstall
    $candidates = @()
    if ($entry -and $entry.InstallLocation) {
        # Windows Installer may retain the surrounding quotes used in the
        # registry value. Trim them before treating it as a filesystem path.
        $installLocation = ([string]$entry.InstallLocation).Trim().Trim('"')
        if ($installLocation) {
            $candidates += Join-Path $installLocation "VerityPDF.exe"
            $candidates += Join-Path $installLocation "verity-pdf.exe"
        }
    }
    $candidates += "$env:LOCALAPPDATA\VerityPDF\VerityPDF.exe"
    $candidates += "$env:LOCALAPPDATA\VerityPDF\verity-pdf.exe"
    $candidates += "$env:ProgramFiles\VerityPDF\VerityPDF.exe"
    $candidates += "$env:ProgramFiles\VerityPDF\verity-pdf.exe"
    return $candidates | Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
}

function Assert-PdfAssociation {
    # File associations may be registered as values under OpenWithProgids,
    # rather than child keys. HKCR also merges per-user and machine classes,
    # so inspect both locations and verify that the resolved open command is
    # actually VerityPDF instead of merely seeing an unrelated PDF handler.
    $classRoots = @(
        "Registry::HKEY_CLASSES_ROOT",
        "HKCU:\Software\Classes"
    )
    foreach ($classRoot in $classRoots) {
        $extensionPath = Join-Path $classRoot ".pdf"
        $progIds = @()
        $extension = Get-ItemProperty -LiteralPath $extensionPath -ErrorAction SilentlyContinue
        if ($extension -and $extension.PSObject.Properties["(default)"]) {
            $progIds += [string]$extension."(default)"
        }

        $openWith = Get-ItemProperty -LiteralPath (Join-Path $extensionPath "OpenWithProgids") `
            -ErrorAction SilentlyContinue
        if ($openWith) {
            $progIds += $openWith.PSObject.Properties |
                Where-Object { $_.Name -notmatch '^PS' } |
                ForEach-Object Name
        }

        foreach ($progId in $progIds | Where-Object { $_ } | Select-Object -Unique) {
            $command = Get-ItemPropertyValue `
                -LiteralPath (Join-Path $classRoot "$progId\shell\open\command") `
                -Name "(default)" -ErrorAction SilentlyContinue
            if ([string]$command -match '(?i)(VerityPDF|verity-pdf)\.exe') {
                return
            }
        }

        # NSIS may use an application registration directly while installing.
        foreach ($application in @("VerityPDF.exe", "verity-pdf.exe")) {
            $command = Get-ItemPropertyValue `
                -LiteralPath (Join-Path $classRoot "Applications\$application\shell\open\command") `
                -Name "(default)" -ErrorAction SilentlyContinue
            if ([string]$command -match '(?i)(VerityPDF|verity-pdf)\.exe') {
                return
            }
        }
    }
    throw "No VerityPDF PDF file association was registered."
}

function Test-InstalledApp {
    param([string]$Label)
    $executable = Find-InstalledExecutable
    if (-not $executable) { throw "$Label did not install the application executable." }
    Assert-PdfAssociation
    & (Join-Path $PSScriptRoot "smoke-windows-app.ps1") `
        -Executable $executable -Pdf $pdfPath `
        -ArtifactDirectory $artifactPath -Label $Label
}

function Remove-NsisInstall {
    $entry = Get-VerityInstall
    if (-not $entry -or -not $entry.UninstallString) { return }
    $command = $entry.UninstallString.Trim('"')
    $process = Start-Process -FilePath $command -ArgumentList "/S" -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "The NSIS uninstaller failed with exit code $($process.ExitCode)."
    }
}

function Assert-AppRemoved {
    param([string]$Label)
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    do {
        if (-not (Find-InstalledExecutable)) { return }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    $remaining = Find-InstalledExecutable
    throw "$Label left the application executable at $remaining."
}

try {
    if ($PreviousMsi -and (Test-Path -LiteralPath $PreviousMsi)) {
        Invoke-Msi -Label "previous-install" -Arguments @("/i", (Resolve-Path $PreviousMsi).Path, "/qn", "/norestart")
        Test-InstalledApp "msi-previous"
    }
    Invoke-Msi -Label "current-install" -Arguments @("/i", $msiPath, "/qn", "/norestart")
    Test-InstalledApp "msi-current"
    Invoke-Msi -Label "current-uninstall" -Arguments @("/x", $msiPath, "/qn", "/norestart")
    Assert-AppRemoved "The MSI uninstall"

    if ($PreviousNsis -and (Test-Path -LiteralPath $PreviousNsis)) {
        $previous = Start-Process -FilePath (Resolve-Path $PreviousNsis).Path `
            -ArgumentList "/S" -Wait -PassThru
        if ($previous.ExitCode -ne 0) { throw "Previous NSIS install failed." }
        Test-InstalledApp "nsis-previous"
    }
    $current = Start-Process -FilePath $nsisPath -ArgumentList "/S" -Wait -PassThru
    if ($current.ExitCode -ne 0) { throw "Current NSIS install failed." }
    Test-InstalledApp "nsis-current"
    Remove-NsisInstall
    Assert-AppRemoved "The NSIS uninstall"
}
finally {
    try { Invoke-Msi -Label "cleanup-uninstall" -Arguments @("/x", $msiPath, "/qn", "/norestart") } catch {}
    try { Remove-NsisInstall } catch {}
}
