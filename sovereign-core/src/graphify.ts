import { Service, bus, logger } from './interfaces';

interface Node { id: string; label: string; properties?: Record<string, any>; }
interface Edge { from: string; to: string; label: string; properties?: Record<string, any>; }

export class GraphifyService implements Service {
  private nodes = new Map<string, Node>();
  private edges: Edge[] = [];
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('GraphifyService is already running, ignoring start request.');
      return;
    }
    logger.info('GraphifyService starting...');
    this.running = true;

    this.on('graph:add-node', (data: any) => {
      try {
        this.addNode(data);
      } catch (err) {
        logger.error(`Error in graph:add-node event handler: ${err}`);
      }
    });

    this.on('graph:add-edge', (data: any) => {
      try {
        this.addEdge(data);
      } catch (err) {
        logger.error(`Error in graph:add-edge event handler: ${err}`);
      }
    });

    this.on('graph:query', (data: any) => {
      try {
        this.queryGraph(data);
      } catch (err) {
        logger.error(`Error in graph:query event handler: ${err}`);
      }
    });

    bus.emit('graphify:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('GraphifyService is not running, ignoring stop request.');
      return;
    }
    logger.info('GraphifyService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addNode(node: Node): void {
    if (!node || !node.id) {
      throw new Error('Invalid node: Node must have an ID');
    }
    if (this.nodes.has(node.id)) {
      logger.warn(`Node with ID ${node.id} already exists, overwriting.`);
    }
    this.nodes.set(node.id, node);
    bus.emit('graph:node-added', node);
  }

  private addEdge(edge: Edge): void {
    if (!edge || !edge.from || !edge.to) {
      throw new Error('Invalid edge: Edge must specify from and to nodes');
    }
    if (!this.nodes.has(edge.from)) {
      throw new Error(`Invalid edge: source node "${edge.from}" does not exist`);
    }
    if (!this.nodes.has(edge.to)) {
      throw new Error(`Invalid edge: target node "${edge.to}" does not exist`);
    }
    this.edges.push(edge);
    bus.emit('graph:edge-added', edge);
  }

  private queryGraph({ query }: { query?: string }): void {
    const allNodes = Array.from(this.nodes.values());
    if (!query) {
      bus.emit('graph:query-result', { results: allNodes });
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results = allNodes.filter(node => 
      node.id.toLowerCase().includes(lowerQuery) || 
      node.label.toLowerCase().includes(lowerQuery) ||
      (node.properties && JSON.stringify(node.properties).toLowerCase().includes(lowerQuery))
    );
    bus.emit('graph:query-result', { results });
  }
}

