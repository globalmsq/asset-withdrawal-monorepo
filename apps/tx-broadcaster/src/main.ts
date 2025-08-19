// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { createApp } from './app';
import { startWorker } from './worker/sqs-worker';
import { loadConfig } from './config';
import { DatabaseService } from '@asset-withdrawal/database';
import { LoggerService } from '@asset-withdrawal/shared';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3003;

async function bootstrap() {
  // Load configuration first for logger setup
  const config = loadConfig();
  const logger = new LoggerService({ service: 'tx-broadcaster:main' });

  try {
    logger.info('Starting tx-broadcaster service...', {
      metadata: {
        nodeEnv: config.NODE_ENV,
        logLevel: config.LOG_LEVEL,
      },
    });

    // Initialize database first
    logger.info('Initializing database connection...', {
      metadata: {
        host: config.MYSQL_HOST,
        port: config.MYSQL_PORT,
        database: config.MYSQL_DATABASE,
      },
    });

    const dbService = DatabaseService.getInstance({
      host: config.MYSQL_HOST,
      port: config.MYSQL_PORT,
      database: config.MYSQL_DATABASE,
      user: config.MYSQL_USER,
      password: config.MYSQL_PASSWORD,
    });

    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('Database connection established successfully');

    // Start HTTP server for health checks
    const app = await createApp();
    const server = app.listen(port, host, () => {
      logger.info('Health server started', {
        metadata: {
          host,
          port,
          url: `http://${host}:${port}`,
        },
      });
    });

    // Start SQS worker
    logger.info('Starting SQS worker...');
    await startWorker();
    logger.info('tx-broadcaster service started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info('Graceful shutdown initiated', { metadata: { signal } });

      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start tx-broadcaster service', error, {
      metadata: {
        nodeEnv: config.NODE_ENV,
      },
    });
    process.exit(1);
  }
}

bootstrap();
