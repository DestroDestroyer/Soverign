import { Service, bus, logger } from './interfaces';
import crypto from 'crypto';

export class SecurityService implements Service {
  private running = false;
  private key: Buffer | null = null;
  private listeners: Array<{ event: string; handler: (...args: any[]) => void }> = [];

  private on(event: string, handler: (...args: any[]) => void): void {
    bus.on(event, handler);
    this.listeners.push({ event, handler });
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('SecurityService is already running, ignoring start request.');
      return;
    }
    logger.info('SecurityService starting...');
    this.key = crypto.randomBytes(32);

    this.on('security:encrypt', (data: any) => {
      try {
        this.encrypt(data);
      } catch (err) {
        logger.error(`Error in security:encrypt event handler: ${err}`);
      }
    });

    this.on('security:decrypt', (data: any) => {
      try {
        this.decrypt(data);
      } catch (err) {
        logger.error(`Error in security:decrypt event handler: ${err}`);
      }
    });

    this.running = true;
    bus.emit('security:ready', {});
  }

  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('SecurityService is not running, ignoring stop request.');
      return;
    }
    logger.info('SecurityService stopping...');
    this.running = false;
    this.key = null;

    for (const { event, handler } of this.listeners) {
      bus.off(event, handler);
    }
    this.listeners = [];
  }

  async health(): Promise<{ status: string }> {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private encrypt({ plaintext }: { plaintext: string }): void {
    if (!this.key) {
      throw new Error('Key not initialized');
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    bus.emit('security:encrypted', { encrypted, iv: iv.toString('hex'), authTag: authTag.toString('hex') });
  }

  private decrypt({ encrypted, iv, authTag }: { encrypted: string; iv: string; authTag: string }): void {
    if (!this.key) {
      throw new Error('Key not initialized');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    bus.emit('security:decrypted', { plaintext });
  }
}

