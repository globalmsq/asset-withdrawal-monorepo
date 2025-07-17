// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import app from './app';
import { config } from './config';
import { initializeDatabase } from './services/database';
import { QueueFactory, IQueue, WithdrawalRequest } from 'shared';
import { setReadiness } from './middleware/readiness.middleware';

async function connectWithRetry(dbService: any, maxRetries = 10, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await dbService.connect();
      console.log('Database connected successfully');
      return;
    } catch (error) {
      console.log(
        `Database connection attempt ${i + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : String(error)
      );

      if (i === maxRetries - 1) {
        console.error('Failed to connect to database after maximum retries');
        process.exit(1);
      }

      console.log(`Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function startServer() {
  console.log('Starting API server initialization...');

  // Initialize database with configuration
  const dbService = await initializeDatabase(config.mysql);

  // Connect to database
  try {
    await connectWithRetry(dbService);
    const dbHealthy = await dbService.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('Database health check passed');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }

  // Initialize and test SQS queues
  console.log('Initializing SQS queues...');
  try {
    const txRequestQueue = QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');
    const signedTxQueue = QueueFactory.createFromEnv('signed-tx-queue');

    // Test queue connectivity
    await txRequestQueue.getQueueUrl();
    await signedTxQueue.getQueueUrl();
    console.log('SQS queues initialized successfully');
  } catch (error) {
    console.error('Failed to initialize SQS queues:', error);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    } else {
      console.warn('Continuing without SQS in development mode');
    }
  }

  // All dependencies ready, start listening
  console.log('All dependencies ready, starting HTTP server...');

  // Set readiness to true
  setReadiness(true);

  const server = app.listen(config.port, () => {
    console.log(`API Server running on port ${config.port}`);
    const displayUrl = 'localhost';
    console.log(
      `API Documentation available at http://${displayUrl}:${config.port}/api-docs`
    );
    console.log(`Readiness check available at http://${displayUrl}:${config.port}/ready`);
  });

  // Graceful shutdown
  const gracefulShutdown = async () => {
    console.log('Shutting down gracefully...');
    server.close(async () => {
      try {
        await dbService.disconnect();
        console.log('Database disconnected');
      } catch (error) {
        console.error('Error disconnecting database:', error);
      }
      console.log('Server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
