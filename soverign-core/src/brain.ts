import { Service, bus, logger } from './interfaces';

export class BrainManager implements Service {
  private running = false;

  async start() {
    logger.info('BrainManager starting...');
    bus.on('brain:query', (data) => this.processQuery(data));
    bus.on('brain:context', (data) => this.updateContext(data));
    this.running = true;
    bus.emit('brain:ready', {});
  }

  async stop() {
    logger.info('BrainManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processQuery({ prompt, history }: any) {
    const response = `Response to: ${prompt}`;
    bus.emit('brain:response', { response });
  }

  private updateContext(context: any) {
    bus.emit('brain:context-updated', { context });
  }
}
