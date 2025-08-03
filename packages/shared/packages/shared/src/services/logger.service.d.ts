import winston from 'winston';
import 'winston-daily-rotate-file';
import { LoggerConfig, LogContext } from '../types/logger.types';
export declare class LoggerService {
    private winston;
    private config;
    private context;
    constructor(config?: Partial<LoggerConfig>);
    constructor(winstonLogger: winston.Logger, config: LoggerConfig, context: LogContext);
    private createLogger;
    private createSensitiveDataFilter;
    private formatContext;
    setContext(context: Partial<LogContext>): void;
    clearContext(...fields: (keyof LogContext)[]): void;
    error(message: string, error?: Error | any, context?: Partial<LogContext>): void;
    warn(message: string, context?: Partial<LogContext>): void;
    info(message: string, context?: Partial<LogContext>): void;
    http(message: string, context?: Partial<LogContext>): void;
    verbose(message: string, context?: Partial<LogContext>): void;
    debug(message: string, context?: Partial<LogContext>): void;
    silly(message: string, context?: Partial<LogContext>): void;
    child(context: Partial<LogContext>): LoggerService;
    getWinstonLogger(): winston.Logger;
}
