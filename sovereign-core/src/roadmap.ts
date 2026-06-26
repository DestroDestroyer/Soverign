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
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('RoadmapService is already running, ignoring start request.');
      return;
    }
    logger.info('RoadmapService starting...');
    this.running = true;

    this.on('roadmap:add', (data: any) => {
      try {
        this.addMilestone(data);
      } catch (err) {
        logger.error(`Error in roadmap:add event handler: ${err}`);
      }
    });

    this.on('roadmap:list', () => {
      try {
        this.listMilestones();
      } catch (err) {
        logger.error(`Error in roadmap:list event handler: ${err}`);
      }
    });

    bus.emit('roadmap:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('RoadmapService is not running, ignoring stop request.');
      return;
    }
    logger.info('RoadmapService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addMilestone(milestone: Partial<Milestone>): void {
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

  private listMilestones(): void {
    bus.emit('roadmap:list-result', { milestones: [...this.milestones] });
  }
}

