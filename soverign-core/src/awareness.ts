import { Service, bus, logger } from './interfaces';

export class AwarenessService implements Service {
  private running = false;

  async start() {
    logger.info('AwarenessService starting...');
    bus.on('awareness:snapshot', () => this.takeSnapshot());
    this.running = true;
    bus.emit('awareness:ready', {});
  }

  async stop() {
    logger.info('AwarenessService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private takeSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      activeWindow: 'Sovereign Deep',
      userPresent: true,
      screenContent: '...',
    };
    bus.emit('awareness:snapshot-result', snapshot);
  }
}
