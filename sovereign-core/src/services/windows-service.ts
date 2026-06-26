import { Service } from '../interfaces';
import { logger } from '../logger';
import * as winSvc from 'windows-service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

export class WindowsServiceManager implements Service {
  private running = false;

  async start() {
    logger.info('WindowsServiceManager starting...');
    
    try {
      if (this.isServiceEnvironment()) {
        logger.info('Running in Windows Service context, connecting to SCM...');
        const dataDir = path.join(os.homedir(), '.sovereign');
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }
        const logStream = fs.createWriteStream(path.join(dataDir, 'sovereign-service.log'), { flags: 'a' });
        
        winSvc.run(logStream, () => {
          logger.info('Stop request received from Windows Service Control Manager');
          this.stop();
        });
        
        this.running = true;
        logger.info('Successfully connected to SCM');
      } else {
        logger.info('Running in development/normal mode (not as Windows service)');
        this.running = true;
      }
      this.setupEventHandlers();
    } catch (error) {
      logger.error('Failed to start/connect Windows service:', error);
      // Fallback to regular mode if service fails
      this.running = true;
    }
  }

  private isServiceEnvironment(): boolean {
    return process.argv.includes('--run') && process.platform === 'win32';
  }

  async installService() {
    return new Promise<void>((resolve, reject) => {
      try {
        logger.info('Installing Sovereign service via windows-service package...');
        const name = 'SovereignDeep';
        const options = {
          displayName: 'Sovereign Deep Daemon Service',
          programPath: process.argv[1],
          programArgs: ['--run']
        };

        // Note: winSvc.add is synchronous and throws on error
        winSvc.add(name, options);
        logger.info('Service SovereignDeep registered successfully in SCM');

        // Configure recovery options using sc.exe failure command
        exec(`sc failure ${name} reset= 86400 actions= restart/5000/restart/10000/restart/20000`, (err, stdout, stderr) => {
          if (err) {
            logger.warn('Failed to configure service recovery options via sc.exe:', err);
            // Don't reject the installation since the service itself is registered successfully
            resolve();
          } else {
            logger.info('Service recovery options configured successfully (5s, 10s, 20s restarts)');
            resolve();
          }
        });
      } catch (error) {
        logger.error('Failed to install Windows service:', error);
        reject(error);
      }
    });
  }

  async uninstallService() {
    return new Promise<void>((resolve, reject) => {
      try {
        logger.info('Uninstalling Sovereign service via windows-service package...');
        // Note: winSvc.remove is synchronous and throws on error
        winSvc.remove('SovereignDeep');
        logger.info('Service SovereignDeep removed successfully from SCM');
        resolve();
      } catch (error) {
        logger.error('Failed to uninstall Windows service:', error);
        reject(error);
      }
    });
  }

  private setupEventHandlers() {
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  async stop() {
    logger.info('WindowsServiceManager stopping...');
    this.running = false;
    if (this.isServiceEnvironment()) {
      try {
        winSvc.stop(0);
      } catch (error) {
        logger.error('Error calling winSvc.stop:', error);
        process.exit(0);
      }
    }
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' as const };
  }
}
