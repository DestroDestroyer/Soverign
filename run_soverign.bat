@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Soverign AI — Launcher
echo ============================================
echo.

:: ── Step 1: Ensure Bun is installed ────────────────────────────────────────
echo [INFO] Checking Bun...
where bun >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] Bun not found. Installing via winget...
  winget install --id Oven-sh.Bun --accept-source-agreements --accept-package-agreements
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Bun. Please install manually: https://bun.sh
    pause
    exit /b 1
  )
  :: Reload PATH from registry so bun is available in this session
  for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul ^| find "PATH"') do set "SYSTEM_PATH=%%b"
  for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul ^| find "PATH"') do set "USER_PATH=%%b"
  if defined SYSTEM_PATH set "PATH=!SYSTEM_PATH!;!USER_PATH!;!PATH!"
  echo [INFO] PATH reloaded.
  where bun >nul 2>&1
  if %errorlevel% neq 0 (
    echo [WARN] Bun installed but not in PATH. Please restart your terminal.
    pause
    exit /b 1
  )
)
for /f %%v in ('bun --version 2^>nul') do echo [INFO] Bun %%v found.

:: ── Step 2: Check if daemon already running ─────────────────────────────────
echo [INFO] Checking if Soverign daemon is already running...
set DAEMON_RUNNING=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3142.*LISTENING"') do (
  set DAEMON_PID=%%a
  set DAEMON_RUNNING=1
)
if !DAEMON_RUNNING!==1 (
  echo [INFO] Daemon already running (PID: !DAEMON_PID!). Skipping launch.
  goto :launch_electron
)

:: ── Step 3: Create data directory ───────────────────────────────────────────
if not exist "%USERPROFILE%\.soverign" (
  echo [INFO] Creating data directory...
  mkdir "%USERPROFILE%\.soverign"
)

:: ── Step 4: Launch daemon in background ─────────────────────────────────────
echo [INFO] Starting Soverign daemon...
set DAEMON_DIR=%~dp0soverign-core
if not exist "%DAEMON_DIR%\src\index.ts" (
  echo [ERROR] soverign-core not found at: %DAEMON_DIR%
  echo [ERROR] Please ensure you are running from the Soverign project root.
  pause
  exit /b 1
)

start "Soverign Daemon" /min cmd /c "cd /d "%DAEMON_DIR%" && bun run src/index.ts >> "%USERPROFILE%\.soverign\soverign.log" 2>&1"

:: Wait for daemon to start (poll port 3142)
echo [INFO] Waiting for daemon to start...
set /a ATTEMPTS=0
:wait_loop
  powershell -NoProfile -Command "$t=New-Object System.Net.Sockets.TcpClient;try{$t.Connect('127.0.0.1',3142);$t.Close();exit 0}catch{exit 1}" >nul 2>&1
  if %errorlevel%==0 goto :daemon_ready
  timeout /t 1 /nobreak >nul
  set /a ATTEMPTS+=1
  if !ATTEMPTS! geq 30 (
    echo [ERROR] Daemon did not start after 30 seconds.
    echo [HINT] Check log: %USERPROFILE%\.soverign\soverign.log
    pause
    exit /b 1
  )
goto :wait_loop

:daemon_ready
echo [INFO] Daemon is running on port 3142!

:: ── Step 5: Launch Electron UI ──────────────────────────────────────────────
:launch_electron
echo [INFO] Launching Soverign Desktop...
set ELECTRON_DIR=%~dp0soverign-desktop
if not exist "%ELECTRON_DIR%\package.json" (
  echo [ERROR] soverign-desktop not found at: %ELECTRON_DIR%
  pause
  exit /b 1
)

cd /d "%ELECTRON_DIR%"
call npm start
echo.
echo [INFO] Soverign Desktop closed.
endlocal
