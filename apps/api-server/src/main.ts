import app from './app';
import { loadConfig } from './config';
import { initializeDatabase } from './services/database';

async function startServer() {
  const config = loadConfig();

  // Initialize database with configuration
  const dbService = await initializeDatabase(config.database);

  // Connect to database (skip in development if no database available)
  if (config.nodeEnv === 'production') {
    try {
      await dbService.connect();
      console.log('Database connected successfully');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      process.exit(1);
    }
  } else {
    console.log('Development mode: Skipping database connection');
    console.log('Database service initialized with mock configuration');
  }

  const server = app.listen(config.port, config.host, () => {
    console.log(`API Server running on ${config.host}:${config.port}`);
    const displayUrl = config.host === '0.0.0.0' ? 'localhost' : config.host;
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
