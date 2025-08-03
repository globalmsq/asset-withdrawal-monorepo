// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import app from './app';
import { config } from './config';
import { initializeDatabase } from './services/database';
import { initializeUserService } from './services/user.service';
import { QueueFactory, IQueue, WithdrawalRequest } from '@asset-withdrawal/shared';
import { setReadiness } from './middleware/readiness.middleware';
import { Logger } from './utils/logger';

const logger = new Logger('ApiServer');

async function connectWithRetry(dbService: any, maxRetries = 10, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await dbService.connect();
      logger.info('Database connected successfully');
      return;
    } catch (error) {
      logger.warn(
        `Database connection attempt ${i + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : String(error)
      );

      if (i === maxRetries - 1) {
        logger.error('Failed to connect to database after maximum retries');
        process.exit(1);
      }

      logger.info(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function startServer() {
  logger.info('Starting API server initialization...');

  // Initialize database with configuration
  const dbService = await initializeDatabase(config.mysql);

  // Connect to database
  try {
    await connectWithRetry(dbService);
    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('Database health check passed');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }

  // Initialize UserService
  try {
    await initializeUserService();
    logger.info('UserService initialized successfully');
  } catch (error) {
    logger.error('UserService initialization failed:', error);
    process.exit(1);
  }

  // Initialize and test SQS queues
  logger.info('Initializing SQS queues...');
  try {
    const txRequestQueue =
      QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');
    const signedTxQueue = QueueFactory.createFromEnv('signed-tx-queue');

    // Test queue connectivity
    await txRequestQueue.getQueueUrl();
    await signedTxQueue.getQueueUrl();
    logger.info('SQS queues initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize SQS queues:', error);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    } else {
      logger.warn('Continuing without SQS in development mode');
    }
  }

  // All dependencies ready, start listening
  logger.info('All dependencies ready, starting HTTP server...');

  // Set readiness to true
  setReadiness(true);

  const server = app.listen(config.port, () => {
    logger.info(`API Server running on port ${config.port}`);
    const displayUrl = 'localhost';
    logger.info(
      `API Documentation available at http://${displayUrl}:${config.port}/api-docs`
    );
    logger.info(
      `Readiness check available at http://${displayUrl}:${config.port}/ready`
    );
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    logger.info('Shutting down gracefully...');
    server.close(async () => {
      try {
        await dbService.disconnect();
        logger.info('Database disconnected');
      } catch (error) {
        logger.error('Error disconnecting database:', error);
      }
      logger.info('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
