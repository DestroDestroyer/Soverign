import { Service, bus, logger } from './interfaces';

interface User {
  id: string;
  roles: string[];
}

export class AuthorityService implements Service {
  private users = new Map<string, User>();
  private running = false;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('AuthorityService is already running, ignoring start request.');
      return;
    }
    logger.info('AuthorityService starting...');
    this.running = true;

    this.on('auth:login', (creds: any) => {
      try {
        this.login(creds);
      } catch (err) {
        logger.error(`Error in auth:login event handler: ${err}`);
      }
    });

    this.on('auth:check', (data: any) => {
      try {
        this.checkPermission(data);
      } catch (err) {
        logger.error(`Error in auth:check event handler: ${err}`);
      }
    });

    bus.emit('authority:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('AuthorityService is not running, ignoring stop request.');
      return;
    }
    logger.info('AuthorityService stopping...');
    this.running = false;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private login({ username, password }: Record<string, any>): void {
    const user = this.users.get(username) || { id: username, roles: ['user'] };
    bus.emit('auth:token', { token: 'jwt-token', user });
  }

  private checkPermission({ userId, resource, action }: { userId: string; resource?: string; action?: string }): void {
    const user = this.users.get(userId);
    const allowed = !!(user && user.roles.includes('admin'));
    bus.emit('auth:permission', { allowed });
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }
}

