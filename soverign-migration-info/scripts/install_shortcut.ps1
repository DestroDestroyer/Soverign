$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Soverign.lnk')
$OldDesktopPath = [System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'J.A.R.V.I.S..lnk')

# Remove old shortcut if it exists
if (Test-Path $OldDesktopPath) {
    Remove-Item $OldDesktopPath -Force
    Write-Host "Removed old J.A.R.V.I.S. shortcut." -ForegroundColor Yellow
}

$ProjectDir = "D:\Soverign\soverign-desktop"
$ElectronPath = "$ProjectDir\node_modules\electron\dist\electron.exe"

if (-not (Test-Path $ElectronPath)) {
    Write-Host "Error: Electron executable not found at $ElectronPath. Please ensure npm install has completed successfully." -ForegroundColor Red
    exit 1
}

$Shortcut = $WshShell.CreateShortcut($DesktopPath)
$Shortcut.TargetPath = $ElectronPath
$Shortcut.Arguments = "`"$ProjectDir`""
$Shortcut.WorkingDirectory = $ProjectDir
$Shortcut.Description = "Launch Soverign Desktop Console"
$Shortcut.IconLocation = "$ElectronPath,0"
$Shortcut.Save()

Write-Host "Successfully created Soverign Desktop shortcut at $DesktopPath" -ForegroundColor Green
