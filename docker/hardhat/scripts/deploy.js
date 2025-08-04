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

  // Deploy Mock USDT (6 decimals)
  console.log('\nDeploying Mock USDT...');
  const mockUSDT = await MockToken.deploy(
    'Mock USDT',
    'mUSDT',
    6,
    hre.ethers.parseUnits('1000000', 6)
  );
  await mockUSDT.waitForDeployment();
  const mockUSDTAddress = await mockUSDT.getAddress();
  console.log('Mock USDT deployed to:', mockUSDTAddress);

  // Deploy Mock MSQ (18 decimals)
  console.log('\nDeploying Mock MSQ...');
  const mockMSQ = await MockToken.deploy(
    'Mock MSquare Global',
    'mMSQ',
    18,
    hre.ethers.parseEther('1000000')
  );
  await mockMSQ.waitForDeployment();
  const mockMSQAddress = await mockMSQ.getAddress();
  console.log('Mock MSQ deployed to:', mockMSQAddress);

  // Deploy Mock SUT (18 decimals)
  console.log('\nDeploying Mock SUT...');
  const mockSUT = await MockToken.deploy(
    'Mock Super Trust',
    'mSUT',
    18,
    hre.ethers.parseEther('1000000')
  );
  await mockSUT.waitForDeployment();
  const mockSUTAddress = await mockSUT.getAddress();
  console.log('Mock SUT deployed to:', mockSUTAddress);

  // Deploy Mock KWT (6 decimals)
  console.log('\nDeploying Mock KWT...');
  const mockKWT = await MockToken.deploy(
    'Mock Korean Won Token',
    'mKWT',
    6,
    hre.ethers.parseUnits('1000000', 6)
  );
  await mockKWT.waitForDeployment();
  const mockKWTAddress = await mockKWT.getAddress();
  console.log('Mock KWT deployed to:', mockKWTAddress);

  // Deploy Mock P2UC (6 decimals)
  console.log('\nDeploying Mock P2UC...');
  const mockP2UC = await MockToken.deploy(
    'Mock Point to You Coin',
    'mP2UC',
    6,
    hre.ethers.parseUnits('1000000', 6)
  );
  await mockP2UC.waitForDeployment();
  const mockP2UCAddress = await mockP2UC.getAddress();
  console.log('Mock P2UC deployed to:', mockP2UCAddress);

  // Deploy Multicall3
  console.log('\nDeploying Multicall3...');
  const Multicall3 = await hre.ethers.getContractFactory('Multicall3');
  const multicall3 = await Multicall3.deploy();
  await multicall3.waitForDeployment();
  const multicall3Address = await multicall3.getAddress();
  console.log('Multicall3 deployed to:', multicall3Address);

  // Set up allowances for Multicall3
  const MAX_UINT256 = hre.ethers.MaxUint256;
  console.log('\nSetting up token allowances for Multicall3...');

  // Approve all tokens for Multicall3
  await mockUSDT.approve(multicall3Address, MAX_UINT256);
  console.log('✓ Mock USDT allowance set for Multicall3');

  await mockMSQ.approve(multicall3Address, MAX_UINT256);
  console.log('✓ Mock MSQ allowance set for Multicall3');

  await mockSUT.approve(multicall3Address, MAX_UINT256);
  console.log('✓ Mock SUT allowance set for Multicall3');

  await mockKWT.approve(multicall3Address, MAX_UINT256);
  console.log('✓ Mock KWT allowance set for Multicall3');

  await mockP2UC.approve(multicall3Address, MAX_UINT256);
  console.log('✓ Mock P2UC allowance set for Multicall3');

  console.log('\nAll token allowances have been set for Multicall3');

  // Save deployment info
  const deploymentInfo = {
    network: 'localhost',
    chainId: 31337,
    contracts: {
      MockUSDT: {
        address: mockUSDTAddress,
        decimals: 6,
        symbol: 'mUSDT',
        name: 'Mock USDT',
      },
      MockMSQ: {
        address: mockMSQAddress,
        decimals: 18,
        symbol: 'mMSQ',
        name: 'Mock MSquare Global',
      },
      MockSUT: {
        address: mockSUTAddress,
        decimals: 18,
        symbol: 'mSUT',
        name: 'Mock Super Trust',
      },
      MockKWT: {
        address: mockKWTAddress,
        decimals: 6,
        symbol: 'mKWT',
        name: 'Mock Korean Won Token',
      },
      MockP2UC: {
        address: mockP2UCAddress,
        decimals: 6,
        symbol: 'mP2UC',
        name: 'Mock Point to You Coin',
      },
      Multicall3: {
        address: multicall3Address,
        name: 'Multicall3',
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
  console.log('Mock USDT:', mockUSDTAddress);
  console.log('Mock MSQ:', mockMSQAddress);
  console.log('Mock SUT:', mockSUTAddress);
  console.log('Mock KWT:', mockKWTAddress);
  console.log('Mock P2UC:', mockP2UCAddress);
  console.log('Multicall3:', multicall3Address);
  console.log('========================\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
