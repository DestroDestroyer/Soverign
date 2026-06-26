import { Service, bus, logger } from './interfaces';

export class VoiceStack implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('VoiceStack is already running, ignoring start request.');
      return;
    }
    logger.info('VoiceStack starting...');
    this.running = true;

    this.on('voice:input', (data: any) => {
      try {
        this.processAudio(data);
      } catch (err) {
        logger.error(`Error in voice:input event handler: ${err}`);
      }
    });

    this.on('voice:speak', (data: any) => {
      try {
        this.synthesize(data);
      } catch (err) {
        logger.error(`Error in voice:speak event handler: ${err}`);
      }
    });

    bus.emit('voice:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('VoiceStack is not running, ignoring stop request.');
      return;
    }
    logger.info('VoiceStack stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processAudio({ audio }: { audio: Buffer }): void {
    const text = '[transcribed text]';
    bus.emit('voice:transcription', { text });
  }

  private synthesize({ text }: { text: string }): void {
    const audioBuffer = Buffer.from('fake audio');
    bus.emit('voice:audio-output', { audio: audioBuffer });
  }
}

