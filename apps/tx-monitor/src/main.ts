// Load environment variables first
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import Redis from 'ioredis';
import { logger } from '@asset-withdrawal/shared';
import { DatabaseService } from '@asset-withdrawal/database';
import { MonitorService } from './services/monitor.service';
import { ChainService } from './services/chain.service';
import { WebSocketService } from './services/websocket.service';
import { PollingService } from './services/polling.service';
import { config } from './config';

export class TxMonitorApp {
  private app: express.Application;
  private redis: Redis;
  private pubClient: Redis;
  private monitorService: MonitorService;
  private chainService: ChainService;
  private webSocketService: WebSocketService;
  private pollingService: PollingService;
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.app.use(express.json());

    // Initialize Redis clients
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    this.pubClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    // Initialize services
    this.monitorService = new MonitorService();
    this.chainService = new ChainService();
    this.webSocketService = new WebSocketService(
      this.chainService,
      this.monitorService
    );
    this.pollingService = new PollingService(this.monitorService);

    this.setupRoutes();
    this.setupRedisSubscriptions();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const status = {
        status: this.isRunning ? 'healthy' : 'starting',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          monitor: this.isRunning,
          websocket: this.webSocketService.getConnectionStatus(),
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

  private setupRedisSubscriptions(): void {
    // Subscribe to new transaction notifications
    this.redis.subscribe('new-transactions', err => {
      if (err) {
        logger.error('[Redis] Failed to subscribe to new-transactions:', err);
      } else {
        logger.info('[Redis] Subscribed to new-transactions channel');
      }
    });

    // Handle incoming messages
    this.redis.on('message', async (channel: string, message: string) => {
      try {
        if (channel === 'new-transactions') {
          const data = JSON.parse(message);
          await this.handleNewTransaction(data);
        }
      } catch (error) {
        logger.error('[Redis] Error handling message:', error);
      }
    });

    logger.info('[Redis] Set up Redis subscriptions');
  }

  private async handleNewTransaction(data: {
    txHash: string;
    requestId?: string;
    batchId?: string;
    chain: string;
    network: string;
    nonce: number;
  }): Promise<void> {
    try {
      logger.info(
        `[Redis] Received new transaction for monitoring: ${data.txHash}`
      );

      // Add to monitoring
      await this.monitorService.addTransaction({
        txHash: data.txHash,
        requestId: data.requestId,
        batchId: data.batchId,
        chain: data.chain,
        network: data.network,
        status: 'SENT',
        nonce: data.nonce,
      });

      // Set up WebSocket watch if available
      await this.webSocketService.addTransactionWatch(
        data.txHash,
        data.chain,
        data.network
      );

      // Publish acknowledgment
      await this.pubClient.publish(
        'tx-monitor-ack',
        JSON.stringify({
          txHash: data.txHash,
          status: 'monitoring_started',
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      logger.error('[Redis] Error handling new transaction:', error);
    }
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
    await this.monitorService.shutdown();

    // Disconnect Redis
    this.redis.disconnect();
    this.pubClient.disconnect();

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
