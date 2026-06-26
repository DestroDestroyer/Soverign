import { Service, bus, logger } from './interfaces';

export class BrainManager implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('BrainManager is already running, ignoring start request.');
      return;
    }
    logger.info('BrainManager starting...');
    this.running = true;

    this.on('brain:query', (data: any) => {
      try {
        this.processQuery(data);
      } catch (err) {
        logger.error(`Error in brain:query event handler: ${err}`);
      }
    });

    this.on('brain:context', (data: any) => {
      try {
        this.updateContext(data);
      } catch (err) {
        logger.error(`Error in brain:context event handler: ${err}`);
      }
    });

    bus.emit('brain:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('BrainManager is not running, ignoring stop request.');
      return;
    }
    logger.info('BrainManager stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processQuery({ prompt, history }: { prompt: string; history?: any[] }): void {
    const response = `Response to: ${prompt}`;
    bus.emit('brain:response', { response });
  }

  private updateContext(context: any): void {
    bus.emit('brain:context-updated', { context });
  }
}

