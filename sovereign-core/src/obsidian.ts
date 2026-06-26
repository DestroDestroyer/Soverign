import { Service, bus, logger } from './interfaces';

export class ObsidianIntegration implements Service {
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('ObsidianIntegration is already running, ignoring start request.');
      return;
    }
    logger.info('ObsidianIntegration starting...');
    this.running = true;

    this.on('obsidian:create-note', (data: any) => {
      try {
        this.createNote(data);
      } catch (err) {
        logger.error(`Error in obsidian:create-note event handler: ${err}`);
      }
    });

    this.on('obsidian:search', (data: any) => {
      try {
        this.searchNotes(data);
      } catch (err) {
        logger.error(`Error in obsidian:search event handler: ${err}`);
      }
    });

    bus.emit('obsidian:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('ObsidianIntegration is not running, ignoring stop request.');
      return;
    }
    logger.info('ObsidianIntegration stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createNote({ title, content }: { title: string; content: string }): void {
    const note = { id: `note-${Date.now()}`, title, content };
    bus.emit('obsidian:note-created', note);
  }

  private searchNotes({ query }: { query: string }): void {
    const results: any[] = [];
    bus.emit('obsidian:search-result', { results });
  }
}

