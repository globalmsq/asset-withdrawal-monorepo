import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { LoggerConfig, LogContext, LogLevel } from '../types/logger.types';
import { getDefaultLoggerConfig, SENSITIVE_PATTERNS, SENSITIVE_REPLACEMENT } from '../config/logger.config';

export class LoggerService {
  private winston: winston.Logger;
  private config: LoggerConfig;
  private context: LogContext;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      ...getDefaultLoggerConfig(config?.service || 'default', process.env.NODE_ENV),
      ...config,
    };

    this.context = {
      service: this.config.service,
    };

    this.winston = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const formats: winston.Logform.Format[] = [
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      this.createSensitiveDataFilter(),
    ];

    if (this.config.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const contextStr = this.formatContext(meta);
          return `${timestamp} [${level.toUpperCase()}] [${this.config.service}] ${message}${contextStr}`;
        })
      );
    }

    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: this.config.format === 'simple'
            ? winston.format.combine(
              winston.format.colorize(),
              ...formats
            )
            : winston.format.combine(...formats),
        })
      );
    }

    // File transport with rotation
    if (this.config.enableFile && this.config.filePath) {
      // Ensure log directory exists
      const logDir = path.resolve(this.config.filePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Combined log file
      transports.push(
        new (winston.transports as any).DailyRotateFile({
          filename: path.join(logDir, `${this.config.service}-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          maxSize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles,
          format: winston.format.combine(...formats),
        })
      );

      // Error log file
      transports.push(
        new (winston.transports as any).DailyRotateFile({
          filename: path.join(logDir, `${this.config.service}-error-%DATE%.log`),
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: this.config.maxFileSize,
          maxFiles: this.config.maxFiles,
          format: winston.format.combine(...formats),
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      transports,
    });
  }

  private createSensitiveDataFilter(): winston.Logform.Format {
    return {
      transform: (info: winston.Logform.TransformableInfo) => {
        let message = info.message;
        let metadata = { ...info };

        // Filter sensitive data from message
        if (typeof message === 'string') {
          SENSITIVE_PATTERNS.forEach((pattern) => {
            message = (message as string).replace(pattern, SENSITIVE_REPLACEMENT);
          });
        }

        // Filter sensitive data from metadata
        const filterObject = (obj: any): any => {
          if (typeof obj === 'string') {
            let filtered = obj;
            SENSITIVE_PATTERNS.forEach((pattern) => {
              filtered = filtered.replace(pattern, SENSITIVE_REPLACEMENT);
            });
            return filtered;
          } else if (typeof obj === 'bigint') {
            // Convert BigInt to string for safe serialization
            return obj.toString();
          } else if (Array.isArray(obj)) {
            return obj.map(filterObject);
          } else if (obj && typeof obj === 'object') {
            const filtered: any = {};
            for (const key in obj) {
              filtered[key] = filterObject(obj[key]);
            }
            return filtered;
          }
          return obj;
        };

        metadata = filterObject(metadata);

        return {
          ...metadata,
          message,
        };
      },
    };
  }

  private formatContext(meta: any): string {
    const relevantMeta = { ...this.context, ...meta };
    delete relevantMeta.timestamp;
    delete relevantMeta.level;
    delete relevantMeta.message;
    delete relevantMeta.service;

    if (Object.keys(relevantMeta).length === 0) {
      return '';
    }

    // Handle BigInt serialization
    const replacer = (key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };

    return ` ${JSON.stringify(relevantMeta, replacer)}`;
  }

  // Set context for all subsequent logs
  setContext(context: Partial<LogContext>): void {
    this.context = {
      ...this.context,
      ...context,
    };
  }

  // Clear specific context fields
  clearContext(...fields: (keyof LogContext)[]): void {
    fields.forEach((field) => {
      delete this.context[field];
    });
  }

  // Logging methods
  error(message: string, error?: Error | any, context?: Partial<LogContext>): void {
    const meta = { ...this.context, ...context };
    if (error instanceof Error) {
      this.winston.error(message, { ...meta, error: error.message, stack: error.stack });
    } else if (error) {
      this.winston.error(message, { ...meta, error });
    } else {
      this.winston.error(message, meta);
    }
  }

  warn(message: string, context?: Partial<LogContext>): void {
    this.winston.warn(message, { ...this.context, ...context });
  }

  info(message: string, context?: Partial<LogContext>): void {
    this.winston.info(message, { ...this.context, ...context });
  }

  http(message: string, context?: Partial<LogContext>): void {
    this.winston.http(message, { ...this.context, ...context });
  }

  verbose(message: string, context?: Partial<LogContext>): void {
    this.winston.verbose(message, { ...this.context, ...context });
  }

  debug(message: string, context?: Partial<LogContext>): void {
    this.winston.debug(message, { ...this.context, ...context });
  }

  silly(message: string, context?: Partial<LogContext>): void {
    this.winston.silly(message, { ...this.context, ...context });
  }

  // Create a child logger with additional context
  child(context: Partial<LogContext>): LoggerService {
    // Create a wrapper around winston's child logger
    const childWinston = this.winston.child({ ...this.context, ...context });

    // Create a new LoggerService instance that wraps the child winston logger
    const childLogger = Object.create(LoggerService.prototype);
    childLogger.winston = childWinston;
    childLogger.config = this.config;
    childLogger.context = { ...this.context, ...context };

    return childLogger;
  }

  // Get the underlying winston logger (for advanced use cases)
  getWinstonLogger(): winston.Logger {
    return this.winston;
  }
}
