import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { createApp } from './app';
import { loadConfig } from './config';
import { LoggerService } from 'shared';
import { DatabaseService } from '@asset-withdrawal/database';

async function bootstrap() {
  // Load configuration
  const config = loadConfig();

  // Initialize logger
  const logger = new LoggerService({
    service: 'recovery-service',
    level: config.logging.level,
  });
  logger.info('Starting Recovery Service...', {
    metadata: {
      config: {
        ...config,
        database: { ...config.database, password: '[REDACTED]' },
      },
    },
  });

  // Initialize database connection
  logger.info('Initializing database connection...');
  const dbService = DatabaseService.getInstance(config.database);
  const dbHealthy = await dbService.healthCheck();
  if (!dbHealthy) {
    throw new Error('Database health check failed');
  }
  logger.info('Database connection healthy');

  // Create Express app
  const app = await createApp(config, logger);

  // Start HTTP server
  const server = app.listen(config.port, () => {
    logger.info('Recovery Service server started', {
      metadata: {
        port: config.port,
        url: `http://localhost:${config.port}`,
        environment: config.nodeEnv,
      },
    });
  });

  // TODO: Initialize Recovery workers here
  // const recoveryWorker = new RecoveryWorker(config, logger);
  // await recoveryWorker.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // TODO: Stop Recovery workers
      // await recoveryWorker.stop();

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
      });

      // Give a final grace period
      logger.info('Waiting for final cleanup...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', error => {
    logger.error('Unhandled rejection', error);
    shutdown('unhandledRejection');
  });
}

// Start the application
bootstrap().catch(error => {
  console.error('Failed to start Recovery Service:', error);
  process.exit(1);
});
