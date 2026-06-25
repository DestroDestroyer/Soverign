#Requires -RunAsAdministrator
<#
  Soverign — Install 24/7 Background Service
  ---------------------------------------------------------------------------
  Registers the UNIFIED Soverign Daemon as a Windows Scheduled Task.

  The daemon already manages everything internally:
    • AI chat / agent services
    • SidecarManager (Claude Code auth + connections)
    • WebSocket server on port 3142
    • Workflow engine
    • Observer + awareness services

  One task. One process. Zero complexity.

  Usage (run as Administrator):
    .\install-windows-tasks.ps1
#>

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
# Script is at: <root>\soverign-desktop\scripts\install-windows-tasks.ps1
$scriptDir     = $PSScriptRoot
$desktopDir    = (Get-Item $scriptDir).Parent.FullName
$workspaceRoot = (Get-Item $desktopDir).Parent.FullName
$coreDir       = Join-Path $workspaceRoot "soverign-core"
$daemonScript  = Join-Path $coreDir "src\daemon\index.ts"

if (-not (Test-Path $daemonScript)) {
  throw "Daemon entry point not found: $daemonScript"
}

# ── Ensure data / log directory ──────────────────────────────────────────────
$dataDir = Join-Path $env:USERPROFILE ".soverign"
$logFile = Join-Path $dataDir "soverign.log"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (-not (Test-Path $logFile))  { New-Item -ItemType File    -Path $logFile -Force | Out-Null }

# ── Ensure config.yaml is valid (no duplicate keys) ─────────────────────────
$configFile = Join-Path $dataDir "config.yaml"
$defaultConfig = @"
llm:
  default: "ollama:qwen2.5:1.5b"
  providers:
    ollama:
      kind: ollama
      base_url: "http://127.0.0.1:11434"
  tiers: {}
"@
if (-not (Test-Path $configFile)) {
  $defaultConfig | Set-Content $configFile -Encoding UTF8
  Write-Host "[OK] Created default config.yaml" -ForegroundColor Green
}

# ── Print summary ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Bun:    $bunPath"     -ForegroundColor Cyan
Write-Host "Core:   $coreDir"    -ForegroundColor Cyan
Write-Host "Entry:  $daemonScript" -ForegroundColor Cyan
Write-Host "Log:    $logFile"    -ForegroundColor Cyan
Write-Host ""

# ── Remove old separate tasks (clean up legacy setup) ────────────────────────
foreach ($old in @('SoverignDaemon','SoverignSidecar')) {
  Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction SilentlyContinue
}

# ── Build the single unified task ────────────────────────────────────────────
# We use a .vbs wrapper to launch cmd.exe silently so no black window remains.
$vbsScript = Join-Path $dataDir "run-hidden.vbs"
$vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")`nWshShell.Run WScript.Arguments(0), 0, False"
Set-Content -Path $vbsScript -Value $vbsContent -Encoding Ascii

# cmd.exe wrapping ensures bun stdout/stderr are flushed to the log file
$cmdArg = "/c `"`"$bunPath`" run `"$daemonScript`" >> `"$logFile`" 2>&1`""
$taskArg = "`"$vbsScript`" `"cmd.exe $cmdArg`""

$action   = New-ScheduledTaskAction -Execute "wscript.exe" -Argument $taskArg -WorkingDirectory $coreDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -Hidden

Register-ScheduledTask `
  -TaskName    "SoverignService" `
  -Action      $action `
  -Trigger     $trigger `
  -Settings    $settings `
  -RunLevel    Highest `
  -Description "Soverign unified AI daemon. Manages all AI, sidecar, and workflow services. Runs 24/7, auto-restarts on crash." | Out-Null

Write-Host "[OK] SoverignService task registered." -ForegroundColor Green

# ── Start task immediately ────────────────────────────────────────────────────
Write-Host "Starting service now..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "SoverignService"
Start-Sleep -Seconds 2

$status = (Get-ScheduledTaskInfo -TaskName "SoverignService").LastTaskResult
Write-Host "[OK] SoverignService started (last result: $status)." -ForegroundColor Green

Write-Host ""
Write-Host "Done! Soverign now runs 24/7, survives app close, and auto-restarts on crash." -ForegroundColor Cyan
Write-Host "Manage via Task Scheduler (taskschd.msc) or the Soverign Console." -ForegroundColor Cyan
