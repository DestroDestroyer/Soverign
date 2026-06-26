@echo off
title SOVEREIGN Stopper
cls
echo ====================================================================
echo                   Stopping Sovereign Services
echo ====================================================================
echo.

:: Step 1: Kill the Windows Sidecar client
echo [1/2] Stopping native Windows sidecar client...
tasklist | findstr "sovereign-sidecar.exe" >nul
if %errorlevel% equ 0 (
    taskkill /IM sovereign-sidecar.exe /F >nul 2>nul
    echo [OK] Windows Sidecar stopped.
) else (
    echo [INFO] Windows Sidecar is not running.
)
echo.

:: Step 2: Stop the WSL2 Daemon
echo [2/2] Stopping SOVEREIGN Daemon in WSL2 (Ubuntu)...
wsl -d Ubuntu -u root pkill -f sovereign >nul 2>nul
wsl -d Ubuntu -u root pkill -f brain >nul 2>nul
echo [OK] WSL2 Daemon stopped.
echo.

echo ====================================================================
echo                   Sovereign stopped successfully.
echo ====================================================================
timeout /t 3 > nul
