@echo off
title Soverign Launcher
cls
echo ====================================================================
echo                    Soverign — Windows Native Launcher
echo ====================================================================
echo.

:: Step 1: Check if Soverign Daemon is already running on port 3142
echo [1/3] Checking if Soverign Daemon is running on port 3142...
netstat -ano | findstr ":3142" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Soverign Daemon is already running on port 3142.
    goto :launch_electron
)

:: Check if Bun is installed
where bun >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] 'bun' not found. Trying to install...
    winget install OvenMediaEngine.Bun -e --silent
    if %errorlevel% neq 0 (
        echo [ERROR] Could not install Bun automatically.
        echo Please install manually: https://bun.sh
        pause
        exit /b 1
    )
)

:: Start the daemon natively using Bun (background, no WSL needed)
echo [INFO] Starting Soverign Daemon (native Windows)...
set "CORE_DIR=%~dp0soverign-core"
set "DATA_DIR=%USERPROFILE%\.soverign"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

:: Start daemon detached (output to log file)
start /b "" bun run "%CORE_DIR%\src\daemon\index.ts" > "%DATA_DIR%\soverign.log" 2>&1

echo [INFO] Daemon started. Waiting for it to initialize (10s)...
timeout /t 10 /nobreak >nul

netstat -ano | findstr ":3142" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Soverign Daemon is now running on port 3142!
) else (
    echo [WARNING] Daemon may still be loading. Check %DATA_DIR%\soverign.log for details.
)
echo.

:launch_electron
:: Step 2: Launch the Electron Desktop Console
echo [2/3] Launching Soverign Desktop Console...
set "DESKTOP_DIR=%~dp0soverign-desktop"

where electron >nul 2>&1
if %errorlevel% equ 0 (
    start "" electron "%DESKTOP_DIR%"
) else (
    :: Try via npx or node_modules
    if exist "%DESKTOP_DIR%\node_modules\.bin\electron.cmd" (
        start "" "%DESKTOP_DIR%\node_modules\.bin\electron.cmd" "%DESKTOP_DIR%"
    ) else (
        echo [INFO] Installing Electron dependencies...
        cd /d "%DESKTOP_DIR%"
        call npm install
        start "" npm start
    )
)

:: Step 3: Done
echo.
echo [3/3] Soverign is starting up!
echo.
echo ====================================================================
echo  Dashboard will appear in the Electron window.
echo  Log file: %USERPROFILE%\.soverign\soverign.log
echo ====================================================================
echo.
pause
