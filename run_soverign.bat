@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   Soverign AI - Desktop Launcher
echo ============================================================
echo.

:: ── Step 1: Check Bun ──────────────────────────────────────────────────────
echo [1/5] Checking Bun runtime...
where bun >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] Bun not found. Installing via winget...
  winget install --id Oven-sh.Bun --accept-source-agreements --accept-package-agreements
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Bun automatically.
    echo         Please install manually from: https://bun.sh
    pause
    exit /b 1
  )
  :: Reload PATH from registry
  for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul ^| find "PATH"') do set "SYSTEM_PATH=%%b"
  for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul ^| find "PATH"') do set "USER_PATH=%%b"
  if defined SYSTEM_PATH set "PATH=!SYSTEM_PATH!;!USER_PATH!;!PATH!"
  where bun >nul 2>&1
  if %errorlevel% neq 0 (
    echo [WARN] Bun installed but not found in PATH yet.
    echo        Please restart your terminal and try again.
    pause
    exit /b 1
  )
)
for /f %%v in ('bun --version 2^>nul') do echo [OK] Bun %%v found.

:: ── Step 2: Install soverign-desktop node_modules if missing ───────────────
echo.
echo [2/5] Checking node_modules...
set "DESKTOP_DIR=%~dp0soverign-desktop"
if not exist "%DESKTOP_DIR%\node_modules\electron\dist\electron.exe" (
  echo [INFO] Installing desktop dependencies (electron etc.)...
  cd /d "%DESKTOP_DIR%"
  npm install --silent 2>nul || (
    echo [WARN] npm install failed - trying with node...
    node -e "require('child_process').execSync('npm install', {stdio:'inherit'})"
  )
  cd /d "%~dp0"
)
echo [OK] Desktop dependencies ready.

:: ── Step 3: Check daemon status ────────────────────────────────────────────
echo.
echo [3/5] Checking daemon status...
set DAEMON_RUNNING=0
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3142.*LISTENING"') do (
  set DAEMON_PID=%%a
  set DAEMON_RUNNING=1
)
if !DAEMON_RUNNING!==1 (
  echo [OK] Daemon already running (PID !DAEMON_PID!)
  goto :launch_electron
)

:: ── Step 4: Start daemon ───────────────────────────────────────────────────
echo.
echo [4/5] Starting Soverign daemon...
set "CORE_DIR=%~dp0soverign-core"

if not exist "%CORE_DIR%\src\daemon\index.ts" (
  echo [ERROR] soverign-core not found at: %CORE_DIR%
  echo         Make sure you are running from the Soverign project root.
  pause
  exit /b 1
)

:: Create data directory
if not exist "%USERPROFILE%\.soverign" mkdir "%USERPROFILE%\.soverign"

:: Start daemon in minimized window
start "Soverign Daemon" /min cmd /c "cd /d "%CORE_DIR%" && bun run src/daemon/index.ts >> "%USERPROFILE%\.soverign\soverign.log" 2>&1"

:: Poll for daemon to become ready (max 30s)
echo [INFO] Waiting for daemon on port 3142...
set /a ATTEMPTS=0
:wait_loop
  powershell -NoProfile -Command "$t=New-Object System.Net.Sockets.TcpClient;try{$t.ConnectAsync('127.0.0.1',3142).Wait(500)|Out-Null;if($t.Connected){$t.Close();exit 0}else{exit 1}}catch{exit 1}" >nul 2>&1
  if %errorlevel%==0 goto :daemon_ready
  ping -n 2 127.0.0.1 >nul
  set /a ATTEMPTS+=1
  if !ATTEMPTS! geq 30 (
    echo [WARN] Daemon did not respond after 30s.
    echo       Check log: %USERPROFILE%\.soverign\soverign.log
    echo       Launching UI anyway - you can start the daemon from the app.
    goto :launch_electron
  )
goto :wait_loop

:daemon_ready
echo [OK] Daemon is ready on port 3142!

:: ── Step 5: Launch Electron ────────────────────────────────────────────────
:launch_electron
echo.
echo [5/5] Launching Soverign Desktop UI...
cd /d "%DESKTOP_DIR%"

:: Prefer local electron binary over npm scripts (avoids policy issues)
if exist "node_modules\.bin\electron.cmd" (
  call node_modules\.bin\electron.cmd .
) else if exist "node_modules\electron\dist\electron.exe" (
  node_modules\electron\dist\electron.exe .
) else (
  echo [ERROR] Electron not found. Run: cd soverign-desktop && npm install
  pause
  exit /b 1
)

echo.
echo [INFO] Soverign Desktop closed.
endlocal
