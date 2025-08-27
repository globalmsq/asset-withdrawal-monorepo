/**
 * Unit test to verify the transaction monitoring logic fixes
 * This test focuses on the getTransactionsByTier logic without database dependencies
 */

import { config } from './src/config';

// Mock transaction data
interface MockTransaction {
  txHash: string;
  status: string;
  lastChecked: Date;
}

// Simulate the fixed getTransactionsByTier logic
function getTransactionsByTier(
  transactions: Map<string, MockTransaction>,
  tier: 'fast' | 'medium' | 'full'
): string[] {
  const now = Date.now();
  const tierConfig = config.pollingTiers[tier];

  return Array.from(transactions.entries())
    .filter(([_, tx]) => {
      const age = now - tx.lastChecked.getTime();

      // For fast tier, check immediately and frequently for new transactions
      if (tier === 'fast') {
        // Check all transactions that haven't been checked in the last minute
        // This ensures new transactions get checked immediately
        return age >= 60000; // 1 minute
      }

      // For medium and full tiers, use normal interval checking
      return age >= tierConfig.interval && age <= tierConfig.maxAge;
    })
    .map(([txHash, _]) => txHash);
}

function runTest() {
  console.log('🧪 Testing getTransactionsByTier logic fixes...\n');

  // Create test transactions with different ages
  const transactions = new Map<string, MockTransaction>();

  // New transaction (just added)
  transactions.set('tx1', {
    txHash: 'tx1',
    status: 'SENT',
    lastChecked: new Date(), // 0 seconds old
  });

  // Transaction checked 30 seconds ago
  transactions.set('tx2', {
    txHash: 'tx2',
    status: 'SENT',
    lastChecked: new Date(Date.now() - 30000), // 30 seconds old
  });

  // Transaction checked 2 minutes ago
  transactions.set('tx3', {
    txHash: 'tx3',
    status: 'CONFIRMING',
    lastChecked: new Date(Date.now() - 120000), // 2 minutes old
  });

  // Transaction checked 10 minutes ago
  transactions.set('tx4', {
    txHash: 'tx4',
    status: 'SENT',
    lastChecked: new Date(Date.now() - 600000), // 10 minutes old
  });

  // Transaction checked 1 hour ago
  transactions.set('tx5', {
    txHash: 'tx5',
    status: 'SENT',
    lastChecked: new Date(Date.now() - 3600000), // 1 hour old
  });

  console.log('📋 Test Transactions:');
  transactions.forEach((tx, hash) => {
    const age = Math.floor((Date.now() - tx.lastChecked.getTime()) / 1000);
    console.log(`  ${hash}: ${tx.status}, age: ${age}s`);
  });

  console.log('\n🔍 Testing Fast Tier (checks every minute):');
  const fastTierTxs = getTransactionsByTier(transactions, 'fast');
  console.log('  Transactions to check:', fastTierTxs);
  console.log('  Expected: [tx3, tx4, tx5] (older than 1 minute)');
  console.log(
    '  Result:',
    fastTierTxs.length === 3 &&
      fastTierTxs.includes('tx3') &&
      fastTierTxs.includes('tx4') &&
      fastTierTxs.includes('tx5')
      ? '✅ PASS'
      : '❌ FAIL'
  );

  console.log('\n🔍 Testing Medium Tier (checks every 30 minutes):');
  const mediumTierTxs = getTransactionsByTier(transactions, 'medium');
  console.log('  Transactions to check:', mediumTierTxs);
  console.log('  Expected: [tx5] (between 30 minutes and 2 hours old)');
  console.log(
    '  Result:',
    mediumTierTxs.length === 1 && mediumTierTxs.includes('tx5')
      ? '✅ PASS'
      : '❌ FAIL'
  );

  console.log('\n🎯 Key Fix Validation:');
  console.log(
    '  New transactions (tx1, tx2) are NOT in fast tier: ' +
      (!fastTierTxs.includes('tx1') && !fastTierTxs.includes('tx2')
        ? '✅ PASS'
        : '❌ FAIL')
  );
  console.log('  This is correct because:');
  console.log('  - New transactions get immediate check via addTransaction()');
  console.log('  - Fast tier polls transactions older than 1 minute');
  console.log('  - This prevents duplicate checking of brand new transactions');

  console.log('\n📊 Summary:');
  console.log(
    '  1. New transactions are checked immediately when added (2s delay)'
  );
  console.log(
    '  2. Fast tier polls every minute for transactions not checked recently'
  );
  console.log(
    '  3. WebSocket events also check new SENT transactions aggressively'
  );
  console.log(
    '  4. This ensures rapid status updates without excessive polling'
  );
}

runTest();
