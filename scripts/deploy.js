const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment script...");

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get account balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  // Signing address that will receive all tokens
  const SIGNING_ADDRESS = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
  
  // Deploy MockToken
  console.log("\nDeploying MockToken...");
  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const mockToken = await MockToken.deploy(
    "Mock Token",
    "MOCK",
    18,
    hre.ethers.parseEther("1000000") // 1 million tokens with 18 decimals
  );
  await mockToken.waitForDeployment();
  const mockTokenAddress = await mockToken.getAddress();
  console.log("MockToken deployed to:", mockTokenAddress);

  // Transfer all tokens to signing address
  console.log("\nTransferring all tokens to signing address...");
  const deployerBalance = await mockToken.balanceOf(deployer.address);
  console.log("Deployer token balance:", hre.ethers.formatEther(deployerBalance), "MOCK");
  
  const transferTx = await mockToken.transfer(SIGNING_ADDRESS, deployerBalance);
  await transferTx.wait();
  console.log("Tokens transferred to:", SIGNING_ADDRESS);
  
  // Verify transfer
  const signingBalance = await mockToken.balanceOf(SIGNING_ADDRESS);
  console.log("Signing address token balance:", hre.ethers.formatEther(signingBalance), "MOCK");

  // Deploy Multicall3
  console.log("\nDeploying Multicall3...");
  const Multicall3 = await hre.ethers.getContractFactory("Multicall3");
  const multicall3 = await Multicall3.deploy();
  await multicall3.waitForDeployment();
  const multicall3Address = await multicall3.getAddress();
  console.log("Multicall3 deployed to:", multicall3Address);

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      MockToken: {
        address: mockTokenAddress,
        name: "Mock Token",
        symbol: "MOCK",
        decimals: 18,
        totalSupply: "1000000000000000000000000"
      },
      Multicall3: {
        address: multicall3Address
      }
    },
    signingAddress: SIGNING_ADDRESS,
    deployedAt: new Date().toISOString()
  };

  // Write deployment info to file
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", deploymentPath);

  // Note: Token addresses are hardcoded in tokens.config.json and chains.config.json
  // No need to save to environment variables

  console.log("\nDeployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });