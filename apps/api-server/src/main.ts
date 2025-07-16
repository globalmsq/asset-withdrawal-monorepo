// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import app from './app';
import { config } from './config';
import { initializeDatabase } from './services/database';

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
  // Initialize database with configuration
  const dbService = await initializeDatabase(config.mysql);

  // Connect to database (skip in development if no database available)
  if (config.nodeEnv === 'production') {
    await connectWithRetry(dbService);
  } else {
    console.log('Development mode: Skipping database connection');
    console.log('Database service initialized with mock configuration');
  }

  const server = app.listen(config.port, () => {
    console.log(`API Server running on port ${config.port}`);
    const displayUrl = 'localhost';
    console.log(
      `API Documentation available at http://${displayUrl}:${config.port}/api-docs`
    );
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
