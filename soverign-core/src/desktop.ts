import { Service, bus, logger } from './interfaces';

export class DesktopApp implements Service {
  private running = false;

  async start() {
    logger.info('DesktopApp starting...');
    bus.on('repository:changed', (data) => this.onDataChanged(data));
    bus.on('goals:updated', (data) => this.onGoalsUpdated(data));
    this.running = true;
    bus.emit('desktop:ready', {});
  }

  async stop() {
    logger.info('DesktopApp stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  onUserCommand(command: string) {
    bus.emit('desktop:command', { command });
  }

  onDataChanged(data: any) {
    logger.debug('Desktop: data changed', data);
  }

  onGoalsUpdated(data: any) {
    logger.debug('Desktop: goals updated', data);
  }

  sendVoiceInput(audioBuffer: Buffer) {
    bus.emit('voice:input', { audio: audioBuffer });
  }
}
