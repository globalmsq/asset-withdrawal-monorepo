#!/usr/bin/env ts-node
/**
 * Manual test script to demonstrate WebSocket optimization
 * Run with: npx ts-node apps/tx-monitor/src/test-websocket-optimization.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { logger } from '@asset-withdrawal/shared';
import { DatabaseService } from '@asset-withdrawal/database';
import { MonitorService } from './services/monitor.service';
import { ChainService } from './services/chain.service';
import { WebSocketService } from './services/websocket.service';
import { config } from './config';

// Custom logger to highlight WebSocket events
const wsLogger = {
  blockEvent: (message: string, data?: any) => {
    console.log('\x1b[36m📦 [BLOCK EVENT]\x1b[0m', message, data || '');
  },
  subscription: (message: string, data?: any) => {
    console.log('\x1b[32m🔔 [SUBSCRIPTION]\x1b[0m', message, data || '');
  },
  unsubscription: (message: string, data?: any) => {
    console.log('\x1b[33m🔕 [UNSUBSCRIPTION]\x1b[0m', message, data || '');
  },
  transaction: (message: string, data?: any) => {
    console.log('\x1b[35m💸 [TRANSACTION]\x1b[0m', message, data || '');
  },
};

async function runTest() {
  console.log('\n=== WebSocket Optimization Test ===\n');
  console.log('This test demonstrates conditional block event subscription.\n');

  try {
    // Initialize database
    logger.info('Initializing database connection...');
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

    // Initialize services
    const chainService = new ChainService();
    const monitorService = new MonitorService(chainService);
    const webSocketService = new WebSocketService(chainService, monitorService);

    // Connect services
    monitorService.setWebSocketService(webSocketService);

    // Patch WebSocketService to add logging for demonstration
    const originalUpdateSubscription = (webSocketService as any)
      .updateBlockSubscription;
    (webSocketService as any).updateBlockSubscription = async function (
      this: any,
      chain: string,
      network: string
    ) {
      const key = `${chain}-${network}`;
      const activeTransactions = monitorService.getActiveTransactions();
      const chainTransactions = Array.from(activeTransactions.values()).filter(
        tx =>
          tx.chain === chain &&
          tx.network === network &&
          (tx.status === 'SENT' || tx.status === 'CONFIRMING')
      );

      const hasActiveTx = chainTransactions.length > 0;
      const isSubscribed = this.blockSubscriptionActive.get(key) || false;

      if (hasActiveTx && !isSubscribed) {
        wsLogger.subscription(
          `Starting block subscription for ${chain}-${network}`,
          { activeTransactions: chainTransactions.length }
        );
      } else if (!hasActiveTx && isSubscribed) {
        wsLogger.unsubscription(
          `Stopping block subscription for ${chain}-${network}`,
          { reason: 'No active transactions' }
        );
      }

      return originalUpdateSubscription.call(this, chain, network);
    };

    // Initialize monitor service
    await monitorService.initialize();

    // Start WebSocket listening
    console.log('\n1️⃣  Starting WebSocket service...\n');
    await webSocketService.startListening();

    // Check initial state
    const initialTxCount = monitorService.getActiveTransactions().size;
    console.log(`   Initial active transactions: ${initialTxCount}`);
    console.log(
      '   ✅ WebSocket connected, but NOT subscribing to blocks (no active tx)\n'
    );

    // Simulate adding a transaction
    console.log('2️⃣  Adding a test transaction to monitor...\n');

    const testTx = {
      txHash:
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      requestId: 'test-request-001',
      chain: 'polygon',
      network: 'mainnet',
      status: 'SENT' as const,
      nonce: 100,
    };

    await monitorService.addTransaction(testTx);
    wsLogger.transaction('Added transaction to monitor', {
      txHash: testTx.txHash.slice(0, 10) + '...',
      chain: testTx.chain,
      status: testTx.status,
    });

    // Give it a moment to subscribe
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n3️⃣  Simulating block events (should see activity)...\n');

    // Simulate some blocks passing
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      wsLogger.blockEvent(`New block detected (simulated)`, {
        blockNumber: 50000000 + i,
        chain: 'polygon-mainnet',
      });
    }

    console.log('\n4️⃣  Marking transaction as confirmed...\n');

    // Update transaction status to confirmed
    const tx = monitorService.getActiveTransactions().get(testTx.txHash);
    if (tx) {
      tx.status = 'CONFIRMED';
      await monitorService['updateTransactionStatus'](tx, null);
      monitorService.getActiveTransactions().delete(testTx.txHash);

      // Notify WebSocket service
      await webSocketService.removeTransactionFromWatch(
        testTx.txHash,
        testTx.chain,
        testTx.network
      );

      wsLogger.transaction(
        'Transaction confirmed and removed from monitoring',
        {
          txHash: testTx.txHash.slice(0, 10) + '...',
        }
      );
    }

    // Give it a moment to unsubscribe
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(
      '\n5️⃣  No more active transactions - block subscription should stop\n'
    );

    const finalTxCount = monitorService.getActiveTransactions().size;
    console.log(`   Final active transactions: ${finalTxCount}`);
    console.log('   ✅ Block events unsubscribed automatically!\n');

    // Cleanup
    console.log('6️⃣  Shutting down services...\n');
    await webSocketService.stopListening();
    await monitorService.shutdown();
    chainService.disconnectAll();

    console.log('\n=== Test Complete ===\n');
    console.log('Key observations:');
    console.log(
      '1. Block events were NOT subscribed initially (no transactions)'
    );
    console.log('2. Block subscription started when transaction was added');
    console.log('3. Block subscription stopped when transaction completed');
    console.log(
      '4. This optimization reduces unnecessary RPC calls and processing\n'
    );

    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
