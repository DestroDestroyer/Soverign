$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Soverign.lnk')
$OldDesktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'J.A.R.V.I.S..lnk')

# Remove old shortcut if it exists
if (Test-Path $OldDesktopPath) {
    Remove-Item $OldDesktopPath -Force
    Write-Host "Removed old J.A.R.V.I.S. shortcut." -ForegroundColor Yellow
}

$ProjectDir = $PSScriptRoot
$WorkspaceRoot = (Get-Item $PSScriptRoot).Parent.FullName
$ElectronPath = "$ProjectDir\node_modules\electron\dist\electron.exe"
$BatPath = "$WorkspaceRoot\run_soverign.bat"

if (-not (Test-Path $BatPath)) {
    Write-Host "Error: run_soverign.bat not found at $BatPath. Please run from the project structure." -ForegroundColor Red
    exit 1
}

$Shortcut = $WshShell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = $BatPath
$Shortcut.WorkingDirectory = $WorkspaceRoot
$Shortcut.Description = "Launch Soverign AI Console & Daemon"
if (Test-Path $ElectronPath) {
    $Shortcut.IconLocation = "$ElectronPath,0"
}
$Shortcut.Save()

Write-Host "Successfully created Soverign Desktop shortcut targeting run_soverign.bat at $DesktopPath" -ForegroundColor Green
