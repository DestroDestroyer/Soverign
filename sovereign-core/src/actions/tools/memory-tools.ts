import type { MemoryOrchestrator } from '../../vault/memory/orchestrator.ts';
import type { GraphPipeline } from '../../vault/graph/pipeline.ts';
import type { ToolDefinition } from './registry.ts';

let memoryOrch: MemoryOrchestrator | null = null;
let graphPipe: GraphPipeline | null = null;

export function setMemoryRefs(memory: MemoryOrchestrator, graph: GraphPipeline): void {
  memoryOrch = memory;
  graphPipe = graph;
}

export function createSearchMemoryTool(): ToolDefinition {
  return {
    name: 'search_memory',
    description: 'Search the Second Brain memory system across all memory engines and the knowledge graph',
    category: 'memory',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      limit: { type: 'number', description: 'Max results (default 5)', required: false },
      include_graph: { type: 'boolean', description: 'Also search knowledge graph (default true)', required: false },
    },
    execute: async (args) => {
      const query = String(args.query ?? '');
      const limit = Number(args.limit ?? 5);
      const includeGraph = args.include_graph !== false;
      const parts: string[] = [];
      if (memoryOrch) {
        const results = await memoryOrch.search(query, limit);
        if (results.length > 0) {
          parts.push('=== Memory Results ===');
          for (const r of results) {
            parts.push(`[${r.engine}] (score: ${r.score.toFixed(2)}) ${String(r.entry.content).slice(0, 200)}`);
          }
        }
      }
      if (includeGraph && graphPipe) {
        const triples = await graphPipe.search(query);
        if (triples.length > 0) {
          parts.push('=== Knowledge Graph Results ===');
          for (const t of triples.slice(0, limit)) {
            parts.push(`${t.subject} --${t.predicate}--> ${t.object}`);
          }
        }
      }
      return { result: parts.join('\n') || 'No results found.' };
    },
  };
}

export function createStoreMemoryTool(): ToolDefinition {
  return {
    name: 'store_memory',
    description: 'Store a piece of information in the Second Brain memory system',
    category: 'memory',
    parameters: {
      content: { type: 'string', description: 'Content to remember', required: true },
      source: { type: 'string', description: 'Source (chat, document, manual)', required: false },
      priority: { type: 'string', description: 'Priority (low, normal, high)', required: false },
      ttl_minutes: { type: 'number', description: 'Auto-expire after N minutes', required: false },
    },
    execute: async (args) => {
      const content = String(args.content ?? '');
      const source = String(args.source ?? 'chat');
      const priority = String(args.priority ?? 'normal');
      const ttlMs = args.ttl_minutes ? Number(args.ttl_minutes) * 60_000 : undefined;
      if (!content) return { error: 'Content is required' };
      const ids: string[] = [];
      if (memoryOrch) {
        const stored = await memoryOrch.store(content, source, priority, {}, ttlMs);
        ids.push(...stored);
      }
      if (graphPipe && content.length > 20) {
        const count = await graphPipe.processText(content, source);
        if (count > 0) ids.push(`graph:${count}triples`);
      }
      return { stored: true, ids, engines: memoryOrch ? Object.keys(await memoryOrch.stats()) : [] };
    },
  };
}

export function createRecallTool(): ToolDefinition {
  return {
    name: 'recall',
    description: 'Recall what the system knows about a topic, person, or project by searching all memory backends',
    category: 'memory',
    parameters: {
      topic: { type: 'string', description: 'Topic to recall', required: true },
    },
    execute: async (args) => {
      const topic = String(args.topic ?? '');
      if (!topic) return { result: 'Please provide a topic.' };
      const parts: string[] = [];
      if (memoryOrch) {
        const results = await memoryOrch.search(topic, 5);
        if (results.length > 0) {
          parts.push('What I remember:');
          for (const r of results) {
            parts.push(`- ${String(r.entry.content).slice(0, 300)}`);
          }
        }
      }
      if (graphPipe) {
        const triples = await graphPipe.search(topic);
        if (triples.length > 0) {
          parts.push('Related knowledge:');
          for (const t of triples.slice(0, 5)) {
            parts.push(`- ${t.subject} ${t.predicate} ${t.object}`);
          }
        }
      }
      return { result: parts.join('\n') || `I don't have any stored information about "${topic}".` };
    },
  };
}
