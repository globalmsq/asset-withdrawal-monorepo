// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import { logger } from '@asset-withdrawal/shared';
import { DatabaseService } from '@asset-withdrawal/database';
import { MonitorService } from './services/monitor.service';
import { ChainService } from './services/chain.service';
import { WebSocketService } from './services/websocket.service';
import { PollingService } from './services/polling.service';
import { SQSWorker } from './worker/sqs-worker';
import { config } from './config';

export class TxMonitorApp {
  private app: express.Application;
  private monitorService: MonitorService;
  private chainService: ChainService;
  private webSocketService: WebSocketService;
  private pollingService: PollingService;
  private sqsWorker: SQSWorker;
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.app.use(express.json());

    // Initialize services - share ChainService instance
    this.chainService = new ChainService();
    this.monitorService = new MonitorService(this.chainService);
    this.webSocketService = new WebSocketService(
      this.chainService,
      this.monitorService
    );
    // Set WebSocketService reference in MonitorService (to avoid circular dependency)
    this.monitorService.setWebSocketService(this.webSocketService);
    this.pollingService = new PollingService(this.monitorService);
    this.sqsWorker = new SQSWorker(this.monitorService, this.webSocketService);

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      // Get WebSocket connection status
      const wsConnectionStatus = this.webSocketService.getConnectionStatus();
      const wsDetailedStatus: any = {};

      // Simple connection status
      for (const [key, isConnected] of wsConnectionStatus.entries()) {
        wsDetailedStatus[key] = {
          connected: isConnected,
        };
      }

      const status = {
        status: this.isRunning ? 'healthy' : 'starting',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          monitor: this.isRunning,
          websocket: {
            connections: wsDetailedStatus,
            summary: {
              total: wsConnectionStatus.size,
              connected: Array.from(wsConnectionStatus.values()).filter(v => v)
                .length,
              disconnected: Array.from(wsConnectionStatus.values()).filter(
                v => !v
              ).length,
            },
          },
          polling: this.pollingService.getPollingStatus(),
        },
      };
      res.json(status);
    });

    // Get monitoring status
    this.app.get('/status', (req, res) => {
      const activeTransactions = this.monitorService.getActiveTransactions();
      const pollingStatus = this.pollingService.getPollingStatus();
      const tierStats = this.pollingService.getTierStats();

      res.json({
        activeTransactions: activeTransactions.size,
        transactions: Array.from(activeTransactions.values()).map(tx => ({
          txHash: tx.txHash,
          chain: tx.chain,
          network: tx.network,
          status: tx.status,
          confirmations: tx.confirmations,
          lastChecked: tx.lastChecked,
        })),
        polling: pollingStatus,
        tierStats: Array.from(tierStats.entries()).map(([name, stats]) => ({
          tier: name,
          ...stats,
        })),
      });
    });

    // Manual transaction check
    this.app.post('/check/:txHash', async (req, res) => {
      try {
        const { txHash } = req.params;
        const result = await this.monitorService.checkTransaction(txHash);

        if (result) {
          res.json({ success: true, transaction: result });
        } else {
          res
            .status(404)
            .json({ success: false, error: 'Transaction not found' });
        }
      } catch (error) {
        logger.error('[API] Error checking transaction:', error);
        res
          .status(500)
          .json({ success: false, error: 'Internal server error' });
      }
    });

    // Force poll a specific tier
    this.app.post('/poll/:tier', async (req, res) => {
      try {
        const { tier } = req.params;
        if (!['fast', 'medium', 'full'].includes(tier)) {
          return res
            .status(400)
            .json({ success: false, error: 'Invalid tier' });
        }

        await this.pollingService.forcePoll(tier as any);
        res.json({ success: true, message: `Force polled ${tier} tier` });
      } catch (error) {
        logger.error('[API] Error force polling:', error);
        res
          .status(500)
          .json({ success: false, error: 'Internal server error' });
      }
    });
  }

  async start(): Promise<void> {
    try {
      logger.info('[tx-monitor] Starting transaction monitor service...');

      // Initialize database connection
      logger.info('[tx-monitor] Initializing database connection...');

      const dbService = DatabaseService.getInstance({
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
      });

      const dbHealthy = await dbService.healthCheck();
      if (!dbHealthy) {
        throw new Error('Database health check failed');
      }
      logger.info('[tx-monitor] Database connection established successfully');

      // Initialize monitor service
      await this.monitorService.initialize();

      // Start WebSocket monitoring
      await this.webSocketService.startListening();

      // Start polling service
      await this.pollingService.startPolling();

      // Start SQS worker for broadcast-tx-queue
      await this.sqsWorker.start();

      // Start Express server
      const port = config.port;
      this.app.listen(port, () => {
        logger.info(`[tx-monitor] Server running on port ${port}`);
      });

      this.isRunning = true;
      logger.info(
        '[tx-monitor] Transaction monitor service started successfully'
      );
    } catch (error) {
      logger.error('[tx-monitor] Failed to start service:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('[tx-monitor] Shutting down transaction monitor service...');

    this.isRunning = false;

    // Stop services
    await this.webSocketService.stopListening();
    await this.pollingService.stopPolling();
    await this.sqsWorker.stop();
    await this.monitorService.shutdown();

    // Disconnect blockchain providers
    this.chainService.disconnectAll();

    logger.info('[tx-monitor] Service shut down complete');
  }
}

// Main entry point
async function main() {
  const app = new TxMonitorApp();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('[tx-monitor] Received SIGINT, shutting down...');
    await app.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('[tx-monitor] Received SIGTERM, shutting down...');
    await app.shutdown();
    process.exit(0);
  });

  // Start the application
  try {
    await app.start();
  } catch (error) {
    logger.error('[tx-monitor] Fatal error:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(error => {
    logger.error('[tx-monitor] Unhandled error:', error);
    process.exit(1);
  });
}

export default TxMonitorApp;
