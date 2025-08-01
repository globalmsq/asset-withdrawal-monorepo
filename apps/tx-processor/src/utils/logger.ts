import { LoggerService } from '@asset-withdrawal/shared';

export class Logger {
  private logger: LoggerService;

  constructor(private context: string) {
    this.logger = new LoggerService({
      service: `tx-processor:${context}`,
    });
  }

  info(message: string, ...args: any[]) {
    // If args are provided, concatenate them to the message like console.log
    const finalMessage = args.length > 0
      ? [message, ...args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))].join(' ')
      : message;
    this.logger.info(finalMessage);
  }

  error(message: string, error?: any, ...args: any[]) {
    // If additional args are provided, concatenate them to the message
    const finalMessage = args.length > 0
      ? [message, ...args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))].join(' ')
      : message;
    this.logger.error(finalMessage, error);
  }

  warn(message: string, ...args: any[]) {
    // If args are provided, concatenate them to the message like console.log
    const finalMessage = args.length > 0
      ? [message, ...args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))].join(' ')
      : message;
    this.logger.warn(finalMessage);
  }

  debug(message: string, ...args: any[]) {
    // If args are provided, concatenate them to the message like console.log
    const finalMessage = args.length > 0
      ? [message, ...args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg))].join(' ')
      : message;
    this.logger.debug(finalMessage);
  }
}
