[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$LogPath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Interactive installer smoke tests run only on disposable GitHub Actions runners.' }
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class VerityInstallerUi {
  public delegate bool Callback(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumWindows(Callback callback, IntPtr param);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out int pid);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  public static IntPtr[] Windows(IntPtr parent) {
    var result = new List<IntPtr>();
    Callback callback = (hwnd, param) => { result.Add(hwnd); return true; };
    if (parent == IntPtr.Zero) EnumWindows(callback, IntPtr.Zero); else EnumChildWindows(parent, callback, IntPtr.Zero);
    return result.ToArray();
  }
  public static int ProcessId(IntPtr hwnd) { int pid; GetWindowThreadProcessId(hwnd, out pid); return pid; }
  public static string Text(IntPtr hwnd) { var text = new StringBuilder(4096); GetWindowText(hwnd, text, text.Capacity); return text.ToString(); }
  public static void Click(IntPtr hwnd) { PostMessage(hwnd, 0xF5, IntPtr.Zero, IntPtr.Zero); }
}
'@
$process = Start-Process -FilePath (Resolve-Path -LiteralPath $Installer).Path -WindowStyle Hidden -PassThru
$ids = [System.Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($process.Id)
$selectedUninstall = $false
$sawUninstaller = $false
$log = [System.Collections.Generic.List[string]]::new()
$deadline = [DateTime]::UtcNow.AddMinutes(3)
try {
    while (-not $process.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        # Only interact with this installer's process tree, never arbitrary windows.
        $uninstallerIds = @()
        foreach ($child in Get-CimInstance Win32_Process) {
            if ($ids.Contains([int]$child.ParentProcessId)) {
                [void]$ids.Add([int]$child.ProcessId)
                if ($child.Name -ieq 'uninstall.exe') { $sawUninstaller = $true; $uninstallerIds += [int]$child.ProcessId }
            }
        }
        # Win32 messages exercise the real wizard controls even when its
        # window is hidden; no desktop focus or visible popups are required.
        $windows = [VerityInstallerUi]::Windows([IntPtr]::Zero)
        foreach ($window in $windows) {
            $windowProcess = [VerityInstallerUi]::ProcessId($window)
            if (-not $ids.Contains($windowProcess)) { continue }
            if ($uninstallerIds.Count -and $windowProcess -notin $uninstallerIds) { continue }
            $controls = @([VerityInstallerUi]::Windows($window) | ForEach-Object {
                [pscustomobject]@{ Handle = $_; Name = [VerityInstallerUi]::Text($_); Enabled = [VerityInstallerUi]::IsWindowEnabled($_) }
            })
            $names = @($controls | ForEach-Object Name)
            $log.Add("${windowProcess}: $($names -join ' | ')")
            if (($names -join ' ') -match 'Unable to uninstall|could not verify its uninstaller|Error opening file for writing') { throw 'Installer displayed an upgrade error.' }
            $radio = $controls | Where-Object { ($_.Name -replace '&', '') -match '^Uninstall before installing' -and $_.Enabled } | Select-Object -First 1
            if ($radio -and -not $selectedUninstall) {
                [VerityInstallerUi]::Click($radio.Handle)
                $selectedUninstall = $true
                continue
            }
            foreach ($control in $controls) {
                if (($control.Name -replace '&', '') -match '^Run VerityPDF' -and $control.Enabled) {
                    if ([VerityInstallerUi]::SendMessage($control.Handle, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero).ToInt32() -eq 1) { [VerityInstallerUi]::Click($control.Handle) }
                }
            }
            $button = $controls | Where-Object {
                $_.Enabled -and ($_.Name -replace '&', '') -match '^(Next\s*>?|Install|Uninstall|Finish|Close)$'
            } | Select-Object -First 1
            if ($button) { [VerityInstallerUi]::Click($button.Handle) }
        }
        Start-Sleep -Milliseconds 400
        $process.Refresh()
    }
    if (-not $process.HasExited) { throw 'Interactive installer timed out.' }
    if ($process.ExitCode -ne 0) { throw "Interactive installer exit code: $($process.ExitCode)" }
    if (-not $selectedUninstall -or -not $sawUninstaller) { throw 'The test did not exercise the uninstall-first path.' }
} finally {
    $log | Set-Content -LiteralPath $LogPath
    if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null }
}
