param()

$ErrorActionPreference = 'Stop'

$taskName = 'SovereignDaemon'
$workspaceRoot = Resolve-Path "$PSScriptRoot\..\.."
$coreDir = Join-Path $workspaceRoot 'sovereign-core'
$dataDir = "$env:USERPROFILE\.sovereign"
$logFile = Join-Path $dataDir 'daemon-startup.log'
$bunExe = (Get-Command 'bun' -ErrorAction SilentlyContinue).Source

if (-not $bunExe) {
    Write-Error 'bun not found in PATH. Install bun first: https://bun.sh'
    exit 1
}

# Ensure data dir exists
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }

# Remove old task if exists
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

$action = New-ScheduledTaskAction -Execute $bunExe -Argument "run src/brain/index.ts --port 3142" -WorkingDirectory $coreDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

Write-Output "Scheduled task '$taskName' registered — daemon will auto-start on Windows boot."
Write-Output "  Executable: $bunExe"
Write-Output "  Working dir: $coreDir"
Write-Output "To remove later: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
