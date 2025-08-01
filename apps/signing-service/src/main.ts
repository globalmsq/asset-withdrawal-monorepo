import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { loadConfig } from './config';
import { Logger } from './utils/logger';
import { SecureSecretsManager } from './services/secrets-manager';
import { SigningWorker } from './workers/signing-worker';
import { DatabaseService } from '@asset-withdrawal/database';
import { NonceCacheService } from './services/nonce-cache.service';

async function bootstrap() {
  // Load configuration
  const config = loadConfig();

  // Initialize logger
  const logger = new Logger(config);
  logger.info('Starting signing service worker...', {
    config: { ...config, encryptionKey: '[REDACTED]', database: { ...config.database, password: '[REDACTED]' } },
  });

  // Initialize secrets manager
  const secretsManager = new SecureSecretsManager(config, logger);
  await secretsManager.initialize();

  // Initialize database first
  logger.info('Initializing database connection...');
  const dbService = DatabaseService.getInstance(config.database);
  const dbHealthy = await dbService.healthCheck();
  if (!dbHealthy) {
    throw new Error('Database health check failed');
  }
  logger.info('Database connection healthy');

  // Initialize nonce cache service
  const nonceCacheService = new NonceCacheService(undefined, logger);

  // Initialize signing worker
  const signingWorker = new SigningWorker(config, secretsManager, logger);
  await signingWorker.initialize();

  // Add a small delay to ensure all services are fully initialized
  logger.info('Waiting for all services to be ready...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Start worker with delayed first batch to avoid processing messages too early
  await signingWorker.start(true);
  logger.info('Signing worker started successfully with delayed first batch');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Stop accepting new work immediately
      logger.info('Stopping signing worker...');
      await signingWorker.stop();

      // Give a final grace period for any remaining operations
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

  // Periodic secrets refresh (every hour)
  setInterval(
    async () => {
      try {
        await secretsManager.refreshSecrets();
        logger.info('Secrets refreshed successfully');
      } catch (error) {
        logger.error('Failed to refresh secrets', error);
      }
    },
    60 * 60 * 1000
  );
}

// Start the application
bootstrap().catch(error => {
  // Can't create logger without config, use console.error
  console.error('Failed to start signing service:', error);
  process.exit(1);
});
