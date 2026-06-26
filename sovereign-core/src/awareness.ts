import { Service, bus, logger } from './interfaces';

export class AwarenessService implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('AwarenessService is already running, ignoring start request.');
      return;
    }
    logger.info('AwarenessService starting...');
    this.running = true;

    this.on('awareness:snapshot', () => {
      try {
        this.takeSnapshot();
      } catch (err) {
        logger.error(`Error in awareness:snapshot event handler: ${err}`);
      }
    });

    bus.emit('awareness:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('AwarenessService is not running, ignoring stop request.');
      return;
    }
    logger.info('AwarenessService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private takeSnapshot(): void {
    const snapshot = {
      timestamp: Date.now(),
      activeWindow: 'Sovereign Deep',
      userPresent: true,
      screenContent: '...',
    };
    bus.emit('awareness:snapshot-result', snapshot);
  }
}

