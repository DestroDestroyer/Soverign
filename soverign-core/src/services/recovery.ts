import { Service, bus, logger } from '../interfaces';

export class RecoveryManager implements Service {
  private running = false;
  private serviceStatus = new Map<string, boolean>();
  private servicesMap: Map<string, Service> | null = null;
  private recoveryAttempts = new Map<string, number>();
  private readonly MAX_ATTEMPTS = 3;

  setServicesMap(services: Map<string, Service>) {
    this.servicesMap = services;
  }

  async start() {
    logger.info('RecoveryManager starting...');
    bus.on('health:status', (data) => this.handleHealthStatus(data));
    bus.on('service:failed', (data) => this.handleServiceFailure(data));
    this.running = true;
    bus.emit('recovery:ready', {});
  }

  private handleHealthStatus({ service, status }: any) {
    if (service === 'recovery' || service === 'windowsService') return; // Skip recovery/winSvc loops
    
    const wasRunning = this.serviceStatus.get(service);
    const isHealthy = status.status === 'healthy';
    this.serviceStatus.set(service, isHealthy);

    // If service was running/ready but now is unhealthy/unresponsive
    if (wasRunning === true && !isHealthy) {
      logger.warn(`[RECOVERY] Service ${service} became unhealthy, initiating recovery`);
      this.recoverService(service);
    } else if (wasRunning === undefined && !isHealthy) {
      // First check failed, set it as unhealthy
      this.serviceStatus.set(service, false);
      logger.warn(`[RECOVERY] Service ${service} started in unhealthy state, initiating recovery`);
      this.recoverService(service);
    }
  }

  private async recoverService(serviceName: string) {
    if (!this.servicesMap) {
      logger.error('[RECOVERY] Cannot recover service: servicesMap not set');
      return;
    }
    const service = this.servicesMap.get(serviceName);
    if (!service) {
      logger.error(`[RECOVERY] Cannot recover service: ${serviceName} not found in services registry`);
      return;
    }

    const attempts = this.recoveryAttempts.get(serviceName) || 0;
    if (attempts >= this.MAX_ATTEMPTS) {
      logger.error(`[RECOVERY] Max recovery attempts (${this.MAX_ATTEMPTS}) reached for service ${serviceName}. Escalating...`);
      this.aggressiveRecovery(serviceName);
      return;
    }

    this.recoveryAttempts.set(serviceName, attempts + 1);

    try {
      logger.info(`[RECOVERY] Attempting to recover service: ${serviceName} (Attempt ${attempts + 1}/${this.MAX_ATTEMPTS})`);
      bus.setState(serviceName, 'recovering');

      // Stop the service
      logger.info(`[RECOVERY] Stopping service: ${serviceName}`);
      await service.stop();
      
      // Wait a moment for resource releasing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Restart the service
      logger.info(`[RECOVERY] Restarting service: ${serviceName}`);
      await service.start();
      
      // If start succeeds, update status
      bus.setState(serviceName, 'ready');
      this.serviceStatus.set(serviceName, true);
      this.recoveryAttempts.set(serviceName, 0); // Reset attempts
      logger.info(`[RECOVERY] Service ${serviceName} recovered successfully`);
    } catch (error) {
      logger.error(`[RECOVERY] Failed to recover service ${serviceName}:`, error);
      if (attempts + 1 >= this.MAX_ATTEMPTS) {
        this.aggressiveRecovery(serviceName);
      }
    }
  }

  private aggressiveRecovery(serviceName: string) {
    logger.warn(`[RECOVERY] Attempting aggressive recovery for ${serviceName}`);
    bus.setState(serviceName, 'failed');
    bus.emit('system:restart-required', { service: serviceName });
  }

  private handleServiceFailure({ service }: any) {
    logger.error(`[RECOVERY] Service ${service} reported critical failure`);
    this.recoverService(service);
  }

  async stop() {
    logger.info('RecoveryManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' as const };
  }
}
