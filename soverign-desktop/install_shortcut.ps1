$ErrorActionPreference = 'Stop'

$WshShell     = New-Object -ComObject WScript.Shell
$DesktopPath  = [System.IO.Path]::Combine(
    [System.Environment]::GetFolderPath('Desktop'), 'Soverign.lnk')
$OldPath      = [System.IO.Path]::Combine(
    [System.Environment]::GetFolderPath('Desktop'), 'J.A.R.V.I.S..lnk')

# ── Remove legacy shortcut if it exists ─────────────────────────────────────
if (Test-Path $OldPath) {
    Remove-Item $OldPath -Force
    Write-Host "Removed old J.A.R.V.I.S. shortcut." -ForegroundColor Yellow
}

# ── Resolve paths ────────────────────────────────────────────────────────────
$ProjectDir    = $PSScriptRoot                                # …/soverign-desktop
$WorkspaceRoot = (Get-Item $PSScriptRoot).Parent.FullName     # …/Soverign
$BatPath       = Join-Path $WorkspaceRoot "run_soverign.bat"
$ElectronPath  = Join-Path $ProjectDir "node_modules\electron\dist\electron.exe"

# ── Create run_soverign.bat if it somehow doesn't exist ─────────────────────
if (-not (Test-Path $BatPath)) {
    $batContent = @"
@echo off
setlocal
set "WORKSPACE_ROOT=%~dp0"
set "APP_DIR=%WORKSPACE_ROOT%soverign-desktop"
set "ELECTRON_EXE=%APP_DIR%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
    echo [ERROR] Electron not found. Run: cd "%APP_DIR%" ^&^& npm install
    pause
    exit /b 1
)
start "" "%ELECTRON_EXE%" "%APP_DIR%"
"@
    $batContent | Set-Content -Path $BatPath -Encoding ASCII
    Write-Host "Created run_soverign.bat at: $BatPath" -ForegroundColor Cyan
}

# ── Create desktop shortcut ──────────────────────────────────────────────────
$Shortcut                  = $WshShell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath       = $BatPath
$Shortcut.WorkingDirectory = $WorkspaceRoot
$Shortcut.Description      = "Launch Soverign AI Console & Daemon"
$Shortcut.WindowStyle      = 7   # 7 = minimised (no black CMD flash)

if (Test-Path $ElectronPath) {
    $Shortcut.IconLocation = "$ElectronPath,0"
}

$Shortcut.Save()

Write-Host ""
Write-Host "Desktop shortcut created: $DesktopPath" -ForegroundColor Green
Write-Host "Target: $BatPath" -ForegroundColor Cyan
