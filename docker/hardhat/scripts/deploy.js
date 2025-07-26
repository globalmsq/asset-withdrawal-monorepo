const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Starting contract deployment...');

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log('Account balance:', hre.ethers.formatEther(balance), 'ETH');

  // Deploy MockToken
  console.log('\nDeploying MockToken...');
  const MockToken = await hre.ethers.getContractFactory('MockToken');
  const mockToken = await MockToken.deploy(
    'Mock USDC',
    'mUSDC',
    6,
    hre.ethers.parseUnits('1000000', 6),
  );
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  console.log('MockToken deployed to:', mockTokenAddress);

  // Deploy additional test tokens if needed
  console.log('\nDeploying Mock USDT...');
  const mockUSDT = await MockToken.deploy(
    'Mock USDT',
    'mUSDT',
    6,
    hre.ethers.parseUnits('1000000', 6),
  );
  await mockUSDT.waitForDeployment();
  const mockUSDTAddress = await mockUSDT.getAddress();
  console.log('Mock USDT deployed to:', mockUSDTAddress);

  // Deploy Mock DAI (18 decimals)
  console.log('\nDeploying Mock DAI...');
  const mockDAI = await MockToken.deploy(
    'Mock DAI',
    'mDAI',
    18,
    hre.ethers.parseEther('1000000'),
  );
  await mockDAI.waitForDeployment();
  const mockDAIAddress = await mockDAI.getAddress();
  console.log('Mock DAI deployed to:', mockDAIAddress);

  // Save deployment info
  const deploymentInfo = {
    network: 'localhost',
    chainId: 31337,
    contracts: {
      MockUSDC: {
        address: mockTokenAddress,
        decimals: 6,
        symbol: 'mUSDC',
        name: 'Mock USDC',
      },
      MockUSDT: {
        address: mockUSDTAddress,
        decimals: 6,
        symbol: 'mUSDT',
        name: 'Mock USDT',
      },
      MockDAI: {
        address: mockDAIAddress,
        decimals: 18,
        symbol: 'mDAI',
        name: 'Mock DAI',
      },
    },
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  // Save to file
  const deploymentPath = path.join(__dirname, '..', 'deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('\nDeployment info saved to deployment.json');

  // Display summary
  console.log('\n=== Deployment Summary ===');
  console.log('Mock USDC:', mockTokenAddress);
  console.log('Mock USDT:', mockUSDTAddress);
  console.log('Mock DAI:', mockDAIAddress);
  console.log('========================\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
