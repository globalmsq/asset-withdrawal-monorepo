import express from 'express';
import { Logger } from './utils/logger';
import { TransactionMonitor } from './services/transaction-monitor';
import { config } from './config';

const logger = new Logger('TxMonitor');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  const monitor = TransactionMonitor.getInstance();
  const status = await monitor.getStatus();
  
  res.status(status.isRunning ? 200 : 503).json({
    status: status.isRunning ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    ...status,
  });
});

// Status endpoint
app.get('/status', async (req, res) => {
  const monitor = TransactionMonitor.getInstance();
  res.json(await monitor.getStatus());
});

// Control endpoints (for development/debugging)
app.post('/monitor/start', async (req, res) => {
  try {
    const monitor = TransactionMonitor.getInstance();
    await monitor.start();
    res.json({ message: 'Monitor started' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/monitor/stop', async (req, res) => {
  try {
    const monitor = TransactionMonitor.getInstance();
    await monitor.stop();
    res.json({ message: 'Monitor stopped' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

async function startServer() {
  const host = config.host;
  const port = config.port;

  // Initialize and start monitor
  const monitor = TransactionMonitor.getInstance();
  await monitor.initialize();

  app.listen(port, host, () => {
    logger.info(`TX Monitor started at http://${host}:${port}`);
    logger.info(`Health check available at http://${host}:${port}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await monitor.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await monitor.shutdown();
    process.exit(0);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start TX Monitor', error);
  process.exit(1);
});