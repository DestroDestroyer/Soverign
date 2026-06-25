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

  async start() {
    logger.info('MemoryManager starting...');
    bus.on('memory:store', (data) => this.storeMemory(data));
    bus.on('memory:recall', (data) => this.recallMemory(data));
    this.running = true;
    bus.emit('memory:ready', {});
  }

  async stop() {
    logger.info('MemoryManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private storeMemory({ content, longTerm = false }: any) {
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

  private recallMemory({ query }: any) {
    const results = this.shortTerm.filter(e => e.content.includes(query));
    bus.emit('memory:recall-result', { results });
  }
}
