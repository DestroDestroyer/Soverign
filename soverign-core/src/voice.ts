import { Service, bus, logger } from './interfaces';

export class VoiceStack implements Service {
  private running = false;

  async start() {
    logger.info('VoiceStack starting...');
    bus.on('voice:input', (data) => this.processAudio(data));
    bus.on('voice:speak', (data) => this.synthesize(data));
    this.running = true;
    bus.emit('voice:ready', {});
  }

  async stop() {
    logger.info('VoiceStack stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processAudio({ audio }: any) {
    const text = '[transcribed text]';
    bus.emit('voice:transcription', { text });
  }

  private synthesize({ text }: any) {
    const audioBuffer = Buffer.from('fake audio');
    bus.emit('voice:audio-output', { audio: audioBuffer });
  }
}
