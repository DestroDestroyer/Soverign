/**
 * Brain Event Bus — lightweight internal pub/sub that replaces wsService
 * for the brain process. Events are forwarded to the Electron app via IPC.
 */

export type BrainEventHandler = (event: string, data: unknown) => void;

const MAX_LISTENERS_PER_EVENT = 20;

export class BrainEventBus {
  private listeners = new Map<string, BrainEventHandler[]>();

  on(event: string, handler: BrainEventHandler): void {
    const handlers = this.listeners.get(event) || [];
    if (handlers.length >= MAX_LISTENERS_PER_EVENT) {
      console.warn(`[BrainEventBus] Event "${event}" has ${handlers.length} listeners (max ${MAX_LISTENERS_PER_EVENT})`);
    }
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  off(event: string, handler: BrainEventHandler): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    this.listeners.set(
      event,
      handlers.filter((h) => h !== handler),
    );
  }

  emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event, data);
      } catch (err) {
        console.error(`[BrainEventBus] Handler error for ${event}:`, err);
      }
    }
  }
}
