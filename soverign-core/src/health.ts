import { Service, bus, logger } from './interfaces';

export class HealthMonitor implements Service {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private services: Map<string, Service> = new Map();

  registerService(name: string, service: Service) {
    this.services.set(name, service);
  }

  async start() {
    logger.info('HealthMonitor starting...');
    this.intervalId = setInterval(() => this.checkAll(), 10000);
    this.running = true;
    bus.emit('health:ready', {});
  }

  async stop() {
    logger.info('HealthMonitor stopping...');
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async checkAll() {
    for (const [name, service] of this.services) {
      try {
        const status = await service.health();
        bus.emit('health:status', { service: name, status });
      } catch (err) {
        bus.emit('health:error', { service: name, error: err });
      }
    }
  }
}
