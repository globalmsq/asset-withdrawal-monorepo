import { LoggerService } from 'shared';

export class Logger {
  private logger: LoggerService;

  constructor(private context: string) {
    this.logger = new LoggerService({
      service: `api-server:${context}`,
    });
  }

  info(message: string, ...args: any[]) {
    const metadata = args.length > 0 ? { metadata: { data: args } } : undefined;
    this.logger.info(message, metadata);
  }

  error(message: string, error?: any, ...args: any[]) {
    const metadata = args.length > 0 ? { metadata: { data: args } } : undefined;
    this.logger.error(message, error, metadata);
  }

  warn(message: string, ...args: any[]) {
    const metadata = args.length > 0 ? { metadata: { data: args } } : undefined;
    this.logger.warn(message, metadata);
  }

  debug(message: string, ...args: any[]) {
    const metadata = args.length > 0 ? { metadata: { data: args } } : undefined;
    this.logger.debug(message, metadata);
  }
}
