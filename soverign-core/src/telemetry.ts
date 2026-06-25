import { Service, bus, logger } from './interfaces';

export class TelemetryService implements Service {
  private metrics: any[] = [];
  private running = false;

  async start() {
    logger.info('TelemetryService starting...');
    bus.on('telemetry:record', (data) => this.recordMetric(data));
    this.running = true;
    bus.emit('telemetry:ready', {});
  }

  async stop() {
    logger.info('TelemetryService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private recordMetric(metric: any) {
    this.metrics.push({ ...metric, timestamp: Date.now() });
    logger.debug('Telemetry metric', metric);
  }

  getMetrics() {
    return this.metrics;
  }
}
