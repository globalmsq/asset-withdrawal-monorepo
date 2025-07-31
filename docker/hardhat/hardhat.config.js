require('@nomicfoundation/hardhat-toolbox');
require('@nomicfoundation/hardhat-verify');
require('@nomicfoundation/hardhat-network-helpers');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-contract-sizer');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  defaultNetwork: 'hardhat',

  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 1000, // 1 second for faster development
      },
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        initialIndex: 0,
        count: 20,
        accountsBalance: '10000000000000000000000', // 10,000 ETH
      },
      gas: 30000000,
      gasPrice: 20000000000,
      loggingEnabled: true,
    },
    localhost: {
      url: process.env.HARDHAT_NODE_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
      accounts: [
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      ],
    },
  },

  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
    outputFile: process.env.GAS_REPORT_FILE,
    noColors: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    token: 'MATIC', // For Polygon
  },

  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: true,
  },

  etherscan: {
    apiKey: {
      polygon: process.env.POLYGONSCAN_API_KEY || '',
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || '',
    },
  },
};
