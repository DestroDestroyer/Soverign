#!/usr/bin/env bun
/**
 * Sovereign CLI Entry Point
 *
 * Usage:
 *   sovereign start [--port N] [-d|--detach]   Start the daemon
 *   sovereign stop [--port N]                  Stop the running daemon
 *   sovereign status                           Show daemon status
 *   sovereign uninstall                        Remove SOVEREIGN (detects install method)
 *   sovereign doctor                           Check environment & connectivity
 *   sovereign version                          Print version
 *   sovereign help                             Show this help
 *
 * First-time setup happens in the dashboard at http://localhost:3142
 * after `sovereign start` — there is no longer a CLI wizard.
 */

import { join } from 'node:path';
import { existsSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { acquireLock, releaseLock, isLocked, getLogPath } from '../src/daemon/pid.ts';
import { c } from '../src/cli/helpers.ts';
import { ensurePortReleased, getConfiguredPort, resolveStopPort } from '../src/cli/lifecycle.ts';
import { getInstalledVersion } from '../src/cli/version.ts';

const PACKAGE_ROOT = join(import.meta.dir, '..');

function getVersion(): string {
  return getInstalledVersion(PACKAGE_ROOT);
}

function printHelp(): void {
  console.log(`
${c.cyan('Sovereign')} ${c.dim(`v${getVersion()}`)}
Just A Rather Very Intelligent System

${c.bold('Usage:')}
  sovereign <command> [options]

${c.bold('Commands:')}
  ${c.cyan('start')}     Start the SOVEREIGN daemon
  ${c.cyan('stop')}      Stop the running daemon
  ${c.cyan('restart')}   Restart the daemon (stop + start)
  ${c.cyan('status')}    Show daemon status
  ${c.cyan('logs')}      Tail the daemon log file
  ${c.cyan('update')}    Update SOVEREIGN (dispatches based on install method)
  ${c.cyan('uninstall')} Remove SOVEREIGN (dispatches based on install method)
  ${c.cyan('doctor')}    Check environment and connectivity
  ${c.cyan('version')}   Print version number
  ${c.cyan('help')}      Show this help message

${c.bold('Start options:')}
  --port <N>        Override daemon port (default: 3142)
  -d, --detach      Run as background daemon
  --no-open         Don't auto-open dashboard in browser
  --data-dir <path> Override data directory (default: ~/.sovereign)
  --no-local-tools  Disable local tool execution (Docker/headless mode)

${c.bold('Logs options:')}
  -f, --follow      Follow log output (like tail -f)
  -n, --lines <N>   Number of lines to show (default: 50)

${c.bold('Examples:')}
  sovereign start                  Start in foreground
  sovereign start -d               Start as background daemon
  sovereign start --port 8080      Start on custom port
  sovereign restart                Restart with same settings
  sovereign logs -f                Follow live log output
  sovereign update                 Update to latest version
  sovereign uninstall              Remove SOVEREIGN from this machine
  sovereign doctor                 Check if everything is working
`);
}

function assertSupportedPlatform(): void {
  if (process.platform !== 'win32') return;
  console.error(c.red('Native Windows installs are not supported for the SOVEREIGN daemon.'));
  console.error(c.dim('Use WSL2 for the Bun install, or run SOVEREIGN with Docker on Windows.'));
  console.error(c.dim('The Windows sidecar is still supported separately.'));
  process.exit(1);
}

async function cmdStart(args: string[]): Promise<void> {
  const detach = args.includes('--detach') || args.includes('-d');
  const noOpen = args.includes('--no-open');
  const noLocalTools = args.includes('--no-local-tools');

  // Parse --port
  let port: number | undefined;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1]!, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(c.red('Error: --port requires a number between 1 and 65535'));
      process.exit(1);
    }
  }

  // Parse --data-dir
  let dataDir: string | undefined;
  const dataDirIdx = args.indexOf('--data-dir');
  if (dataDirIdx !== -1 && args[dataDirIdx + 1]) {
    dataDir = args[dataDirIdx + 1]!;
  }

  // Friendly first-run hint — when no config exists yet, the daemon
  // boots in "setup mode" and the dashboard's onboarding gate handles
  // LLM/TTS/profile/tutorial. Print a one-liner so the user knows where
  // to go (the browser auto-opens too unless --no-open is set).
  const { existsSync: _exists } = await import('node:fs');
  const { homedir } = await import('node:os');
  const cfgPath = join(homedir(), '.sovereign', 'config.yaml');
  if (!_exists(cfgPath)) {
    console.log(c.cyan('First-run detected — finish setup in your browser:'));
    console.log(c.dim(`  → http://localhost:${port ?? 3142}`));
    console.log('');
  }

  if (!detach) {
    // Run in foreground — acquire lock atomically (checks + locks in one step)
    if (!acquireLock(process.pid)) {
      console.log(c.yellow('SOVEREIGN is already running'));
      console.log(c.dim('  Stop it first with: sovereign stop'));
      process.exit(1);
    }
    
    const cleanupLock = () => {
      try { releaseLock(); } catch {}
    };
    process.on('exit', cleanupLock);
    process.on('SIGINT', () => {
      cleanupLock();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanupLock();
      process.exit(0);
    });

    const { startDaemon } = await import('../src/daemon/index.ts');
    await startDaemon({ port, dataDir, noLocalTools });

    if (!noOpen) {
      openDashboard(port ?? 3142);
    }
  } else {
    // Check if already running before spawning detached child
    const existingPid = isLocked();
    if (existingPid) {
      console.log(c.yellow(`SOVEREIGN is already running (PID ${existingPid})`));
      console.log(c.dim('  Stop it first with: sovereign stop'));
      process.exit(1);
    }

    // Run in background — spawn a detached child process with log file
    console.log(c.cyan('Starting Sovereign daemon...'));

    const logPath = getLogPath();
    const daemonArgs = [join(PACKAGE_ROOT, 'bin/sovereign.ts'), 'start', '--no-open'];
    if (port) daemonArgs.push('--port', String(port));

    let logFd: number | null = null;
    let child: ReturnType<typeof spawn> | null = null;

    try {
      logFd = openSync(logPath, 'a');
      child = spawn('bun', daemonArgs, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env },
      });
      child.unref();

      // Poll for the daemon to acquire its lock (up to 15s)
      let runningPid: number | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        runningPid = isLocked();
        if (runningPid) break;
      }

      if (runningPid) {
        console.log(c.green(`✓ SOVEREIGN daemon started (PID ${runningPid})`));
        console.log(c.dim(`  Dashboard: http://localhost:${port ?? 3142}`));
        console.log(c.dim(`  Logs:      ${logPath}`));
        console.log(c.dim(`  Stop with: sovereign stop`));

        if (!noOpen) {
          openDashboard(port ?? 3142);
        }
      } else {
        console.log(c.red('✗ Failed to start daemon. Check logs:'));
        console.log(c.dim(`  ${logPath}`));
        process.exit(1);
      }
    } catch (error) {
      console.log(c.red('✗ Failed to start daemon:'), error);
      if (logFd !== null) {
        try { closeSync(logFd); } catch {}
      }
      if (child) {
        try { child.kill(); } catch {}
      }
      process.exit(1);
    }
  }
}

