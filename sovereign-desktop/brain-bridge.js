/**
 * BrainBridge — manages the Sovereign Brain child process (Bun) and
 * provides JSON-RPC communication over stdin/stdout.
 *
 * The brain is auto-started at app launch and handles LLM, vault,
 * agents, and authority. The daemon (port 3142) is a separate
 * OPTIONAL process only for sidecar/Windows-service connectivity.
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

const CORE_DIR = path.join(__dirname, '..', 'sovereign-core');
const BRAIN_SCRIPT = path.join(CORE_DIR, 'src', 'brain', 'index.ts');
const MAX_STDERR_BYTES = 64 * 1024;

class BrainBridge extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.stdin = null;
    this.stderrBuffer = '';
    this.buffer = '';
    this.pending = new Map();
    this.nextId = 1;
    this.started = false;
    this.ready = false;
    this.reconnectTimer = null;
    this._startResolve = null;
    this._startReject = null;
    this._starting = false;
    this._forceKillTimer = null;
    
    // Circuit Breaker state
    this.breakerState = 'CLOSED';
    this.breakerFailures = 0;
    this.breakerLastAttempt = 0;
  }

  /**
   * Start the brain process.
   * @param {string} bunPath - path to bun executable
   * @param {string} dataDir - ~/.sovereign data directory
   * @param {number} timeoutMs - max wait for brain:ready
   */
  async start(bunPath = 'bun', dataDir, timeoutMs = 60000) {
    // If already started/running, return the existing promise
    if (this.process) {
      console.log('[BrainBridge] Already running');
      return;
    }
    // If currently starting (previous call in progress), wait for that attempt
    if (this._starting) {
      console.log('[BrainBridge] Start already in progress, waiting...');
      return new Promise((resolve, reject) => {
        this.once('brain:ready', () => resolve());
        this.once('brain:error', (params) => reject(new Error(params.message)));
      });
    }

    // Validate bun executable exists and works before spawning
    const { execFile } = require('child_process');
    const bunValid = await new Promise((resolve) => {
      const proc = execFile(bunPath, ['--version'], { windowsHide: true, timeout: 3000 });
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });
    if (!bunValid) {
      const msg = `Bun executable not found or invalid: ${bunPath}. Run "Verify & Download" in Settings.`;
      console.error('[BrainBridge]', msg);
      this.emit('brain:error', { message: msg });
      throw new Error(msg);
    }

    this._starting = true;
    return new Promise((resolve, reject) => {
      const args = ['run', BRAIN_SCRIPT];
      if (dataDir) {
        args.push('--data-dir', dataDir);
      }

      console.log(`[BrainBridge] Spawning: ${bunPath} ${args.join(' ')}`);

      this._startResolve = resolve;
      this._startReject = reject;
      this.stderrBuffer = '';

      this.process = spawn(bunPath, args, {
        cwd: CORE_DIR,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.stdin = this.process.stdin;

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        this._processBuffer();
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        this.stderrBuffer += text;
        if (this.stderrBuffer.length > MAX_STDERR_BYTES) {
          this.stderrBuffer = this.stderrBuffer.slice(-MAX_STDERR_BYTES);
        }
        console.error('[Brain]', text);
        this.emit('log', text);
      });

      this.process.on('error', (err) => {
        console.error('[BrainBridge] Process error:', err.message);
        this.emit('brain:error', { message: err.message });
        this._failStart(err.message);
      });

      this.process.on('close', (code) => {
        console.log(`[BrainBridge] Process exited (code ${code})`);
        this.emit('exit', code);
        const wasReady = this.ready;
        this.process = null;
        this.stdin = null;
        this.ready = false;
        this.started = false;
        this._starting = false;

        if (!wasReady) {
          // Brain crashed before becoming ready — report error with stderr
          const stderr = this.stderrBuffer.trim();
          const msg = stderr ? `Brain exited (code ${code}): ${stderr.slice(0, 500)}` : `Brain process exited with code ${code}`;
          this._failStart(msg);
        }
      });

      // Setup the brain:ready listener
      this.once('brain:ready', (params) => {
        this._starting = false;
        this.started = true;
        this.ready = true;
        this.emit('ready', params);
        this._startResolve && this._startResolve(params);
        this._startResolve = null;
        this._startReject = null;
      });

      // Also handle brain:error events (brain sends these before dying)
      this.once('brain:error', (params) => {
        this._starting = false;
        this._failStart(params.message || 'Unknown brain error');
      });

      // Timeout
      const timer = setTimeout(() => {
        this.removeListener('brain:ready', onReady);
        this._starting = false;
        if (!this.ready) {
          const stderr = this.stderrBuffer.trim();
          const msg = stderr
            ? `Brain startup timed out. Last events: ${stderr.slice(0, 300)}`
            : 'Brain did not become ready within timeout';
          this._failStart(msg);
        }
      }, timeoutMs);

      const onReady = (params) => {
        clearTimeout(timer);
      };
      this.once('brain:ready', onReady);
    });
  }

  _failStart(message) {
    if (this._startReject) {
      this._startReject(new Error(message));
      this._startResolve = null;
      this._startReject = null;
    }
    this.emit('brain:error', { message });
  }

  /**
   * Send a JSON-RPC request to the brain.
   * @param {string} method - RPC method name
   * @param {*} params - parameters
   * @param {number} timeout - request timeout in ms
   * @returns {Promise<*>} response result
   */
  async request(method, params, timeout = 30000) {
    // ─── Circuit Breaker Check ───────────────────────────────────────────────
    const now = Date.now();
    if (this.breakerState === 'OPEN') {
      if (now - this.breakerLastAttempt > 15000) {
        this.breakerState = 'HALF_OPEN';
        console.log('[BrainBridge] Circuit Breaker: entering HALF_OPEN state to test connection');
      } else {
        throw new Error(`Circuit Breaker is OPEN. Brain request "${method}" rejected.`);
      }
    }

    if (!this.process || !this.stdin) {
      throw new Error(`Brain not connected (cannot call ${method})`);
    }

    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const err = new Error(`Brain request ${method} timed out after ${timeout}ms`);
        this._handleBreakerFailure();
        reject(err);
      }, timeout);

      const wrapperResolve = (res) => {
        clearTimeout(timer);
        this.pending.delete(id);
        this._handleBreakerSuccess();
        resolve(res);
      };

      const wrapperReject = (err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        this._handleBreakerFailure();
        reject(err);
      };

      this.pending.set(id, { resolve: wrapperResolve, reject: wrapperReject, timer });

      const msg = JSON.stringify({ id, method, params }) + '\n';
      try {
        this.stdin.write(msg);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this._handleBreakerFailure();
        reject(new Error(`Failed to write to brain: ${err.message}`));
      }
    });
  }

  _handleBreakerSuccess() {
    if (this.breakerState === 'HALF_OPEN') {
      console.log('[BrainBridge] Circuit Breaker: HALF_OPEN request succeeded, closing circuit');
    }
    this.breakerState = 'CLOSED';
    this.breakerFailures = 0;
  }

  _handleBreakerFailure() {
    this.breakerLastAttempt = Date.now();
    if (this.breakerState === 'HALF_OPEN') {
      this.breakerState = 'OPEN';
      console.warn('[BrainBridge] Circuit Breaker: HALF_OPEN request failed, reopening circuit');
      return;
    }
    this.breakerFailures++;
    if (this.breakerFailures >= 5) {
      this.breakerState = 'OPEN';
      console.error('[BrainBridge] Circuit Breaker: 5 consecutive failures, opening circuit');
    }
  }

  /**
   * Stop the brain gracefully.
   */
  stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this._forceKillTimer) {
      clearTimeout(this._forceKillTimer);
      this._forceKillTimer = null;
    }
    if (!this.process) return;
    // Try graceful shutdown
    this.request('brain.shutdown', {}, 5000).catch(() => {});
    // Force kill after 5s
    this._forceKillTimer = setTimeout(() => {
      this._forceKillTimer = null;
      if (this.process) {
        try {
          if (this.process.pid) {
            const taskkill = spawn('taskkill', ['/pid', String(this.process.pid), '/T', '/F'], { timeout: 2000 });
            taskkill.unref();
          }
        } catch (e) {
          console.warn('[BrainBridge] Force kill failed:', e.message);
        }
        this.process = null;
        this.stdin = null;
        this.ready = false;
      }
    }, 5000);
  }

  /**
   * Check if brain is ready.
   */
  isReady() {
    return this.ready && this.process !== null;
  }

  /**
   * Process incoming stdout buffer — parse JSON-RPC lines.
   */
  _processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);

        if (msg.event) {
          // Push event from brain
          this.emit(msg.event, msg.params || {});
        } else if (msg.id !== undefined) {
          // Response to a pending request
          const pending = this.pending.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(msg.error.message || 'Unknown RPC error'));
            } else {
              pending.resolve(msg.result);
            }
          }
        }
      } catch (e) {
        // Non-JSON line (Bun runtime output)
        if (trimmed.length > 0) {
          this.emit('log', trimmed + '\n');
        }
      }
    }
  }
}

module.exports = { BrainBridge };
