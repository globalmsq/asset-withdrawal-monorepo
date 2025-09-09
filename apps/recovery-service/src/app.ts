import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Config } from './config';
import { LoggerService } from 'shared';

export async function createApp(
  config: Config,
  logger: LoggerService
): Promise<express.Application> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, res, next) => {
    logger.info('HTTP Request', {
      metadata: {
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
      },
    });
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'recovery-service',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Readiness check endpoint
  app.get('/api/ready', (req, res) => {
    // TODO: Check if Recovery workers are ready
    res.status(200).json({
      status: 'ready',
      service: 'recovery-service',
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics endpoint (if monitoring enabled)
  if (config.monitoring.enableMetrics) {
    app.get('/metrics', (req, res) => {
      // TODO: Implement Prometheus metrics
      res.status(200).send('# Recovery Service Metrics\n# Coming soon...\n');
    });
  }

  // TODO: Mount Recovery management API routes
  // app.use('/api/recovery', recoveryRoutes);

  // Error handling middleware
  app.use(
    (
      error: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      logger.error('Unhandled API error', error, {
        metadata: {
          method: req.method,
          url: req.url,
          userAgent: req.get('User-Agent'),
        },
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  );

  // 404 handler for any other requests
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: 'Recovery Service - endpoint not found',
    });
  });

  return app;
}
