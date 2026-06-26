import { app, BrowserWindow } from 'electron';
import { logger } from './logger';
import { bus } from './interfaces';
import { Daemon } from './daemon';
import { DesktopApp } from './desktop';
import { RepositoryService } from './repository';
import { MainWindowManager } from './ui/main-window';
import { RecoveryManager } from './services/recovery';
import { WindowsServiceManager } from './services/windows-service';
import { HealthMonitor } from './health';

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  const services = new Map<string, any>();

  async function initializeServices() {
    logger.info('Initializing services...');
    
    // Initialize services in order
    const repositoryService = new RepositoryService();
    const daemon = new Daemon();
    const desktopApp = new DesktopApp();
    const recoveryManager = new RecoveryManager();
    const windowsService = new WindowsServiceManager();
    const mainWindowManager = new MainWindowManager();
    const healthMonitor = new HealthMonitor();

    services.set('repository', repositoryService);
    services.set('daemon', daemon);
    services.set('desktop', desktopApp);
    services.set('recovery', recoveryManager);
    services.set('windowsService', windowsService);
    services.set('healthMonitor', healthMonitor);

    // Inject services map into recovery manager
    recoveryManager.setServicesMap(services);

    // Register with health monitor
    healthMonitor.registerService('repository', repositoryService);
    healthMonitor.registerService('daemon', daemon);
    healthMonitor.registerService('desktop', desktopApp);
    healthMonitor.registerService('windowsService', windowsService);

    try {
      // Set initial states
      bus.setState('repository', 'starting');
      bus.setState('daemon', 'starting');
      bus.setState('desktop', 'starting');
      bus.setState('recovery', 'starting');
      bus.setState('windowsService', 'starting');

      // Start core services
      logger.info('Starting Repository Service...');
      await repositoryService.start();
      bus.setState('repository', 'ready');

      logger.info('Starting Daemon Service...');
      await daemon.start();
      bus.setState('daemon', 'ready');

      logger.info('Starting Desktop Application Backend...');
      await desktopApp.start();
      bus.setState('desktop', 'ready');

      logger.info('Starting Recovery Manager...');
      await recoveryManager.start();
      bus.setState('recovery', 'ready');
      
      // Start Windows service if in production
      if (process.platform === 'win32' && process.env.NODE_ENV === 'production') {
        logger.info('Starting Windows Service...');
        await windowsService.start();
        bus.setState('windowsService', 'ready');
      } else {
        bus.setState('windowsService', 'disabled');
      }

      // Start Health Monitor
      logger.info('Starting Health Monitor...');
      await healthMonitor.start();
      bus.setState('health', 'ready');
      
      logger.info('All services started successfully');
      
      // Start UI after services are ready
      await mainWindowManager.initialize();
      
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      bus.setState('system', 'failed');
      process.exit(1);
    }
  }

  app.whenReady().then(() => {
    initializeServices();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        // Recreate window if needed
      }
    });

    app.on('before-quit', () => {
      // Gracefully shutdown services
      services.forEach((service, name) => {
        try {
          service.stop();
        } catch (error) {
          logger.error(`Error stopping ${name}:`, error);
        }
      });
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
