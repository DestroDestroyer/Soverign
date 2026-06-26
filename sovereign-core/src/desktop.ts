import { Service, bus, logger } from './interfaces';

export class DesktopApp implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('DesktopApp is already running, ignoring start request.');
      return;
    }
    logger.info('DesktopApp starting...');
    this.running = true;

    this.on('repository:changed', (data: any) => {
      try {
        this.onDataChanged(data);
      } catch (err) {
        logger.error(`Error in repository:changed event handler: ${err}`);
      }
    });

    this.on('goals:updated', (data: any) => {
      try {
        this.onGoalsUpdated(data);
      } catch (err) {
        logger.error(`Error in goals:updated event handler: ${err}`);
      }
    });

    bus.emit('desktop:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('DesktopApp is not running, ignoring stop request.');
      return;
    }
    logger.info('DesktopApp stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  onUserCommand(command: string): void {
    bus.emit('desktop:command', { command });
  }

  onDataChanged(data: any): void {
    logger.debug('Desktop: data changed', data);
  }

  onGoalsUpdated(data: any): void {
    logger.debug('Desktop: goals updated', data);
  }

  sendVoiceInput(audioBuffer: Buffer): void {
    bus.emit('voice:input', { audio: audioBuffer });
  }
}

