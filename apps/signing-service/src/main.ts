import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { loadConfig } from './config';
import { Logger } from './utils/logger';
import { SecureSecretsManager } from './services/secrets-manager';
import { SigningWorker } from './workers/signing-worker';

async function bootstrap() {
  // Load configuration
  const config = loadConfig();
  
  // Initialize logger
  const logger = new Logger(config);
  logger.info('Starting signing service worker...', { config: { ...config, encryptionKey: '[REDACTED]' } });
  
  // Initialize secrets manager
  const secretsManager = new SecureSecretsManager(config, logger);
  await secretsManager.initialize();
  
  // Initialize signing worker
  const signingWorker = new SigningWorker(config, secretsManager, logger);
  await signingWorker.initialize();
  
  // Start worker
  await signingWorker.start();
  logger.info('Signing worker started successfully');
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    
    // Stop worker
    logger.info('Stopping signing worker...');
    await signingWorker.stop();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  };
  
  // Handle shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection', error);
    shutdown('unhandledRejection');
  });
  
  // Periodic secrets refresh (every hour)
  setInterval(async () => {
    try {
      await secretsManager.refreshSecrets();
      logger.info('Secrets refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh secrets', error);
    }
  }, 60 * 60 * 1000);
}

// Start the application
bootstrap().catch((error) => {
  console.error('Failed to start signing service:', error);
  process.exit(1);
});