async function cmdStop(args: string[] = []): Promise<void> {
  const pid = isLocked();

  // Parse `--port N` for the no-lockfile recovery path. Ignored when the
  // lockfile recorded the daemon's actual port (authoritative).
  let cliPort: number | undefined;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsed = parseInt(args[portIdx + 1]!, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      console.error(c.red('Error: --port requires a number between 1 and 65535'));
      process.exit(1);
    }
    cliPort = parsed;
  }

  const resolution = resolveStopPort({ cliPort });
  const port = resolution.port;
  if (resolution.source !== 'lockfile' && resolution.source !== 'default') {
    console.log(c.dim(`  Using port ${port} (from ${resolution.source})`));
  }

  if (!pid) {
    const cleanup = await ensurePortReleased(port);
    if (cleanup.terminated.length > 0 || cleanup.forced.length > 0) {
      const details = cleanup.forced.length > 0
        ? ` Force-killed lingering listener(s) on port ${port}: ${cleanup.forced.join(', ')}.`
        : ` Cleaned up lingering listener(s) on port ${port}: ${cleanup.terminated.join(', ')}.`;
      console.log(c.green(`✓ SOVEREIGN was not locked, but the port is now clear.${details}`));
    } else {
      console.log(c.yellow('SOVEREIGN is not running.'));
    }
    return;
  }

  console.log(c.cyan(`Stopping SOVEREIGN daemon (PID ${pid})...`));
  
  let shouldReleaseLock = false;

  try {
    process.kill(pid, 'SIGTERM');

    // Wait up to 8s for graceful shutdown, then SIGKILL
    let alive = true;
    for (let i = 0; i < 16; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      try { process.kill(pid, 0); } catch { alive = false; break; }
    }

    if (alive) {
      console.log(c.dim('  Process still alive, sending SIGKILL...'));
      try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      shouldReleaseLock = true;
    } else {
      shouldReleaseLock = true;
    }

    const cleanup = await ensurePortReleased(port);
    if (shouldReleaseLock) {
      releaseLock();
    }

    if (!cleanup.released) {
      console.error(c.red(`✗ SOVEREIGN stopped but port ${port} is still occupied.`));
      process.exit(1);
    }

    const details = cleanup.forced.length > 0
      ? ` Force-killed lingering listener(s) on port ${port}: ${cleanup.forced.join(', ')}.`
      : cleanup.terminated.length > 0
        ? ` Cleaned up lingering listener(s) on port ${port}: ${cleanup.terminated.join(', ')}.`
        : '';
    console.log(c.green(`✓ SOVEREIGN daemon stopped.${details}`));
  } catch (err) {
    console.error(c.red(`Failed to stop process ${pid}: ${err}`));
    if (shouldReleaseLock) {
      releaseLock();
    }
  }
}

