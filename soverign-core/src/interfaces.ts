export interface Service {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }>;
}

export type EventCallback = (data: any) => void;

export class EventBus {
  private listeners: Map<string, EventCallback[]> = new Map();
  private state: Map<string, any> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  emit(event: string, data: any) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) cb(data);
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    }
  }

  setState(key: string, value: any) {
    this.state.set(key, value);
    this.emit(`state:${key}`, value);
  }

  getState(key: string): any {
    return this.state.get(key);
  }
}

export const bus = new EventBus();
