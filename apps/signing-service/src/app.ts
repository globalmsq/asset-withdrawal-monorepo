import express from 'express';

export async function createApp(): Promise<express.Application> {
  const app = express();

  // Health check endpoint for Docker and monitoring
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: 'signing-service',
      timestamp: new Date().toISOString(),
    });
  });

  // 404 handler for any other requests
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: 'signing-service is a background worker service',
    });
  });

  return app;
}
