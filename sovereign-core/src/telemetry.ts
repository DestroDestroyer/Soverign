import { Service, bus, logger } from './interfaces';

export class TelemetryService implements Service {
  private metrics: any[] = [];
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('TelemetryService is already running, ignoring start request.');
      return;
    }
    logger.info('TelemetryService starting...');
    this.running = true;

    this.on('telemetry:record', (data: any) => {
      try {
        this.recordMetric(data);
      } catch (err) {
        logger.error(`Error in telemetry:record event handler: ${err}`);
      }
    });

    bus.emit('telemetry:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('TelemetryService is not running, ignoring stop request.');
      return;
    }
    logger.info('TelemetryService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private recordMetric(metric: any): void {
    if (!this.running) return;
    this.metrics.push({ ...metric, timestamp: Date.now() });
    logger.debug('Telemetry metric', metric);
  }

  getMetrics(): any[] {
    return [...this.metrics];
  }
}

