Write-Host "Running process inspection..."
$all = Get-Process
Write-Host "Total processes: $($all.Count)"
$withHwnd = $all | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowHandle -ne [IntPtr]::Zero }
Write-Host "Processes with MainWindowHandle: $($withHwnd.Count)"
foreach ($p in $withHwnd) {
  Write-Host "PID: $($p.Id) | Name: $($p.ProcessName) | Title: '$($p.MainWindowTitle)'"
}
