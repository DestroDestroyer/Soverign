#Requires -RunAsAdministrator
<#
  Soverign — Install 24/7 Background Service
  ---------------------------------------------------------------------------
  Registers the Soverign Daemon (and, optionally, the Sidecar) as native
  Windows Scheduled Tasks. Once installed, they:

    - Start automatically every time you log on
    - Keep running even after you close the Soverign Desktop Console
    - Auto-restart themselves if they crash
    - Require ZERO extra software — no Docker, no WSL, no PM2, no cloud,
      no internet. This uses only schtasks/Task Scheduler, built into
      every copy of Windows.

  Usage (run as Administrator):
    .\install-windows-tasks.ps1                  # daemon only
    .\install-windows-tasks.ps1 -IncludeSidecar   # daemon + sidecar
#>

param(
  [switch]$IncludeSidecar
)

$ErrorActionPreference = 'Stop'

function Resolve-BunPath {
  $cmd = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $fallback) { return $fallback }

  throw "bun.exe was not found on PATH or in $fallback. Install Bun for Windows first: https://bun.sh"
}

# ── Resolve paths ───────────────────────────────────────────────────────────
$bunPath      = Resolve-BunPath
$coreDir      = (Resolve-Path (Join-Path $PSScriptRoot "..\..\soverign-core")).Path
$daemonScript = Join-Path $coreDir "src\daemon\index.ts"

if (-not (Test-Path $daemonScript)) {
  throw "Daemon entry point not found: $daemonScript"
}

$dataDir = Join-Path $env:USERPROFILE ".soverign"
$logFile = Join-Path $dataDir "soverign.log"
if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
if (-not (Test-Path $logFile)) {
  New-Item -ItemType File -Path $logFile -Force | Out-Null
}

Write-Host "Bun:          $bunPath"
Write-Host "Core dir:     $coreDir"
Write-Host "Daemon entry: $daemonScript"
Write-Host "Log file:     $logFile"
Write-Host ""

# ── Daemon task ──────────────────────────────────────────────────────────
# Routed through cmd.exe so stdout/stderr keep landing in soverign.log,
# exactly like the desktop app's log viewer already expects.
$daemonCommandLine = "/c `"`"$bunPath`" run `"$daemonScript`" >> `"$logFile`" 2>&1`""

$daemonAction = New-ScheduledTaskAction `
  -Execute "cmd.exe" `
  -Argument $daemonCommandLine `
  -WorkingDirectory $coreDir

$daemonTrigger = New-ScheduledTaskTrigger -AtLogOn

$daemonSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -Hidden

Unregister-ScheduledTask -TaskName "SoverignDaemon" -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName "SoverignDaemon" `
  -Action $daemonAction `
  -Trigger $daemonTrigger `
  -Settings $daemonSettings `
  -RunLevel Highest `
  -Description "Soverign local AI daemon. Runs 24/7 in the background, restarts on crash." | Out-Null

Write-Host "[OK] SoverignDaemon task registered." -ForegroundColor Green

# ── Sidecar task (optional) ─────────────────────────────────────────────
if ($IncludeSidecar) {
  $sidecarCmd = Get-Command "soverign-sidecar.cmd" -ErrorAction SilentlyContinue
  if ($sidecarCmd) {
    $sidecarAction = New-ScheduledTaskAction -Execute $sidecarCmd.Source

    $sidecarTrigger = New-ScheduledTaskTrigger -AtLogOn
    $sidecarTrigger.Delay = 'PT15S'   # give the daemon a 15s head start

    $sidecarSettings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -RestartCount 999 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -Hidden

    Unregister-ScheduledTask -TaskName "SoverignSidecar" -Confirm:$false -ErrorAction SilentlyContinue

    Register-ScheduledTask `
      -TaskName "SoverignSidecar" `
      -Action $sidecarAction `
      -Trigger $sidecarTrigger `
      -Settings $sidecarSettings `
      -RunLevel Limited `
      -Description "Soverign sidecar client. Runs 24/7 in the background." | Out-Null

    Write-Host "[OK] SoverignSidecar task registered." -ForegroundColor Green
  } else {
    Write-Host "[SKIP] soverign-sidecar.cmd not found on PATH — sidecar task not created." -ForegroundColor Yellow
  }
}

# ── Start immediately so you don't have to log off/on ───────────────────
Start-ScheduledTask -TaskName "SoverignDaemon"
if ($IncludeSidecar -and (Get-ScheduledTask -TaskName "SoverignSidecar" -ErrorAction SilentlyContinue)) {
  Start-ScheduledTask -TaskName "SoverignSidecar"
}

Write-Host ""
Write-Host "Done. Soverign now starts automatically at every login and restarts itself if it crashes." -ForegroundColor Cyan
Write-Host "You can view/manage it any time in Task Scheduler (taskschd.msc) under the root folder." -ForegroundColor Cyan
