@echo off
title SOVERIGN Stopper
cls
echo ====================================================================
echo                   Stopping Soverign Services
echo ====================================================================
echo.

:: Step 1: Kill the Windows Sidecar client
echo [1/2] Stopping native Windows sidecar client...
tasklist | findstr "soverign-sidecar.exe" >nul
if %errorlevel% equ 0 (
    taskkill /IM soverign-sidecar.exe /F >nul 2>nul
    echo [OK] Windows Sidecar stopped.
) else (
    echo [INFO] Windows Sidecar is not running.
)
echo.

:: Step 2: Stop the WSL2 Daemon
echo [2/2] Stopping SOVERIGN Daemon in WSL2 (Ubuntu)...
wsl -d Ubuntu -u root pkill -f soverign >nul 2>nul
wsl -d Ubuntu -u root pkill -f brain >nul 2>nul
echo [OK] WSL2 Daemon stopped.
echo.

echo ====================================================================
echo                   Soverign stopped successfully.
echo ====================================================================
timeout /t 3 > nul
