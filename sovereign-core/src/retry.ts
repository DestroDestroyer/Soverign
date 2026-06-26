import { Service, bus, logger } from './interfaces';

export class RetryManager implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('RetryManager is already running, ignoring start request.');
      return;
    }
    logger.info('RetryManager starting...');
    this.running = true;

    this.on('retry:execute', (data: any) => {
      this.executeWithRetry(data).catch(err => {
        logger.error(`Error in executeWithRetry for retry:execute event: ${err}`);
      });
    });

    bus.emit('retry:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('RetryManager is not running, ignoring stop request.');
      return;
    }
    logger.info('RetryManager stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async executeWithRetry({ task, maxAttempts = 3 }: { task: () => Promise<any>; maxAttempts?: number }): Promise<void> {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const result = await task();
        bus.emit('retry:success', { result });
        return;
      } catch (err) {
        attempts++;
        logger.warn(`Retry attempt ${attempts} failed`);
        await this.delay(1000 * Math.pow(2, attempts));
      }
    }
    bus.emit('retry:failed', { error: 'All attempts exhausted' });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

