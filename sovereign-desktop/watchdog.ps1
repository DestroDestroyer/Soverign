param(
  [int]$Port = 3142,
  [int]$PollIntervalSec = 10,
  [string]$DaemonName = "sovereign-core"
)

$ErrorActionPreference = "Continue"

function Test-DaemonHealth {
  try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    return $resp.StatusCode -eq 200
  } catch {
    return $false
  }
}

while ($true) {
  Start-Sleep -Seconds $PollIntervalSec
  if (-not (Test-DaemonHealth)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] WATCHDOG: Daemon unhealthy, restarting..."
    $process = Get-Process -Name $DaemonName -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
    # The daemon is typically managed by the Electron main process.
    # If the main process is alive it will restart the daemon child.
    # This script logs the event and exits so Electron can restart it cleanly.
    exit 1
  }
}
