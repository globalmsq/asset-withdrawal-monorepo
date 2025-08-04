import { createApp } from './app';
import { startWorker } from './worker/sqs-worker';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3003;

async function bootstrap() {
  try {
    // Start HTTP server for health checks
    const app = await createApp();
    const server = app.listen(port, host, () => {
      console.log(
        `[tx-broadcaster] Health server ready at http://${host}:${port}`
      );
    });

    // Start SQS worker
    console.log('[tx-broadcaster] Starting SQS worker...');
    await startWorker();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(
        `[tx-broadcaster] Received ${signal}, shutting down gracefully...`
      );
      server.close(() => {
        console.log('[tx-broadcaster] HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[tx-broadcaster] Failed to start service:', error);
    process.exit(1);
  }
}

bootstrap();
