@echo off
REM ═══════════════════════════════════════════════════════════════
REM  run_sovereign.bat  —  Launch Sovereign Desktop Console + PAF Watchdog
REM ═══════════════════════════════════════════════════════════════
setlocal

set "WORKSPACE_ROOT=%~dp0"
set "APP_DIR=%WORKSPACE_ROOT%sovereign-desktop"
set "CORE_DIR=%WORKSPACE_ROOT%sovereign-core"
set "ELECTRON_EXE=%APP_DIR%\node_modules\electron\dist\electron.exe"
set "PAF_SCRIPT=%WORKSPACE_ROOT%.agents\problem-detect-and-fix.ts"

REM Ensure node_modules\electron is installed
if not exist "%ELECTRON_EXE%" (
    echo [ERROR] Electron not found at: %ELECTRON_EXE%
    echo [INFO]  Run: cd "%APP_DIR%" ^&^& npm install
    pause
    exit /b 1
)

REM Start the PAF watchdog as a background process (auto-fix on crash) — if the script exists
if exist "%PAF_SCRIPT%" (
    echo [PAF] Starting Problem Detect & Fix watchdog...
    start "PAF-Watchdog" /MIN cmd /c "cd /d "%WORKSPACE_ROOT%" && bun run "%PAF_SCRIPT%" --watchdog --poll=10000"
) else (
    echo [PAF] Problem Detect & Fix script not found — skipping watchdog
)

REM Launch Electron in the background (no console window)
start "" "%ELECTRON_EXE%" "%APP_DIR%"
