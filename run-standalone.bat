@echo off
REM SOVEREIGN Standalone Launcher for Windows
REM Runs completely offline without external services

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║    SOVEREIGN Standalone (Offline Mode on Windows)       ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if Bun is installed
where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Bun is not installed or not in PATH
    echo.
    echo Installing Bun...
    powershell -Command "irm https://bun.sh/install.ps1 | iex"
    
    REM Add Bun to PATH for this session
    for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "PATH=%%b;!PATH!"
)

REM Check if Ollama is running
echo Checking Ollama availability...
powershell -Command "try { $null = Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2; exit 0 } catch { exit 1 }"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ⚠️  Ollama is not running!
    echo.
    echo To use AI features, you need to:
    echo   1. Download Ollama from https://ollama.ai
    echo   2. Run: ollama pull mistral
    echo   3. Start Ollama (it will run in the background on port 11434)
    echo.
    echo Continuing without AI support...
    echo.
)

REM Get the directory where this script is located
cd /d "%~dp0"

REM Navigate to sovereign-core
if exist "sovereign-core\" (
    cd sovereign-core
) else (
    echo Error: sovereign-core directory not found!
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules\" (
    echo Installing dependencies...
    call bun install
)

REM Set environment variables
set SOVEREIGN_PORT=3142
set OLLAMA_URL=http://localhost:11434
set OLLAMA_MODEL=mistral

REM Start the standalone server
echo.
echo Starting SOVEREIGN Standalone Server...
echo Dashboard: http://localhost:3142
echo.
echo Press Ctrl+C to stop.
echo.

call bun run src/standalone-server.ts
