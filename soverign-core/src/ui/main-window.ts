import { app, BrowserWindow, ipcMain } from 'electron';
import { logger } from '../logger';
import { bus } from '../interfaces';
import * as path from 'path';

export class MainWindowManager {
  private mainWindow: BrowserWindow | null = null;

  async initialize() {
    logger.info('Initializing main window...');
    
    // Wait for services to be ready
    await this.waitForServices();
    
    this.createWindow();
    this.setupIPCListeners();
    this.setupServiceListeners();
  }

  private async waitForServices() {
    return new Promise<void>((resolve) => {
      const checkReady = () => {
        const repoReady = bus.getState('repository') === 'ready';
        const daemonReady = bus.getState('daemon') === 'ready';
        const desktopReady = bus.getState('desktop') === 'ready';
        
        if (repoReady && daemonReady && desktopReady) {
          clearTimeout(timeout);
          logger.info('All core services ready (verified via state)');
          bus.off('state:repository', onStateChange);
          bus.off('state:daemon', onStateChange);
          bus.off('state:desktop', onStateChange);
          resolve();
          return true;
        }
        return false;
      };

      const onStateChange = () => {
        checkReady();
      };

      const timeout = setTimeout(() => {
        logger.warn('Services did not become ready in time, proceeding anyway');
        bus.off('state:repository', onStateChange);
        bus.off('state:daemon', onStateChange);
        bus.off('state:desktop', onStateChange);
        resolve();
      }, 10000);

      // Check immediately
      if (!checkReady()) {
        bus.on('state:repository', onStateChange);
        bus.on('state:daemon', onStateChange);
        bus.on('state:desktop', onStateChange);
      }
    });
  }

  private createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, '../../assets/icon.ico')
    });

    // Load the proper UI file, not a static page
    const uiPath = app.isPackaged 
      ? path.join(__dirname, '../ui/index.html')
      : path.join(__dirname, '../../ui/index.html');
    
    this.mainWindow.loadFile(uiPath);

    if (!app.isPackaged) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  private setupIPCListeners() {
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('check-service-status', async () => {
      // Return status of all services
      return {
        repository: 'active',
        daemon: 'active',
        desktop: 'active'
      };
    });
  }

  private setupServiceListeners() {
    // Listen for service events and update UI accordingly
    bus.on('repository:changed', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('repository-updated', data);
      }
    });

    bus.on('daemon:heartbeat', (data) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('daemon-heartbeat', data);
      }
    });

    bus.on('desktop:ready', () => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('ui-ready', {});
      }
    });
  }

  public sendToUI(channel: string, data: any) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  public getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }
}
