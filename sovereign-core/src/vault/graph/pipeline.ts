import type { GraphExtractor, GraphStore } from './types.ts';
import { SQLiteGraphStore } from './sqlite-graph.ts';
import { PatternExtractor } from './extractor.ts';

export class GraphPipeline {
  private extractors: GraphExtractor[] = [];
  private store: GraphStore;

  constructor() {
    this.store = new SQLiteGraphStore();
    this.extractors.push(new PatternExtractor());
  }

  registerExtractor(extractor: GraphExtractor): void {
    if (!this.extractors.find(e => e.name === extractor.name)) {
      this.extractors.push(extractor);
    }
  }

  getStore(): GraphStore { return this.store; }

  async processText(text: string, source?: string): Promise<number> {
    let total = 0;
    for (const extractor of this.extractors) {
      try {
        const triples = await extractor.extract(text);
        for (const t of triples) {
          if (source) t.source = source;
        }
        if (triples.length > 0) {
          await this.store.bulkInsert(triples);
          total += triples.length;
        }
      } catch (err) {
        console.warn(`[Graph] ${extractor.name} failed:`, (err as Error).message);
      }
    }
    return total;
  }

  async search(query: string) {
    return this.store.search(query);
  }

  async stats() {
    return this.store.stats();
  }

  async clear() {
    await this.store.clear();
  }
}
