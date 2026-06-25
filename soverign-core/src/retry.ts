import { Service, bus, logger } from './interfaces';

export class RetryManager implements Service {
  private running = false;

  async start() {
    logger.info('RetryManager starting...');
    bus.on('retry:execute', (data) => this.executeWithRetry(data));
    this.running = true;
    bus.emit('retry:ready', {});
  }

  async stop() {
    logger.info('RetryManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async executeWithRetry({ task, maxAttempts = 3 }: any) {
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

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
