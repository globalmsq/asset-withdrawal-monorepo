import express from 'express';
import { Logger } from './utils/logger';
import { WorkerManager } from './services/worker-manager';
import { config } from './config';

const logger = new Logger('TxProcessor');

const app = express();
app.use(express.json());

// Health check endpoints
app.get('/health', (req, res) => {
  const workerManager = WorkerManager.getInstance();
  const status = workerManager.getStatus();

  const isHealthy = status.workers.every(
    w => w.status === 'running' || w.status === 'stopped'
  );

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    workers: status.workers,
  });
});

app.get('/status', (req, res) => {
  const workerManager = WorkerManager.getInstance();
  res.json(workerManager.getStatus());
});

// Worker control endpoints (for development/debugging)
app.post('/workers/:name/start', async (req, res) => {
  try {
    const workerManager = WorkerManager.getInstance();
    await workerManager.startWorker(req.params.name);
    res.json({ message: `Worker ${req.params.name} started` });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/workers/:name/stop', async (req, res) => {
  try {
    const workerManager = WorkerManager.getInstance();
    await workerManager.stopWorker(req.params.name);
    res.json({ message: `Worker ${req.params.name} stopped` });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function startServer() {
  const host = config.host;
  const port = config.port;

  // Initialize and start workers
  const workerManager = WorkerManager.getInstance();
  await workerManager.initialize();

  app.listen(port, host, () => {
    logger.info(`TX Processor started at http://${host}:${port}`);
    logger.info(`Health check available at http://${host}:${port}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await workerManager.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await workerManager.shutdown();
    process.exit(0);
  });
}

startServer().catch(error => {
  logger.error('Failed to start TX Processor', error);
  process.exit(1);
});
