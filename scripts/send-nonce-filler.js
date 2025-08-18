#!/usr/bin/env node

/**
 * Send filler transactions for missing nonces
 * This creates small value transactions to fill nonce gaps
 */

const { ethers } = require('ethers');

async function sendFillerTransactions() {
  // Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');

  // Test wallet (Hardhat account #0)
  const privateKey =
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet = new ethers.Wallet(privateKey, provider);

  const address = wallet.address;
  console.log(`Using wallet: ${address}`);

  // Missing nonces to fill
  const missingNonces = [17, 18, 24];

  for (const nonce of missingNonces) {
    try {
      console.log(`\nSending filler transaction for nonce ${nonce}...`);

      // Create a minimal transaction (send 1 wei to self)
      const tx = {
        to: address,
        value: ethers.parseEther('0.000000000000000001'), // 1 wei
        nonce: nonce,
        gasLimit: 21000,
        gasPrice: ethers.parseUnits('10', 'gwei'),
      };

      // Send transaction
      const txResponse = await wallet.sendTransaction(tx);
      console.log(`Transaction sent: ${txResponse.hash}`);

      // Wait for confirmation
      const receipt = await txResponse.wait();
      console.log(`✅ Nonce ${nonce} filled - Block: ${receipt.blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send nonce ${nonce}:`, error.message);

      // If nonce already used, continue
      if (error.message.includes('nonce')) {
        console.log(`Nonce ${nonce} might already be used, continuing...`);
        continue;
      }
      break;
    }
  }

  console.log('\n✅ Filler transactions complete');

  // Check current nonce
  const currentNonce = await provider.getTransactionCount(address);
  console.log(`Current account nonce: ${currentNonce}`);
}

// Run the script
sendFillerTransactions().catch(console.error);
