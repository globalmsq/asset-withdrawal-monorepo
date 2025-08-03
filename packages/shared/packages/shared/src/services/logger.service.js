"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerService = void 0;
const tslib_1 = require("tslib");
const winston_1 = tslib_1.__importDefault(require("winston"));
require("winston-daily-rotate-file");
const path_1 = tslib_1.__importDefault(require("path"));
const fs_1 = tslib_1.__importDefault(require("fs"));
const logger_config_1 = require("../config/logger.config");
class LoggerService {
    winston;
    config;
    context;
    constructor(configOrLogger, config, context) {
        if (configOrLogger &&
            typeof configOrLogger === 'object' &&
            'info' in configOrLogger &&
            'error' in configOrLogger) {
            // Private constructor for child loggers
            this.winston = configOrLogger;
            this.config = config;
            this.context = context;
        }
        else {
            // Public constructor
            this.config = {
                ...(0, logger_config_1.getDefaultLoggerConfig)(configOrLogger?.service || 'default', process.env.NODE_ENV),
                ...configOrLogger,
            };
            this.context = {
                service: this.config.service,
            };
            this.winston = this.createLogger();
        }
    }
    createLogger() {
        const formats = [
            winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            winston_1.default.format.errors({ stack: true }),
            this.createSensitiveDataFilter(),
        ];
        if (this.config.format === 'json') {
            formats.push(winston_1.default.format.json());
        }
        else {
            formats.push(winston_1.default.format.printf(({ timestamp, level, message, ...meta }) => {
                const contextStr = this.formatContext(meta);
                const output = `${timestamp} [${level.toUpperCase()}] [${this.config.service}] ${message}${contextStr}`;
                // Remove all ANSI color codes if NO_COLOR is set
                if (process.env.NO_COLOR === 'true') {
                    return output.replace(/\x1b\[[0-9;]*m/g, '');
                }
                return output;
            }));
        }
        const transports = [];
        // Console transport
        if (this.config.enableConsole) {
            // Check if running in Docker or if NO_COLOR env var is set
            const isDocker = process.env.DOCKER === 'true' || fs_1.default.existsSync('/.dockerenv');
            const noColor = process.env.NO_COLOR === 'true' ||
                process.env.NODE_ENV === 'production';
            transports.push(new winston_1.default.transports.Console({
                format: this.config.format === 'simple' && !isDocker && !noColor
                    ? winston_1.default.format.combine(winston_1.default.format.colorize(), ...formats)
                    : winston_1.default.format.combine(...formats),
            }));
        }
        // File transport with rotation
        if (this.config.enableFile && this.config.filePath) {
            // Ensure log directory exists
            const logDir = path_1.default.resolve(this.config.filePath);
            if (!fs_1.default.existsSync(logDir)) {
                fs_1.default.mkdirSync(logDir, { recursive: true });
            }
            // Combined log file
            transports.push(new winston_1.default.transports.DailyRotateFile({
                filename: path_1.default.join(logDir, `${this.config.service}-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                maxSize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                format: winston_1.default.format.combine(...formats),
            }));
            // Error log file
            transports.push(new winston_1.default.transports.DailyRotateFile({
                filename: path_1.default.join(logDir, `${this.config.service}-error-%DATE%.log`),
                datePattern: 'YYYY-MM-DD',
                level: 'error',
                maxSize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                format: winston_1.default.format.combine(...formats),
            }));
        }
        return winston_1.default.createLogger({
            level: this.config.level,
            levels: winston_1.default.config.npm.levels,
            transports,
        });
    }
    createSensitiveDataFilter() {
        return {
            transform: (info) => {
                let message = info.message;
                let metadata = { ...info };
                // Filter sensitive data from message
                if (typeof message === 'string') {
                    logger_config_1.SENSITIVE_PATTERNS.forEach(pattern => {
                        message = message.replace(pattern, logger_config_1.SENSITIVE_REPLACEMENT);
                    });
                }
                // Filter sensitive data from metadata
                const filterObject = (obj) => {
                    if (typeof obj === 'string') {
                        let filtered = obj;
                        logger_config_1.SENSITIVE_PATTERNS.forEach(pattern => {
                            filtered = filtered.replace(pattern, logger_config_1.SENSITIVE_REPLACEMENT);
                        });
                        return filtered;
                    }
                    else if (typeof obj === 'bigint') {
                        // Convert BigInt to string for safe serialization
                        return obj.toString();
                    }
                    else if (Array.isArray(obj)) {
                        return obj.map(filterObject);
                    }
                    else if (obj && typeof obj === 'object') {
                        const filtered = {};
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
    formatContext(meta) {
        const relevantMeta = { ...this.context, ...meta };
        delete relevantMeta.timestamp;
        delete relevantMeta.level;
        delete relevantMeta.message;
        delete relevantMeta.service;
        if (Object.keys(relevantMeta).length === 0) {
            return '';
        }
        // Handle BigInt serialization
        const replacer = (key, value) => {
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        };
        return ` ${JSON.stringify(relevantMeta, replacer)}`;
    }
    // Set context for all subsequent logs
    setContext(context) {
        this.context = {
            ...this.context,
            ...context,
        };
    }
    // Clear specific context fields
    clearContext(...fields) {
        fields.forEach(field => {
            delete this.context[field];
        });
    }
    // Logging methods
    error(message, error, context) {
        const meta = { ...this.context, ...context };
        if (error) {
            this.winston.error(message, { ...meta, error });
        }
        else {
            this.winston.error(message, meta);
        }
    }
    warn(message, context) {
        this.winston.warn(message, { ...this.context, ...context });
    }
    info(message, context) {
        this.winston.info(message, { ...this.context, ...context });
    }
    http(message, context) {
        this.winston.http(message, { ...this.context, ...context });
    }
    verbose(message, context) {
        this.winston.verbose(message, { ...this.context, ...context });
    }
    debug(message, context) {
        this.winston.debug(message, { ...this.context, ...context });
    }
    silly(message, context) {
        this.winston.silly(message, { ...this.context, ...context });
    }
    // Create a child logger with additional context
    child(context) {
        // Create a wrapper around winston's child logger
        const childWinston = this.winston.child({ ...this.context, ...context });
        const childContext = { ...this.context, ...context };
        // Use the private constructor to create a properly initialized child logger
        return new LoggerService(childWinston, this.config, childContext);
    }
    // Get the underlying winston logger (for advanced use cases)
    getWinstonLogger() {
        return this.winston;
    }
}
exports.LoggerService = LoggerService;
//# sourceMappingURL=logger.service.js.map