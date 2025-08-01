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

  constructor(config?: Partial<LoggerConfig>);
  constructor(winstonLogger: winston.Logger, config: LoggerConfig, context: LogContext);
  constructor(
    configOrLogger?: Partial<LoggerConfig> | winston.Logger,
    config?: LoggerConfig,
    context?: LogContext
  ) {
    if (configOrLogger && typeof configOrLogger === 'object' && 'info' in configOrLogger && 'error' in configOrLogger) {
      // Private constructor for child loggers
      this.winston = configOrLogger;
      this.config = config!;
      this.context = context!;
    } else {
      // Public constructor
      this.config = {
        ...getDefaultLoggerConfig(configOrLogger?.service || 'default', process.env.NODE_ENV),
        ...configOrLogger,
      };

      this.context = {
        service: this.config.service,
      };

      this.winston = this.createLogger();
    }
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
          const output = `${timestamp} [${level.toUpperCase()}] [${this.config.service}] ${message}${contextStr}`;

          // Remove all ANSI color codes if NO_COLOR is set
          if (process.env.NO_COLOR === 'true') {
            return output.replace(/\x1b\[[0-9;]*m/g, '');
          }

          return output;
        })
      );
    }

    const transports: winston.transport[] = [];

    // Console transport
    if (this.config.enableConsole) {
      // Check if running in Docker or if NO_COLOR env var is set
      const isDocker = process.env.DOCKER === 'true' || fs.existsSync('/.dockerenv');
      const noColor = process.env.NO_COLOR === 'true' || process.env.NODE_ENV === 'production';

      transports.push(
        new winston.transports.Console({
          format: this.config.format === 'simple' && !isDocker && !noColor
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
      levels: winston.config.npm.levels,
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
            for (const key of Object.keys(obj)) {
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
    if (error) {
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
    const childContext = { ...this.context, ...context };

    // Use the private constructor to create a properly initialized child logger
    return new LoggerService(childWinston, this.config, childContext);
  }

  // Get the underlying winston logger (for advanced use cases)
  getWinstonLogger(): winston.Logger {
    return this.winston;
  }
}
