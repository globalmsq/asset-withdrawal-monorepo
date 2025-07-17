import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../services/database';
import { QueueFactory, WithdrawalRequest } from 'shared';

let isReady = false;
let lastHealthCheck = { db: false, sqs: false, timestamp: new Date() };

// Set readiness state
export function setReadiness(ready: boolean) {
  isReady = ready;
}

// Check if all dependencies are healthy
async function checkDependencies(): Promise<{ healthy: boolean; details: any }> {
  const checks = {
    db: false,
    sqs: false,
    timestamp: new Date(),
  };

  // Check database
  try {
    const dbService = getDatabase();
    checks.db = await dbService.healthCheck();
  } catch (error) {
    console.error('Database health check failed:', error);
    checks.db = false;
  }

  // Check SQS queues
  try {
    const txRequestQueue = QueueFactory.createFromEnv<WithdrawalRequest>('tx-request-queue');
    await txRequestQueue.getQueueUrl();
    checks.sqs = true;
  } catch (error) {
    console.error('SQS health check failed:', error);
    checks.sqs = false;
  }

  lastHealthCheck = checks;
  const healthy = checks.db && checks.sqs;

  return {
    healthy,
    details: checks,
  };
}

// Readiness check middleware
export function readinessCheck(req: Request, res: Response, next: NextFunction) {
  // Allow health and readiness endpoints
  if (req.path === '/health' || req.path === '/ready') {
    return next();
  }

  // Check if server is ready
  if (!isReady) {
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Server is not ready to accept requests',
      timestamp: new Date(),
    });
  }

  next();
}

// Readiness endpoint handler
export async function readinessHandler(req: Request, res: Response) {
  const { healthy, details } = await checkDependencies();

  if (healthy) {
    res.status(200).json({
      success: true,
      status: 'ready',
      checks: details,
      timestamp: new Date(),
    });
  } else {
    res.status(503).json({
      success: false,
      status: 'not ready',
      checks: details,
      timestamp: new Date(),
    });
  }
}
