import { Service, bus, logger } from './interfaces';

interface Goal {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export class GoalsService implements Service {
  private goals = new Map<string, Goal>();
  private running = false;

  async start() {
    logger.info('GoalsService starting...');
    bus.on('goals:create', (data) => this.createGoal(data));
    bus.on('goals:update', (data) => this.updateGoal(data));
    bus.on('goals:list', () => this.listGoals());
    this.running = true;
    bus.emit('goals:ready', {});
  }

  async stop() {
    logger.info('GoalsService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createGoal(goal: Partial<Goal>) {
    const id = `goal-${Date.now()}`;
    const newGoal: Goal = { id, description: goal.description || '', status: 'pending', ...goal };
    this.goals.set(id, newGoal);
    bus.emit('goals:created', newGoal);
  }

  private updateGoal({ id, status }: any) {
    const goal = this.goals.get(id);
    if (goal) {
      goal.status = status;
      bus.emit('goals:updated', goal);
    }
  }

  private listGoals() {
    const all = Array.from(this.goals.values());
    bus.emit('goals:list-result', { goals: all });
  }
}
