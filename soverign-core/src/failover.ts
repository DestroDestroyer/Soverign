import { Service, bus, logger } from './interfaces';

export class FailoverService implements Service {
  private primary: Service | null = null;
  private secondary: Service | null = null;
  private active: 'primary' | 'secondary' = 'primary';
  private running = false;

  registerPrimary(service: Service) { this.primary = service; }
  registerSecondary(service: Service) { this.secondary = service; }

  async start() {
    logger.info('FailoverService starting...');
    bus.on('failover:trigger', () => this.switchOver());
    this.running = true;
    bus.emit('failover:ready', {});
  }

  async stop() {
    logger.info('FailoverService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async switchOver() {
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
