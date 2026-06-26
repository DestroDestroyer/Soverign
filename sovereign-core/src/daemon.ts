import { Service, bus, logger } from './interfaces';

export class Daemon implements Service {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Daemon is already running, ignoring start request.');
      return;
    }
    logger.info('Daemon starting...');
    this.running = true;

    this.on('daemon:schedule', (data: any) => {
      try {
        this.scheduleTask(data);
      } catch (err) {
        logger.error(`Error in daemon:schedule event handler: ${err}`);
      }
    });

    this.intervalId = setInterval(() => {
      try {
        this.heartbeat();
      } catch (err) {
        logger.error(`Error in Daemon heartbeat interval: ${err}`);
      }
    }, 5000);

    bus.emit('daemon:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('Daemon is not running, ignoring stop request.');
      return;
    }
    logger.info('Daemon stopping...');
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private heartbeat(): void {
    bus.emit('daemon:heartbeat', { timestamp: Date.now() });
  }

  private scheduleTask(task: { id: string; [key: string]: any }): void {
    logger.info('Daemon executing task', task);
  }
}

