import { Service, bus, logger } from './interfaces';

export class ObsidianIntegration implements Service {
  private running = false;

  async start() {
    logger.info('ObsidianIntegration starting...');
    bus.on('obsidian:create-note', (data) => this.createNote(data));
    bus.on('obsidian:search', (data) => this.searchNotes(data));
    this.running = true;
    bus.emit('obsidian:ready', {});
  }

  async stop() {
    logger.info('ObsidianIntegration stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createNote({ title, content }: any) {
    const note = { id: `note-${Date.now()}`, title, content };
    bus.emit('obsidian:note-created', note);
  }

  private searchNotes({ query }: any) {
    const results: any[] = [];
    bus.emit('obsidian:search-result', { results });
  }
}
