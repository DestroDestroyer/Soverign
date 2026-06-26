import { Service, bus, logger } from './interfaces';

export class AutomationService implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('AutomationService is already running, ignoring start request.');
      return;
    }
    logger.info('AutomationService starting...');
    this.running = true;

    this.on('automation:run', (data: any) => {
      try {
        this.runAutomation(data);
      } catch (err) {
        logger.error(`Error in automation:run event handler: ${err}`);
      }
    });

    bus.emit('automation:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('AutomationService is not running, ignoring stop request.');
      return;
    }
    logger.info('AutomationService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private runAutomation({ script, params }: { script: string; params?: Record<string, any> }): void {
    logger.info(`Running automation: ${script}`);
    const result = `Automation result for ${script}`;
    bus.emit('automation:result', { result });
  }
}

