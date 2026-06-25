import { Service, bus, logger } from './interfaces';

export class WindowsIntegration implements Service {
  private running = false;

  async start() {
    logger.info('WindowsIntegration starting...');
    bus.on('windows:get-active-window', () => this.getActiveWindow());
    bus.on('windows:send-keys', (data) => this.sendKeys(data));
    this.running = true;
    bus.emit('windows:ready', {});
  }

  async stop() {
    logger.info('WindowsIntegration stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private getActiveWindow() {
    const windowInfo = { title: 'Sovereign Deep', handle: 0x1234 };
    bus.emit('windows:active-window', windowInfo);
  }

  private sendKeys({ keys }: any) {
    logger.info(`Sending keys: ${keys}`);
    bus.emit('windows:keys-sent', { success: true });
  }
}
