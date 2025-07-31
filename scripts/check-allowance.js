const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ERC20 ABI for allowance and approve functions
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  // Connect to Hardhat node
  const provider = new ethers.JsonRpcProvider('http://localhost:8545');
  
  // Hardcoded addresses from configs
  const multicall3Address = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707'; // localhost multicall3
  const tokens = {
    mUSDT: {
      address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      decimals: 6,
      symbol: 'mUSDT',
      name: 'Mock USDT'
    },
    mMSQ: {
      address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
      decimals: 18,
      symbol: 'mMSQ',
      name: 'Mock MSquare Global'
    },
    mKWT: {
      address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
      decimals: 6,
      symbol: 'mKWT',
      name: 'Mock Korean Won Token'
    }
  };

  // Get signer wallet (using Hardhat's default account)
  const signerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Hardhat account 0
  const wallet = new ethers.Wallet(signerPrivateKey, provider);
  
  console.log('=== Allowance Check Script ===');
  console.log('Signer Address:', wallet.address);
  console.log('Multicall3 Address:', multicall3Address);
  console.log('');

  // Check allowance for each token
  for (const [tokenName, tokenInfo] of Object.entries(tokens)) {
    
    const tokenContract = new ethers.Contract(tokenInfo.address, ERC20_ABI, provider);
    
    try {
      // Get token info
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const balance = await tokenContract.balanceOf(wallet.address);
      
      // Check allowance
      const allowance = await tokenContract.allowance(
        wallet.address,
        multicall3Address
      );
      
      console.log(`\n${tokenName} (${symbol}):`);
      console.log(`  Token Address: ${tokenInfo.address}`);
      console.log(`  Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
      console.log(`  Allowance: ${ethers.formatUnits(allowance, decimals)} ${symbol}`);
      console.log(`  Raw Allowance: ${allowance.toString()}`);
      
      // Check if it's max uint256
      const maxUint256 = ethers.MaxUint256;
      if (allowance === maxUint256) {
        console.log('  Status: UNLIMITED (max uint256)');
      } else if (allowance > 0n) {
        console.log('  Status: LIMITED');
      } else {
        console.log('  Status: NO ALLOWANCE');
      }
      
    } catch (error) {
      console.error(`Error checking ${tokenName}:`, error.message);
    }
  }
  
  console.log('\n=== Check Complete ===');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });