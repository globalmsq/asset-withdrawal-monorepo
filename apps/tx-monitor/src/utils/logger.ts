import { LoggerService } from 'shared';

export class Logger {
  private logger: LoggerService;

  constructor(private context: string) {
    this.logger = new LoggerService({
      service: `tx-monitor:${context}`,
    });
  }

  info(message: string, data?: any) {
    const metadata = data ? { metadata: { data } } : undefined;
    this.logger.info(message, metadata);
  }

  error(message: string, error?: any) {
    this.logger.error(message, error);
  }

  warn(message: string, data?: any) {
    const metadata = data ? { metadata: { data } } : undefined;
    this.logger.warn(message, metadata);
  }

  debug(message: string, data?: any) {
    const metadata = data ? { metadata: { data } } : undefined;
    this.logger.debug(message, metadata);
  }
}
