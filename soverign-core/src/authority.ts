import { Service, bus, logger } from './interfaces';

interface User {
  id: string;
  roles: string[];
}

export class AuthorityService implements Service {
  private users = new Map<string, User>();
  private running = false;

  async start() {
    logger.info('AuthorityService starting...');
    bus.on('auth:login', (creds) => this.login(creds));
    bus.on('auth:check', (data) => this.checkPermission(data));
    this.running = true;
    bus.emit('authority:ready', {});
  }

  async stop() {
    logger.info('AuthorityService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private login({ username, password }: any) {
    const user = this.users.get(username) || { id: username, roles: ['user'] };
    bus.emit('auth:token', { token: 'jwt-token', user });
  }

  private checkPermission({ userId, resource, action }: any) {
    const user = this.users.get(userId);
    const allowed = user && user.roles.includes('admin');
    bus.emit('auth:permission', { allowed });
  }

  addUser(user: User) {
    this.users.set(user.id, user);
  }
}
