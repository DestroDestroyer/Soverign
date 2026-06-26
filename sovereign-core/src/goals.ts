import { Service, bus, logger } from './interfaces';

interface Goal {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export class GoalsService implements Service {
  private goals = new Map<string, Goal>();
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('GoalsService is already running, ignoring start request.');
      return;
    }
    logger.info('GoalsService starting...');
    this.running = true;

    this.on('goals:create', (data: any) => {
      try {
        this.createGoal(data);
      } catch (err) {
        logger.error(`Error in goals:create event handler: ${err}`);
      }
    });

    this.on('goals:update', (data: any) => {
      try {
        this.updateGoal(data);
      } catch (err) {
        logger.error(`Error in goals:update event handler: ${err}`);
      }
    });

    this.on('goals:list', () => {
      try {
        this.listGoals();
      } catch (err) {
        logger.error(`Error in goals:list event handler: ${err}`);
      }
    });

    bus.emit('goals:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('GoalsService is not running, ignoring stop request.');
      return;
    }
    logger.info('GoalsService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createGoal(goal: Partial<Goal>): void {
    const id = `goal-${Date.now()}`;
    const newGoal: Goal = { id, description: goal.description || '', status: 'pending', ...goal };
    this.goals.set(id, newGoal);
    bus.emit('goals:created', newGoal);
  }

  private updateGoal({ id, status }: { id: string; status: Goal['status'] }): void {
    const goal = this.goals.get(id);
    if (goal) {
      goal.status = status;
      bus.emit('goals:updated', goal);
    }
  }

  private listGoals(): void {
    const all = Array.from(this.goals.values());
    bus.emit('goals:list-result', { goals: all });
  }
}

