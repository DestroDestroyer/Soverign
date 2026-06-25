import { Service, bus, logger } from './interfaces';

export class AutomationService implements Service {
  private running = false;

  async start() {
    logger.info('AutomationService starting...');
    bus.on('automation:run', (data) => this.runAutomation(data));
    this.running = true;
    bus.emit('automation:ready', {});
  }

  async stop() {
    logger.info('AutomationService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private runAutomation({ script, params }: any) {
    logger.info(`Running automation: ${script}`);
    const result = `Automation result for ${script}`;
    bus.emit('automation:result', { result });
  }
}
