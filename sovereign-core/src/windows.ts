import { Service, bus, logger } from './interfaces';

export class WindowsIntegration implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('WindowsIntegration is already running, ignoring start request.');
      return;
    }
    logger.info('WindowsIntegration starting...');
    this.running = true;

    this.on('windows:get-active-window', () => {
      try {
        this.getActiveWindow();
      } catch (err) {
        logger.error(`Error in windows:get-active-window event handler: ${err}`);
      }
    });

    this.on('windows:send-keys', (data: any) => {
      try {
        this.sendKeys(data);
      } catch (err) {
        logger.error(`Error in windows:send-keys event handler: ${err}`);
      }
    });

    bus.emit('windows:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('WindowsIntegration is not running, ignoring stop request.');
      return;
    }
    logger.info('WindowsIntegration stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private getActiveWindow(): void {
    const windowInfo = { title: 'Sovereign Deep', handle: 0x1234 };
    bus.emit('windows:active-window', windowInfo);
  }

  private sendKeys({ keys }: { keys: string }): void {
    logger.info(`Sending keys: ${keys}`);
    bus.emit('windows:keys-sent', { success: true });
  }
}

