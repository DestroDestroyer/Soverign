@echo off
setlocal enabledelayedexpansion

set PASS=0
set FAIL=0
set LOGFILE=%USERPROFILE%\.soverign\health.log

echo ============================================
echo   Soverign Health Check
echo   %date% %time%
echo ============================================
echo.

:: Helper: PASS or FAIL
:check
  set LABEL=%~1
  set CMD=%~2
  set EXPECTED=%~3

:: Check 1: Bun version
echo [CHECK] Bun...
bun --version >nul 2>&1
if %errorlevel%==0 (
  for /f %%v in ('bun --version 2^>nul') do set BUN_VER=%%v
  echo   PASS: Bun !BUN_VER!
  set /a PASS+=1
) else (
  echo   FAIL: Bun not found
  set /a FAIL+=1
)

:: Check 2: Node version
echo [CHECK] Node.js...
node --version >nul 2>&1
if %errorlevel%==0 (
  for /f %%v in ('node --version 2^>nul') do set NODE_VER=%%v
  echo   PASS: Node !NODE_VER!
  set /a PASS+=1
) else (
  echo   FAIL: Node.js not found
  set /a FAIL+=1
)

:: Check 3: Ollama
echo [CHECK] Ollama...
ollama --version >nul 2>&1
if %errorlevel%==0 (
  for /f %%v in ('ollama --version 2^>nul') do set OLLAMA_VER=%%v
  echo   PASS: Ollama !OLLAMA_VER!
  set /a PASS+=1
) else (
  echo   WARN: Ollama not found (optional)
)

:: Check 4: Daemon port 3142
echo [CHECK] Daemon port 3142...
powershell -NoProfile -Command "$t = New-Object System.Net.Sockets.TcpClient; try { $t.Connect('127.0.0.1', 3142); $t.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
  echo   PASS: Daemon is running on port 3142
  set /a PASS+=1
) else (
  echo   FAIL: Daemon not running on port 3142
  set /a FAIL+=1
)

:: Check 5: Config dir exists
echo [CHECK] Config directory...
if exist "%USERPROFILE%\.soverign" (
  echo   PASS: %USERPROFILE%\.soverign exists
  set /a PASS+=1
) else (
  echo   FAIL: %USERPROFILE%\.soverign not found
  set /a FAIL+=1
)

:: Check 6: SQLite DB
echo [CHECK] SQLite database...
if exist "%USERPROFILE%\.soverign\soverign.db" (
  echo   PASS: soverign.db exists
  set /a PASS+=1
) else (
  echo   WARN: soverign.db not found (will be created on first run)
)

:: Check 7: Config YAML
echo [CHECK] Config file...
if exist "%USERPROFILE%\.soverign\config.yaml" (
  echo   PASS: config.yaml exists
  set /a PASS+=1
) else (
  echo   WARN: config.yaml not found
)

:: Check 8: soverign-core exists
echo [CHECK] soverign-core...
if exist "%~dp0soverign-core\src\index.ts" (
  echo   PASS: soverign-core source found
  set /a PASS+=1
) else (
  echo   FAIL: soverign-core source not found
  set /a FAIL+=1
)

echo.
echo ============================================
echo   Results: %PASS% passed, %FAIL% failed
echo ============================================

:: Write log
if not exist "%USERPROFILE%\.soverign" mkdir "%USERPROFILE%\.soverign"
echo %date% %time% - PASS:%PASS% FAIL:%FAIL% >> "%LOGFILE%"

if %FAIL% gtr 0 (
  echo.
  echo Some checks failed. Review the output above.
  exit /b 1
) else (
  echo.
  echo All checks passed!
  exit /b 0
)
