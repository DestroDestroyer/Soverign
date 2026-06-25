import { Service, bus, logger } from './interfaces';
import crypto from 'crypto';

export class SecurityService implements Service {
  private running = false;
  private key: Buffer | null = null;

  async start() {
    logger.info('SecurityService starting...');
    this.key = crypto.randomBytes(32);
    bus.on('security:encrypt', (data) => this.encrypt(data));
    bus.on('security:decrypt', (data) => this.decrypt(data));
    this.running = true;
    bus.emit('security:ready', {});
  }

  async stop() {
    logger.info('SecurityService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private encrypt({ plaintext }: any) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key!, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    bus.emit('security:encrypted', { encrypted, iv: iv.toString('hex'), authTag: authTag.toString('hex') });
  }

  private decrypt({ encrypted, iv, authTag }: any) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key!, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    bus.emit('security:decrypted', { plaintext });
  }
}
