import { Service, bus, logger } from './interfaces';

export class Sidecar implements Service {
  private running = false;

  async start() {
    logger.info('Sidecar starting...');
    bus.on('sidecar:forward', (data) => this.forwardRequest(data));
    bus.on('sidecar:log', (data) => this.logData(data));
    this.running = true;
    bus.emit('sidecar:ready', {});
  }

  async stop() {
    logger.info('Sidecar stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private forwardRequest(request: any) {
    logger.debug('Sidecar forwarding', request);
    bus.emit('sidecar:forwarded', { original: request });
  }

  private logData(data: any) {
    logger.info('Sidecar log:', data);
  }
}
