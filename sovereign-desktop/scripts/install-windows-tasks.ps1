#Requires -RunAsAdministrator
<#
  Sovereign — Install 24/7 Background Brain Service
  ---------------------------------------------------------------------------
  Registers the Sovereign Brain as a Windows Scheduled Task.
  The Brain provides LLM, Vault, Agent, and Authority services 24/7.

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
$scriptDir     = $PSScriptRoot
$desktopDir    = (Get-Item $scriptDir).Parent.FullName
$workspaceRoot = (Get-Item $desktopDir).Parent.FullName
$coreDir       = Join-Path $workspaceRoot "sovereign-core"
$brainScript   = Join-Path $coreDir "src\brain\index.ts"

if (-not (Test-Path $brainScript)) {
  throw "Brain entry point not found: $brainScript"
}

# ── Ensure data / log directory ──────────────────────────────────────────────
$dataDir = Join-Path $env:USERPROFILE ".sovereign"
$logFile = Join-Path $dataDir "sovereign.log"
$dbFile  = Join-Path $dataDir "sovereign.db"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (-not (Test-Path $logFile))  { New-Item -ItemType File    -Path $logFile -Force | Out-Null }

# ── Ensure config.yaml is valid ──────────────────────────────────────────────
$configFile = Join-Path $dataDir "config.yaml"
$defaultConfig = @"
llm:
  default: "ollama:qwen2.5:0.5b"
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
Write-Host "Brain:  $brainScript" -ForegroundColor Cyan
Write-Host "Log:    $logFile"    -ForegroundColor Cyan
Write-Host "DB:     $dbFile"     -ForegroundColor Cyan
Write-Host ""

# ── Remove old separate tasks (clean up legacy) ──────────────────────────────
foreach ($old in @('SovereignService', 'SovereignDaemon', 'SovereignSidecar')) {
  Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction SilentlyContinue
}

# ── Build the single unified brain task ──────────────────────────────────────
# Use a .vbs wrapper to launch cmd.exe silently so no black window remains.
$vbsScript = Join-Path $dataDir "run-hidden.vbs"
$vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")" + "`n" + "WshShell.Run WScript.Arguments(0), 0, False"
Set-Content -Path $vbsScript -Value $vbsContent -Encoding Ascii

# Properly quote paths that might contain spaces
$quotedBun  = "`"$bunPath`""
$quotedBrain = "`"$brainScript`""
$quotedLog  = "`"$logFile`""
$quotedDb   = "`"$dbFile`""

# Brain runs standalone (no stdin/stdout IPC from Electron)
$runCommand = "$quotedBun run $quotedBrain --db-path $quotedDb >> $quotedLog 2>&1"
$wscriptArg = "`"$vbsScript`" `"cmd.exe /c $runCommand`""

$action   = New-ScheduledTaskAction -Execute "wscript.exe" -Argument $wscriptArg -WorkingDirectory $coreDir
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
  -TaskName    "SovereignService" `
  -Action      $action `
  -Trigger     $trigger `
  -Settings    $settings `
  -RunLevel    Highest `
  -Description "Sovereign Brain service. Runs LLM, Vault, Agent, and Authority 24/7, auto-restarts on crash." | Out-Null

Write-Host "[OK] SovereignService task registered." -ForegroundColor Green

# ── Start task immediately ────────────────────────────────────────────────────
Write-Host "Starting service now..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "SovereignService"
Start-Sleep -Seconds 2

$status = (Get-ScheduledTaskInfo -TaskName "SovereignService").LastTaskResult
Write-Host "[OK] SovereignService started (last result: $status)." -ForegroundColor Green

Write-Host ""
Write-Host "Done! The Sovereign Brain now runs 24/7, survives app close, and auto-restarts on crash." -ForegroundColor Cyan
Write-Host "Manage via Task Scheduler (taskschd.msc) or the Sovereign Console." -ForegroundColor Cyan