function cmdStatus(): void {
  const pid = isLocked();
  if (pid) {
    console.log(`${c.green('●')} SOVEREIGN is ${c.green('running')} (PID ${pid})`);

    // Try to read the port from config
    try {
      const port = getConfiguredPort();
      console.log(c.dim(`  Dashboard: http://localhost:${port}`));
    } catch {
      console.log(c.dim(`  Dashboard: http://localhost:3142`));
    }

    console.log(c.dim(`  Stop with: sovereign stop`));
  } else {
    console.log(`${c.red('●')} SOVEREIGN is ${c.red('stopped')}`);
    console.log(c.dim(`  Start with: sovereign start`));
  }
}

async function cmdDoctor(): Promise<void> {
  const { runDoctor } = await import('../src/cli/doctor.ts');
  await runDoctor();
}

async function cmdUninstall(): Promise<void> {
  const { runUninstallWizard } = await import('../src/cli/uninstall.ts');
  await runUninstallWizard(PACKAGE_ROOT);
}

async function cmdRestart(args: string[]): Promise<void> {
  const pid = isLocked();
  if (pid) {
    await cmdStop();
  }

  console.log('');
  await cmdStart(args);
}

function cmdLogs(args: string[]): void {
  const logPath = getLogPath();

  if (!existsSync(logPath)) {
    console.log(c.yellow('No log file found. Start the daemon first: sovereign start'));
    return;
  }

  const follow = args.includes('-f') || args.includes('--follow');

  // Parse --lines / -n
  let lines = 50;
  const nIdx = args.indexOf('-n') !== -1 ? args.indexOf('-n') : args.indexOf('--lines');
  if (nIdx !== -1 && args[nIdx + 1]) {
    const n = parseInt(args[nIdx + 1], 10);
    if (!isNaN(n) && n > 0) lines = n;
  }

  console.log(c.dim(`Log file: ${logPath}\n`));

  if (follow) {
    // tail -f equivalent with proper cleanup
    const tailProc = Bun.spawn(['tail', '-f', '-n', String(lines), logPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    const cleanup = () => {
      try { tailProc.kill(); } catch {}
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
    // Wait for tail process to end
    tailProc.on('exit', () => {
      process.exit(0);
    });
  } else {
    // Just show last N lines
    const tailProc = Bun.spawnSync(['tail', '-n', String(lines), logPath]);
    process.stdout.write(tailProc.stdout);
  }
}

async function cmdUpdate(): Promise<void> {
  const { runUpdate } = await import('../src/cli/update.ts');
  const result = await runUpdate({ packageRoot: PACKAGE_ROOT });
  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

function openDashboard(port: number): void {
  const url = `http://localhost:${port}`;
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      Bun.spawn(['open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    } else {
      // Check WSL first
      const { readFileSync } = require('node:fs');
      try {
        const version = readFileSync('/proc/version', 'utf-8');
        if (version.toLowerCase().includes('microsoft')) {
          Bun.spawn(['wslview', url], { stdio: ['ignore', 'ignore', 'ignore'] });
          return;
        }
      } catch {}
      // Regular Linux
      Bun.spawn(['xdg-open', url], { stdio: ['ignore', 'ignore', 'ignore'] });
    }
  } catch {
    // Silently fail — user can open manually
  }
}

// ── Main ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] || 'help';
const commandArgs = args.slice(1);

switch (command) {
  case 'start':
    await cmdStart(commandArgs);
    break;
  case 'stop':
    await cmdStop(commandArgs);
    break;
  case 'restart':
    await cmdRestart(commandArgs);
    break;
  case 'status':
    cmdStatus();
    break;
  case 'logs':
  case 'log':
    cmdLogs(commandArgs);
    break;
  case 'update':
  case 'upgrade':
    await cmdUpdate();
    break;
  case 'onboard':
    console.log(c.yellow('The CLI onboarding wizard has been retired.'));
    console.log(c.dim('  First-time setup now happens in the dashboard:'));
    console.log(c.dim('    1. Run: sovereign start'));
    console.log(c.dim('    2. Open: http://localhost:3142'));
    console.log(c.dim('  The dashboard guides you through LLM, voice, and profile setup.'));
    break;
  case 'doctor':
    await cmdDoctor();
    break;
  case 'uninstall':
    await cmdUninstall();
    break;
  case 'version':
  case '-v':
  case '--version':
    console.log(`v${getVersion()}`);
    break;
  case 'help':
  case '-h':
  case '--help':
    printHelp();
    break;
  default:
    console.error(c.red(`Unknown command: ${command}`));
    console.log(c.dim('Run "sovereign help" for usage information.'));
    process.exit(1);
}
