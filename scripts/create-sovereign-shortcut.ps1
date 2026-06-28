# Creates (or replaces) a shortcut named 'Sovereign.lnk' on the user's Desktop
# Target: run_sovereign.bat in the repository root
# Working directory: repository root

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetPath = Join-Path $repoRoot "run_sovereign.bat"
$shortcutPath = Join-Path $env:USERPROFILE "Desktop\Sovereign.lnk"

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.WindowStyle = 1
# Optional: set an icon if you have one (e.g., $env:USERPROFILE\.sovereign\icon.ico)
# $shortcut.IconLocation = "$env:USERPROFILE\.sovereign\icon.ico"
$shortcut.Save()
Write-Host "Shortcut created at $shortcutPath pointing to $targetPath"
