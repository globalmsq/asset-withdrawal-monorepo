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
      accounts: [
        {
          // LocalStack private key - generates signing address: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf
          privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
          balance: '10000000000000000000000', // 10,000 ETH
        },
      ],
      gas: 30000000,
      gasPrice: 20000000000,
      loggingEnabled: true,
      forking: {
        enabled: false,
      },
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
      accounts: [
        '0x0000000000000000000000000000000000000000000000000000000000000001',
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
