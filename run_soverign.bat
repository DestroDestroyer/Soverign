@echo off
setlocal enabledelayedexpansion

title Soverign AI - Launcher
echo ============================================================
echo   Soverign AI - Desktop Launcher
echo ============================================================
echo.

:: ── Step 1: Check Bun ──────────────────────────────────────────────────────
echo [1/4] Checking Bun runtime...
where bun >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] Bun not found. Installing via winget...
  winget install --id Oven-sh.Bun --accept-source-agreements --accept-package-agreements
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Bun. Please install from: https://bun.sh
    pause
    exit /b 1
  )
  :: Reload PATH
  for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul ^| find "PATH"') do set "SYSTEM_PATH=%%b"
  for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul ^| find "PATH"') do set "USER_PATH=%%b"
  if defined SYSTEM_PATH set "PATH=!SYSTEM_PATH!;!USER_PATH!;!PATH!"
)
for /f %%v in ('bun --version 2^>nul') do echo [OK] Bun %%v found.

:: ── Step 2: Check daemon status ────────────────────────────────────────────
echo.
echo [2/4] Checking daemon status...
set DAEMON_RUNNING=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3142.*LISTENING"') do (
  set DAEMON_PID=%%a
  set DAEMON_RUNNING=1
)
if !DAEMON_RUNNING!==1 (
  echo [OK] Daemon already running on port 3142.
  goto :launch_electron
)

:: ── Step 3: Start daemon ───────────────────────────────────────────────────
echo.
echo [3/4] Starting Soverign daemon...
set "CORE_DIR=%~dp0soverign-core"

if not exist "%CORE_DIR%\src\daemon\index.ts" (
  echo [ERROR] soverign-core not found at: %CORE_DIR%
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.soverign" mkdir "%USERPROFILE%\.soverign"

start "Soverign Daemon" /min cmd /c "cd /d "%CORE_DIR%" && bun run src/daemon/index.ts >> "%USERPROFILE%\.soverign\soverign.log" 2>&1"

echo [INFO] Waiting for daemon on port 3142...
set /a ATTEMPTS=0
:wait_loop
  powershell -NoProfile -Command "$t=New-Object System.Net.Sockets.TcpClient;try{$t.ConnectAsync('127.0.0.1',3142).Wait(500)|Out-Null;if($t.Connected){$t.Close();exit 0}else{exit 1}}catch{exit 1}" >nul 2>&1
  if %errorlevel%==0 goto :daemon_ready
  ping -n 2 127.0.0.1 >nul
  set /a ATTEMPTS+=1
  if !ATTEMPTS! geq 30 (
    echo [WARN] Daemon did not respond after 30s - launching UI anyway.
    goto :launch_electron
  )
goto :wait_loop

:daemon_ready
echo [OK] Daemon is ready on port 3142!

:: ── Step 4: Launch Electron ────────────────────────────────────────────────
:launch_electron
echo.
echo [4/4] Launching Soverign Desktop UI...
set "DESKTOP_DIR=%~dp0soverign-desktop"

if exist "%DESKTOP_DIR%\node_modules\electron\dist\electron.exe" (
  start "" "%DESKTOP_DIR%\node_modules\electron\dist\electron.exe" "%DESKTOP_DIR%"
) else if exist "%DESKTOP_DIR%\node_modules\.bin\electron.cmd" (
  cd /d "%DESKTOP_DIR%"
  start "" node_modules\.bin\electron.cmd .
) else (
  echo [ERROR] Electron not found. Run: cd soverign-desktop ^&^& npm install
  pause
  exit /b 1
)

echo [OK] Soverign Desktop launched!
endlocal
