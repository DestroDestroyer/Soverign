@echo off
title SOVEREIGN Stopper
cls
echo ====================================================================
echo                   Stopping Sovereign Services
echo ====================================================================
echo.

:: Step 1: Kill the Electron app
echo [1/2] Stopping Sovereign Desktop...
tasklist | findstr "electron.exe" >nul
if %errorlevel% equ 0 (
    taskkill /IM electron.exe /F >nul 2>nul
    echo [OK] Electron app stopped.
) else (
    echo [INFO] Electron app is not running.
)
echo.

:: Step 2: Kill any process on port 3142 (daemon/brain)
echo [2/2] Stopping Sovereign daemon on port 3142...
powershell -Command "& {
    $conn = [System.Net.Sockets.TcpClient]::new();
    try { $conn.Connect('127.0.0.1', 3142); $conn.Close(); Write-Output 'Port 3142 is active'; }
    catch { Write-Output 'Port 3142 is free'; }
}"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3142 "') do (
    taskkill /PID %%p /F >nul 2>nul
)
echo [OK] Daemon stopped.
echo.

echo ====================================================================
echo                   Sovereign stopped successfully.
echo ====================================================================
timeout /t 3 > nul
