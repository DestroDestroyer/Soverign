import { Service, EventBus, bus, logger } from './interfaces';

interface Entity { id: string; [key: string]: any; }

export class RepositoryService implements Service {
  private store = new Map<string, Entity>();
  private running = false;

  async start() {
    logger.info('RepositoryService starting...');
    this.running = true;
    bus.emit('repository:ready', {});
  }

  async stop() {
    logger.info('RepositoryService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  create(entity: Entity): Entity {
    this.store.set(entity.id, entity);
    bus.emit('repository:changed', { action: 'create', entity });
    return entity;
  }

  read(id: string): Entity | undefined {
    return this.store.get(id);
  }

  update(id: string, data: Partial<Entity>): Entity | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    bus.emit('repository:changed', { action: 'update', entity: updated });
    return updated;
  }

  delete(id: string): boolean {
    const result = this.store.delete(id);
    if (result) bus.emit('repository:changed', { action: 'delete', id });
    return result;
  }

  query(filter: (e: Entity) => boolean): Entity[] {
    return Array.from(this.store.values()).filter(filter);
  }

  getAll(): Entity[] {
    return Array.from(this.store.values());
  }
}
