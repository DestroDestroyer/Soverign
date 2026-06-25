import { Service, bus, logger } from './interfaces';

interface Node { id: string; label: string; properties: any; }
interface Edge { from: string; to: string; label: string; properties: any; }

export class GraphifyService implements Service {
  private nodes = new Map<string, Node>();
  private edges: Edge[] = [];
  private running = false;

  async start() {
    logger.info('GraphifyService starting...');
    bus.on('graph:add-node', (data) => this.addNode(data));
    bus.on('graph:add-edge', (data) => this.addEdge(data));
    bus.on('graph:query', (data) => this.queryGraph(data));
    this.running = true;
    bus.emit('graphify:ready', {});
  }

  async stop() {
    logger.info('GraphifyService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addNode(node: Node) {
    this.nodes.set(node.id, node);
    bus.emit('graph:node-added', node);
  }

  private addEdge(edge: Edge) {
    this.edges.push(edge);
    bus.emit('graph:edge-added', edge);
  }

  private queryGraph({ query }: any) {
    const results = this.nodes.values();
    bus.emit('graph:query-result', { results: Array.from(results) });
  }
}
