/**
 * Test script to verify transaction status updates are working correctly
 * This script simulates adding a new transaction and monitors its status changes
 */

import { MonitorService } from './src/services/monitor.service';
import { ChainService } from './src/services/chain.service';
import { WebSocketService } from './src/services/websocket.service';
import { PollingService } from './src/services/polling.service';
import { logger } from '@asset-withdrawal/shared';

async function testTransactionMonitoring() {
  logger.info('🧪 Starting transaction monitoring test...');

  // Initialize services
  const chainService = new ChainService();
  const monitorService = new MonitorService(chainService);
  const webSocketService = new WebSocketService(chainService, monitorService);
  const pollingService = new PollingService(monitorService);

  // Set up WebSocket service reference
  monitorService.setWebSocketService(webSocketService);

  try {
    // Initialize monitor service
    await monitorService.initialize();
    logger.info('✅ Monitor service initialized');

    // Start WebSocket listening
    await webSocketService.startListening();
    logger.info('✅ WebSocket service started');

    // Start polling
    await pollingService.startPolling();
    logger.info('✅ Polling service started');

    // Simulate adding a new transaction
    const testTxHash = '0x' + '1234567890abcdef'.repeat(4); // Fake tx hash
    logger.info(`📝 Adding test transaction: ${testTxHash}`);

    await monitorService.addTransaction({
      txHash: testTxHash,
      requestId: 'test-request-1',
      chain: 'polygon',
      network: 'mainnet',
      status: 'SENT',
      nonce: 123,
    });

    logger.info(
      '⏳ Waiting for initial check (should happen within 2 seconds)...'
    );

    // Monitor the transaction status for 10 seconds
    let lastStatus = 'SENT';
    const startTime = Date.now();
    const monitorInterval = setInterval(() => {
      const activeTransactions = monitorService.getActiveTransactions();
      const tx = activeTransactions.get(testTxHash);

      if (tx) {
        const timeSinceStart = Math.floor((Date.now() - startTime) / 1000);
        if (tx.status !== lastStatus) {
          logger.info(
            `🔄 Status changed at ${timeSinceStart}s: ${lastStatus} → ${tx.status}`
          );
          lastStatus = tx.status;
        }

        const timeSinceLastCheck = Math.floor(
          (Date.now() - tx.lastChecked.getTime()) / 1000
        );
        logger.info(
          `📊 [${timeSinceStart}s] Status: ${tx.status}, Last checked: ${timeSinceLastCheck}s ago, Retry count: ${tx.retryCount}`
        );
      } else {
        logger.info('❌ Transaction not found in active monitoring');
      }
    }, 1000);

    // Run for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    clearInterval(monitorInterval);

    // Check final state
    const activeTransactions = monitorService.getActiveTransactions();
    const finalTx = activeTransactions.get(testTxHash);

    if (finalTx) {
      const totalTime = Math.floor((Date.now() - startTime) / 1000);
      logger.info(`\n📋 Final Report after ${totalTime} seconds:`);
      logger.info(`  Status: ${finalTx.status}`);
      logger.info(`  Check count: ${finalTx.retryCount}`);
      logger.info(`  Last checked: ${finalTx.lastChecked.toISOString()}`);

      if (finalTx.retryCount > 0) {
        logger.info('✅ SUCCESS: Transaction was checked at least once');
      } else {
        logger.error('❌ FAIL: Transaction was never checked');
      }
    } else {
      logger.error('❌ Transaction removed from monitoring');
    }

    // Cleanup
    logger.info('\n🧹 Cleaning up...');
    await pollingService.stopPolling();
    await webSocketService.stopListening();
    await monitorService.shutdown();
  } catch (error) {
    logger.error('❌ Test failed:', error);
  }

  process.exit(0);
}

// Run the test
testTransactionMonitoring().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
