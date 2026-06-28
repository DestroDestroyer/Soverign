import type { GraphExtractor, Triple } from './types.ts';

/** Simple regex-based extractor that finds common patterns */
export class PatternExtractor implements GraphExtractor {
  readonly name = 'pattern';

  private patterns = [
    { regex: /(\w+)\s+is\s+(?:a|an|the)\s+(.+)/gi, predicate: 'is_a' },
    { regex: /(\w+)\s+has\s+(?:a|an|the)?\s*(.+)/gi, predicate: 'has' },
    { regex: /(\w+)\s+uses\s+(?:a|an|the)?\s*(.+)/gi, predicate: 'uses' },
    { regex: /(\w+)\s+works?\s+(?:for|at)\s+(.+)/gi, predicate: 'works_at' },
    { regex: /(\w+)\s+lives?\s+in\s+(.+)/gi, predicate: 'lives_in' },
    { regex: /(\w+)\s+likes?\s+(.+)/gi, predicate: 'likes' },
    { regex: /(\w+)\s+created\s+(.+)/gi, predicate: 'created' },
    { regex: /(\w+)\s+built\s+(.+)/gi, predicate: 'built' },
    { regex: /(\w+)\s+owns?\s+(.+)/gi, predicate: 'owns' },
    { regex: /(\w+)\s+prefers?\s+(.+)/gi, predicate: 'prefers' },
  ];

  async extract(text: string): Promise<Triple[]> {
    const triples: Triple[] = [];
    const now = Date.now();

    for (const { regex, predicate } of this.patterns) {
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        triples.push({
          subject: match[1].trim(),
          predicate,
          object: match[2].trim(),
          confidence: 0.6,
          source: 'pattern-extractor',
          timestamp: now,
        });
      }
    }

    return this.deduplicate(triples);
  }

  private deduplicate(triples: Triple[]): Triple[] {
    const seen = new Set<string>();
    return triples.filter(t => {
      const key = `${t.subject}|${t.predicate}|${t.object}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
