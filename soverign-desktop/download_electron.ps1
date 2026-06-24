$Version = "31.7.7"
$Url = "https://github.com/electron/electron/releases/download/v$Version/electron-v$Version-win32-x64.zip"
$ZipPath = Join-Path $PSScriptRoot "electron.zip"
$DestPath = Join-Path $PSScriptRoot "node_modules\electron\dist"

Write-Host "Creating dist directory if missing..." -ForegroundColor Cyan
if (-not (Test-Path $DestPath)) {
    New-Item -ItemType Directory -Force -Path $DestPath | Out-Null
}

Write-Host "Downloading Electron v$Version from $Url..." -ForegroundColor Cyan
# Using BITS transfer or WebClient for reliable download
try {
    Start-BitsTransfer -Source $Url -Destination $ZipPath -ErrorAction Stop
} catch {
    Write-Host "BITS transfer failed. Falling back to Invoke-WebRequest..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath
}

Write-Host "Extracting to $DestPath..." -ForegroundColor Cyan
# Expand-Archive might fail if dist directory has locked files, we force it
Expand-Archive -Path $ZipPath -DestinationPath $DestPath -Force

Write-Host "Writing path.txt..." -ForegroundColor Cyan
"electron.exe" | Out-File -FilePath (Join-Path $PSScriptRoot "node_modules\electron\path.txt") -Encoding ascii -NoNewline
# Also write version file in dist just in case
"v$Version" | Out-File -FilePath "$DestPath\version" -Encoding ascii -NoNewline

Write-Host "Cleaning up zip..." -ForegroundColor Cyan
Remove-Item -Path $ZipPath -Force

Write-Host "Electron binary manual installation complete!" -ForegroundColor Green
