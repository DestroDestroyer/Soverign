import { Service, bus, logger } from './interfaces';

export class FailoverService implements Service {
  private primary: Service | null = null;
  private secondary: Service | null = null;
  private active: 'primary' | 'secondary' = 'primary';
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  registerPrimary(service: Service): void { this.primary = service; }
  registerSecondary(service: Service): void { this.secondary = service; }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('FailoverService is already running, ignoring start request.');
      return;
    }
    logger.info('FailoverService starting...');
    this.running = true;

    this.on('failover:trigger', () => {
      this.switchOver().catch(err => {
        logger.error(`Error executing switchOver in failover:trigger handler: ${err}`);
      });
    });

    bus.emit('failover:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('FailoverService is not running, ignoring stop request.');
      return;
    }
    logger.info('FailoverService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async switchOver(): Promise<void> {
    const current = this.active === 'primary' ? this.primary : this.secondary;
    const next = this.active === 'primary' ? this.secondary : this.primary;
    if (next) {
      await next.start();
      await current?.stop();
      this.active = this.active === 'primary' ? 'secondary' : 'primary';
      logger.info(`Failover: switched to ${this.active}`);
      bus.emit('failover:switched', { active: this.active });
    }
  }
}

