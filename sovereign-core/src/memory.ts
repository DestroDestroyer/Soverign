import { Service, bus, logger } from './interfaces';

interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  timestamp: number;
}

export class MemoryManager implements Service {
  private shortTerm: MemoryEntry[] = [];
  private longTerm: Map<string, MemoryEntry> = new Map();
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('MemoryManager is already running, ignoring start request.');
      return;
    }
    logger.info('MemoryManager starting...');
    this.running = true;

    this.on('memory:store', (data: any) => {
      try {
        this.storeMemory(data);
      } catch (err) {
        logger.error(`Error in memory:store event handler: ${err}`);
      }
    });

    this.on('memory:recall', (data: any) => {
      try {
        this.recallMemory(data);
      } catch (err) {
        logger.error(`Error in memory:recall event handler: ${err}`);
      }
    });

    bus.emit('memory:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('MemoryManager is not running, ignoring stop request.');
      return;
    }
    logger.info('MemoryManager stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private storeMemory({ content, longTerm = false }: { content: string; longTerm?: boolean }): void {
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}`,
      content,
      timestamp: Date.now(),
    };
    if (longTerm) {
      this.longTerm.set(entry.id, entry);
    } else {
      this.shortTerm.push(entry);
      if (this.shortTerm.length > 100) this.shortTerm.shift();
    }
    bus.emit('memory:stored', entry);
  }

  private recallMemory({ query }: { query: string }): void {
    const results = this.shortTerm.filter(e => e.content.includes(query));
    bus.emit('memory:recall-result', { results });
  }
}

