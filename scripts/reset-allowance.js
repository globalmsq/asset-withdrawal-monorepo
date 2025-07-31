const { ethers } = require('ethers');

// ERC20 ABI for approve function
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
];

async function main() {
  // Connect to Hardhat node
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  
  // Hardcoded addresses
  const multicall3Address = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';
  const tokens = {
    mUSDT: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    mMSQ: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    mKWT: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'
  };

  // Get signer wallet (using Hardhat's default account)
  const signerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const wallet = new ethers.Wallet(signerPrivateKey, provider);
  
  console.log('=== Allowance Reset Script ===');
  console.log('Signer Address:', wallet.address);
  console.log('Multicall3 Address:', multicall3Address);
  console.log('');

  // Reset allowance for each token
  for (const [tokenName, tokenAddress] of Object.entries(tokens)) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    try {
      const symbol = await tokenContract.symbol();
      
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(wallet.address, multicall3Address);
      console.log(`\n${tokenName} (${symbol}):`);
      console.log(`  Current Allowance: ${currentAllowance.toString()}`);
      
      if (currentAllowance > 0n) {
        console.log('  Resetting allowance to 0...');
        
        // Set allowance to 0
        const tx = await tokenContract.approve(multicall3Address, 0);
        console.log(`  Transaction Hash: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log(`  Transaction confirmed in block ${receipt.blockNumber}`);
        
        // Verify new allowance
        const newAllowance = await tokenContract.allowance(wallet.address, multicall3Address);
        console.log(`  New Allowance: ${newAllowance.toString()}`);
        
        if (newAllowance === 0n) {
          console.log('  ✅ Successfully reset to 0');
        } else {
          console.log('  ❌ Failed to reset allowance');
        }
      } else {
        console.log('  Already 0, skipping...');
      }
      
    } catch (error) {
      console.error(`Error resetting ${tokenName}:`, error.message);
    }
  }
  
  console.log('\n=== Reset Complete ===');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });