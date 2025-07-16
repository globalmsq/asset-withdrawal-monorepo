import winston from 'winston';
import { Config } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditLog {
  timestamp: Date;
  action: string;
  userId?: string;
  apiKey?: string;
  transactionId?: string;
  requestData?: any;
  responseData?: any;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  private winston: winston.Logger;
  private auditLogger: winston.Logger;
  
  constructor(config: Config) {
    // Ensure log directory exists
    const logDir = path.dirname(config.logging.auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Main application logger
    this.winston = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            })
          ),
        }),
      ],
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
    this.winston.info(message, meta);
  }
  
  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }
  
  error(message: string, error?: Error | any, meta?: any): void {
    this.winston.error(message, { error: error?.stack || error, ...meta });
  }
  
  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }
  
  audit(log: AuditLog): void {
    this.auditLogger.info('AUDIT', log);
    
    // Also log to main logger for visibility
    const { timestamp, action, success, error } = log;
    const level = success ? 'info' : 'warn';
    this.winston[level](`Audit: ${action}`, {
      timestamp,
      success,
      error,
      userId: log.userId,
      transactionId: log.transactionId,
    });
  }
  
  auditSuccess(action: string, details: Partial<AuditLog>): void {
    this.audit({
      timestamp: new Date(),
      action,
      success: true,
      ...details,
    });
  }
  
  auditFailure(action: string, error: string, details: Partial<AuditLog>): void {
    this.audit({
      timestamp: new Date(),
      action,
      success: false,
      error,
      ...details,
    });
  }
}