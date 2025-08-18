#!/usr/bin/env node

/**
 * Fix nonce gap in Redis for tx-broadcaster
 *
 * This script:
 * 1. Resets the last broadcasted nonce to the actual last successful broadcast
 * 2. Reorders pending transactions in the queue by nonce
 */

const Redis = require('ioredis');

async function fixNonceGap() {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
  });

  const address = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

  try {
    // 1. Get current pending transactions
    const pendingKey = `nonce:pending:${address}`;
    const pendingData = await redis.lrange(pendingKey, 0, -1);

    console.log(`Found ${pendingData.length} pending transactions`);

    // 2. Parse and sort by nonce
    const transactions = pendingData.map(item => JSON.parse(item));
    console.log(
      'Current order (before fix):',
      transactions.map(tx => tx.nonce).join(', ')
    );

    transactions.sort((a, b) => a.nonce - b.nonce);
    console.log(
      'Correct order (after sort):',
      transactions.map(tx => tx.nonce).join(', ')
    );

    // 3. Check what the last broadcasted nonce should be
    // According to DB, nonce 18 was last BROADCASTED (batch transaction)
    const lastNonceKey = `nonce:last:${address}`;
    const currentLastNonce = await redis.get(lastNonceKey);
    console.log(`Current last broadcasted nonce in Redis: ${currentLastNonce}`);

    // Set to 18 which is the actual last broadcasted batch transaction
    const actualLastBroadcasted = 18;
    await redis.set(lastNonceKey, actualLastBroadcasted.toString());
    console.log(`Reset last broadcasted nonce to ${actualLastBroadcasted}`);

    // 4. Clear and repopulate the queue in correct order
    await redis.del(pendingKey);

    if (transactions.length > 0) {
      const serialized = transactions.map(tx => JSON.stringify(tx));
      await redis.rpush(pendingKey, ...serialized); // Use rpush for correct order
    }

    console.log('Reordered pending transactions by nonce');

    // 5. Verify the fix
    const newLastNonce = await redis.get(lastNonceKey);
    const newPendingData = await redis.lrange(pendingKey, 0, -1);
    const newTransactions = newPendingData.map(item => JSON.parse(item));

    console.log('\n✅ Fix applied successfully:');
    console.log(`- Last broadcasted nonce: ${newLastNonce}`);
    console.log(
      `- Pending nonces in order: ${newTransactions.map(tx => tx.nonce).join(', ')}`
    );

    // 6. Check for nonce continuity
    const firstPendingNonce =
      newTransactions.length > 0 ? newTransactions[0].nonce : null;
    if (firstPendingNonce && firstPendingNonce === parseInt(newLastNonce) + 1) {
      console.log('✅ No nonce gap - ready to process!');
    } else if (firstPendingNonce) {
      console.log(
        `⚠️  Nonce gap exists: expecting ${parseInt(newLastNonce) + 1}, but first pending is ${firstPendingNonce}`
      );
    }
  } catch (error) {
    console.error('Error fixing nonce gap:', error);
  } finally {
    await redis.quit();
  }
}

// Run the fix
fixNonceGap().catch(console.error);
