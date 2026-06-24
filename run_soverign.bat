@echo off
REM ═══════════════════════════════════════════════════════════════
REM  run_soverign.bat  —  Launch Soverign Desktop Console
REM  Place this at the Soverign workspace root (parent of soverign-desktop\)
REM ═══════════════════════════════════════════════════════════════
setlocal

REM Resolve paths relative to this bat file's location
set "WORKSPACE_ROOT=%~dp0"
set "APP_DIR=%WORKSPACE_ROOT%soverign-desktop"
set "ELECTRON_EXE=%APP_DIR%\node_modules\electron\dist\electron.exe"

REM Ensure node_modules\electron is installed
if not exist "%ELECTRON_EXE%" (
    echo [ERROR] Electron not found at: %ELECTRON_EXE%
    echo [INFO]  Run: cd "%APP_DIR%" ^&^& npm install
    pause
    exit /b 1
)

REM Launch Electron in the background (no console window)
start "" "%ELECTRON_EXE%" "%APP_DIR%"
