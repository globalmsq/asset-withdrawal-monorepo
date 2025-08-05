import winston from 'winston';
import { Config } from '../config';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '@asset-withdrawal/shared';

export interface AuditLog {
  timestamp: Date;
  action: string;
  userId?: string;
  apiKey?: string;
  transactionId?: string;
  requestId?: string;
  requestData?: any;
  responseData?: any;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  private loggerService: LoggerService;
  private auditLogger: winston.Logger;

  constructor(config: Config) {
    // Ensure log directory exists
    const logDir = path.dirname(config.logging.auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Main application logger using shared LoggerService
    this.loggerService = new LoggerService({
      service: 'signing-service',
      level: config.logging.level,
    });

    // Audit logger for security events
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: config.logging.auditLogPath,
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 10,
          tailable: true,
        }),
      ],
    });
  }

  info(message: string, meta?: any): void {
    this.loggerService.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.loggerService.warn(message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    this.loggerService.error(message, error, meta);
  }

  debug(message: string, meta?: any): void {
    this.loggerService.debug(message, meta);
  }

  audit(log: AuditLog): void {
    this.auditLogger.info('AUDIT', log);

    // Also log to main logger for visibility
    const { timestamp, action, success, error } = log;
    const message = `Audit: ${action}`;
    const context = {
      timestamp,
      success,
      error,
      userId: log.userId,
      transactionId: log.transactionId,
    };

    if (success) {
      this.loggerService.info(message, context);
    } else {
      this.loggerService.warn(message, context);
    }
  }

  auditSuccess(action: string, details: Partial<AuditLog>): void {
    this.audit({
      timestamp: new Date(),
      action,
      success: true,
      ...details,
    });
  }

  auditFailure(
    action: string,
    error: string,
    details: Partial<AuditLog>
  ): void {
    this.audit({
      timestamp: new Date(),
      action,
      success: false,
      error,
      ...details,
    });
  }
}
