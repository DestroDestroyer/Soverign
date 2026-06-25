import { Service, bus, logger } from './interfaces';

interface Milestone {
  id: string;
  description: string;
  targetDate: Date;
  status: 'pending' | 'in-progress' | 'completed';
}

export class RoadmapService implements Service {
  private milestones: Milestone[] = [];
  private running = false;

  async start() {
    logger.info('RoadmapService starting...');
    bus.on('roadmap:add', (data) => this.addMilestone(data));
    bus.on('roadmap:list', () => this.listMilestones());
    this.running = true;
    bus.emit('roadmap:ready', {});
  }

  async stop() {
    logger.info('RoadmapService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addMilestone(milestone: Partial<Milestone>) {
    const newMilestone: Milestone = {
      id: `ms-${Date.now()}`,
      description: milestone.description || '',
      targetDate: milestone.targetDate || new Date(),
      status: 'pending',
      ...milestone,
    };
    this.milestones.push(newMilestone);
    bus.emit('roadmap:added', newMilestone);
  }

  private listMilestones() {
    bus.emit('roadmap:list-result', { milestones: this.milestones });
  }
}
