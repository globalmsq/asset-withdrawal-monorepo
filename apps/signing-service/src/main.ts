import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { loadConfig } from './config';
import { Logger } from './utils/logger';
import { SecureSecretsManager } from './services/secrets-manager';
import { SigningWorker } from './workers/signing-worker';
import { DatabaseService } from '@asset-withdrawal/database';
import { QueueRecoveryService } from './services/queue-recovery.service';
import { NonceCacheService } from './services/nonce-cache.service';
import { ChainProviderFactory, ChainName, ChainNetwork } from '@asset-withdrawal/shared';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load chains config from file
const chainsConfigPath = join(__dirname, '../../../packages/shared/src/config/chains.config.json');
const chainsConfig = JSON.parse(readFileSync(chainsConfigPath, 'utf8'));

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

  // Initialize queue recovery service - after database is initialized
  const queueRecoveryService = new QueueRecoveryService(nonceCacheService);

  // Initialize signing worker
  const signingWorker = new SigningWorker(config, secretsManager, logger);
  await signingWorker.initialize();

  // Perform queue recovery on startup
  logger.info('Performing queue recovery on startup...');
  try {
    await queueRecoveryService.recoverQueuesOnStartup();
    logger.info('Queue recovery completed successfully');
  } catch (error) {
    logger.error('Queue recovery failed, but continuing startup:', error);
  }

  // Sync nonce with blockchain
  logger.info('Synchronizing nonce with blockchain...');
  try {
    const signerAddress = await secretsManager.getSignerAddress();

    // Get chains based on environment
    const chains: { chain: string; network: string }[] = [];

    for (const [chainName, networks] of Object.entries(chainsConfig)) {
      if (config.nodeEnv === 'development' && chainName !== 'localhost') {
        continue;
      }

      for (const networkName of Object.keys(networks)) {
        chains.push({ chain: chainName, network: networkName });
      }
    }

    logger.info(`Found ${chains.length} chain/network combinations for nonce sync`, { chains });

    await queueRecoveryService.syncNonceWithBlockchain(signerAddress, chains);
    logger.info('Nonce synchronization completed');
  } catch (error) {
    logger.error('Nonce synchronization failed, but continuing startup:', error);
  }

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
  console.error('Failed to start signing service:', error);
  process.exit(1);
});
