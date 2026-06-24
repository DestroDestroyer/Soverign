#Requires -RunAsAdministrator
<#
  Soverign — Uninstall 24/7 Background Service
  ---------------------------------------------------------------------------
  Removes the SoverignDaemon and SoverignSidecar Windows Scheduled Tasks
  that install-windows-tasks.ps1 created. Stops any currently running
  instance first, then deletes the task definitions.
#>

$ErrorActionPreference = 'SilentlyContinue'

foreach ($taskName in @('SoverignDaemon', 'SoverignSidecar')) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[OK] Removed task: $taskName" -ForegroundColor Green
  } else {
    Write-Host "[SKIP] Task not found: $taskName" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Soverign's 24/7 background service has been removed." -ForegroundColor Cyan
Write-Host "Starting the daemon/sidecar from the desktop app will no longer work until you reinstall the service." -ForegroundColor Cyan
