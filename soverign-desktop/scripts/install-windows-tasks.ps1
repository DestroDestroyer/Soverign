#Requires -RunAsAdministrator
<#
  Soverign — Install 24/7 Background Services
  ---------------------------------------------------------------------------
  Registers BOTH the Soverign Daemon AND the Sidecar as native Windows
  Scheduled Tasks. Once installed they:

    - Start automatically every time you log on
    - Keep running even after you close the Soverign Desktop Console
    - Auto-restart if they crash (RestartCount 999, interval 1 min)
    - Require ZERO extra software — pure schtasks / Task Scheduler

  Usage (run as Administrator):
    .\install-windows-tasks.ps1
    .\install-windows-tasks.ps1 -SkipSidecar    # daemon only
#>

param(
  [switch]$SkipSidecar
)

$ErrorActionPreference = 'Stop'

# ── Resolve bun.exe ──────────────────────────────────────────────────────────
function Resolve-BunPath {
  $cmd = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "bun.exe not found on PATH or at $fallback. Install Bun: https://bun.sh"
}

$bunPath = Resolve-BunPath

# ── Resolve project paths ────────────────────────────────────────────────────
# This script lives at:  <root>\soverign-desktop\scripts\install-windows-tasks.ps1
# So the core dir is:   <root>\soverign-core
$scriptDir    = $PSScriptRoot                                         # …\soverign-desktop\scripts
$desktopDir   = (Get-Item $scriptDir).Parent.FullName                 # …\soverign-desktop
$workspaceRoot = (Get-Item $desktopDir).Parent.FullName               # …\Soverign
$coreDir      = Join-Path $workspaceRoot "soverign-core"

$daemonScript  = Join-Path $coreDir "src\daemon\index.ts"
$sidecarScript = Join-Path $coreDir "src\sidecar\index.ts"

if (-not (Test-Path $daemonScript)) {
  throw "Daemon entry point not found: $daemonScript"
}
if (-not $SkipSidecar -and -not (Test-Path $sidecarScript)) {
  Write-Host "[WARN] Sidecar entry point not found: $sidecarScript" -ForegroundColor Yellow
  Write-Host "[WARN] Skipping sidecar registration." -ForegroundColor Yellow
  $SkipSidecar = $true
}

# ── Ensure log directory ─────────────────────────────────────────────────────
$dataDir  = Join-Path $env:USERPROFILE ".soverign"
$logFile  = Join-Path $dataDir "soverign.log"
$sidecarLogFile = Join-Path $dataDir "sidecar.log"

if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
foreach ($f in @($logFile, $sidecarLogFile)) {
  if (-not (Test-Path $f)) { New-Item -ItemType File -Path $f -Force | Out-Null }
}

Write-Host ""
Write-Host "Bun:            $bunPath"      -ForegroundColor Cyan
Write-Host "Core dir:       $coreDir"      -ForegroundColor Cyan
Write-Host "Daemon script:  $daemonScript" -ForegroundColor Cyan
if (-not $SkipSidecar) {
  Write-Host "Sidecar script: $sidecarScript" -ForegroundColor Cyan
}
Write-Host "Log dir:        $dataDir"      -ForegroundColor Cyan
Write-Host ""

# ── Shared task settings ─────────────────────────────────────────────────────
$commonSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -Hidden

# ── Daemon task ──────────────────────────────────────────────────────────────
$daemonArg = "/c `"`"$bunPath`" run `"$daemonScript`" >> `"$logFile`" 2>&1`""

$daemonAction  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $daemonArg -WorkingDirectory $coreDir
$daemonTrigger = New-ScheduledTaskTrigger -AtLogOn

Unregister-ScheduledTask -TaskName "SoverignDaemon" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName    "SoverignDaemon" `
  -Action      $daemonAction `
  -Trigger     $daemonTrigger `
  -Settings    $commonSettings `
  -RunLevel    Highest `
  -Description "Soverign local AI daemon. Runs 24/7, restarts on crash." | Out-Null

Write-Host "[OK] SoverignDaemon task registered." -ForegroundColor Green

# ── Sidecar task ─────────────────────────────────────────────────────────────
if (-not $SkipSidecar) {
  $sidecarArg = "/c `"`"$bunPath`" run `"$sidecarScript`" >> `"$sidecarLogFile`" 2>&1`""

  $sidecarAction  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $sidecarArg -WorkingDirectory $coreDir
  $sidecarTrigger = New-ScheduledTaskTrigger -AtLogOn
  $sidecarTrigger.Delay = 'PT15S'   # 15s head-start for daemon

  Unregister-ScheduledTask -TaskName "SoverignSidecar" -Confirm:$false -ErrorAction SilentlyContinue

  Register-ScheduledTask `
    -TaskName    "SoverignSidecar" `
    -Action      $sidecarAction `
    -Trigger     $sidecarTrigger `
    -Settings    $commonSettings `
    -RunLevel    Highest `
    -Description "Soverign sidecar. Runs 24/7 in the background, restarts on crash." | Out-Null

  Write-Host "[OK] SoverignSidecar task registered." -ForegroundColor Green
}

# ── Start tasks immediately (no need to log off/on) ─────────────────────────
Write-Host ""
Write-Host "Starting tasks now..." -ForegroundColor Cyan

Start-ScheduledTask -TaskName "SoverignDaemon"
Write-Host "[OK] SoverignDaemon started." -ForegroundColor Green

if (-not $SkipSidecar) {
  Start-Sleep -Seconds 3
  Start-ScheduledTask -TaskName "SoverignSidecar"
  Write-Host "[OK] SoverignSidecar started." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! Both services now run 24/7, survive app close, and restart on crash." -ForegroundColor Cyan
Write-Host "Manage them via Task Scheduler (taskschd.msc) or the Soverign Console." -ForegroundColor Cyan
