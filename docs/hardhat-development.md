# Hardhat Development Tools

This document describes the Hardhat development tools and utilities available for testing blockchain-related features.

## HardhatHelpers Utility

The `HardhatHelpers` class provides a comprehensive set of utilities for interacting with a Hardhat node during development and testing.

### Installation

The helpers are available through the shared package:

```typescript
import { HardhatHelpers, hardhatHelpers } from '@asset-withdrawal/shared';
```

### Basic Usage

```typescript
// Using the singleton instance
import { hardhatHelpers } from '@asset-withdrawal/shared';

// Or create your own instance
import { HardhatHelpers, ChainProvider } from '@asset-withdrawal/shared';
const helpers = new HardhatHelpers();

// With custom chain provider
const chainProvider = new ChainProvider({
  chain: 'localhost',
  network: 'testnet',
});
const helpers = new HardhatHelpers(chainProvider);
```

### Available Methods

#### Account Management

- `getSigningAccount()` - Get the default signing account with private key
- `getAllAccounts()` - Get all available Hardhat accounts
- `fundAccount(address, amountInEth)` - Fund an account with ETH
- `setBalance(address, balanceInEth)` - Set account balance directly
- `impersonateAccount(address)` - Impersonate an account for testing
- `stopImpersonatingAccount(address)` - Stop impersonating an account

#### Time Manipulation

- `advanceTime(seconds)` - Advance blockchain time
- `advanceBlocks(blocks)` - Mine multiple blocks
- `mineBlock(timestamp?)` - Mine a single block
- `getBlockNumber()` - Get current block number
- `getBlockTimestamp()` - Get current block timestamp

#### State Management

- `snapshot()` - Create a snapshot of the current state
- `revert(snapshotId)` - Revert to a previous snapshot
- `reset()` - Reset Hardhat node to clean state

#### Contract Deployment

- `deployContract(bytecode, abi, args)` - Deploy a contract from bytecode

#### Token Operations

- `getTokenBalance(tokenAddress, accountAddress)` - Get ERC20 token balance
- `transferTokens(tokenAddress, toAddress, amount)` - Transfer tokens
- `getMockTokenAddress()` - Get deployed MOCK token address
- `getMulticall3Address()` - Get deployed Multicall3 address

#### Transaction Utilities

- `getTransactionReceipt(txHash)` - Get transaction receipt
- `waitForTransaction(txHash, confirmations)` - Wait for transaction confirmation

## Hardhat Plugins

The following Hardhat plugins are installed and configured:

### 1. Gas Reporter

Generate gas usage reports for your contracts:

```bash
npm run hardhat:gas-report
```

Configuration in `hardhat.config.js`:

```javascript
gasReporter: {
  enabled: process.env.REPORT_GAS !== undefined,
  currency: "USD",
  token: "MATIC" // For Polygon
}
```

### 2. Contract Sizer

Analyze contract sizes:

```bash
npm run hardhat:size
```

### 3. Solidity Coverage

Generate code coverage reports:

```bash
npm run hardhat:coverage
```

### 4. Hardhat Verify

Verify contracts on block explorers (configured for Polygon):

```bash
npx hardhat verify --network polygon <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Development Scripts

### Running Hardhat Node

Since Hardhat runs exclusively in Docker, use the following commands:

```bash
# Start all services including Hardhat
docker-compose -f docker/docker-compose.yaml up -d

# Or run Hardhat commands inside the container
docker exec -it withdrawal-hardhat-node npm run test
docker exec -it withdrawal-hardhat-node npm run coverage
docker exec -it withdrawal-hardhat-node npm run gas-report
```

## Docker Integration

The project includes Docker support for running Hardhat in containers:

1. **hardhat-node** service: Runs the Hardhat node
2. **hardhat-deploy** service: Deploys contracts automatically

### Starting the Development Environment

```bash
# Start all services including Hardhat
docker-compose -f docker/docker-compose.yaml up -d

# View Hardhat node logs
docker logs withdrawal-hardhat-node

# Check deployment status
docker logs withdrawal-hardhat-deploy
```

## Example Test

```javascript
// In your application code (not in Hardhat tests)
const { hardhatHelpers } = require('@asset-withdrawal/shared');

async function testLocalBlockchain() {
  const mockToken = hardhatHelpers.getMockTokenAddress();
  const account = await hardhatHelpers.getSigningAccount();

  // Get initial balance
  const balance = await hardhatHelpers.getTokenBalance(
    mockToken,
    account.address
  );

  console.log('Balance:', ethers.formatEther(balance), 'MOCK');
}
```

For Hardhat-specific tests, create them in `docker/hardhat/test/` directory.

## Environment Configuration

The localhost chain is configured in `chains.config.json`:

```json
{
  "localhost": {
    "testnet": {
      "name": "Hardhat Network",
      "chainId": 31337,
      "rpcUrl": "http://localhost:8545",
      "multicall3Address": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"
    }
  }
}
```

MOCK token is configured in `tokens.config.json`:

```json
{
  "localhost": {
    "testnet": {
      "MOCK": {
        "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        "decimals": 18,
        "symbol": "MOCK",
        "name": "Mock Token"
      }
    }
  }
}
```
