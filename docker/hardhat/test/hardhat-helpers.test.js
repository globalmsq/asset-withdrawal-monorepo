const { expect } = require('chai');
const { ethers } = require('hardhat');
const { network } = require('hardhat');

describe('Local Blockchain Tests', function () {
  let signers;
  let mockToken;

  before(async function () {
    // Get signers
    signers = await ethers.getSigners();
    console.log('Total signers:', signers.length);

    // Deploy MockToken if not already deployed
    try {
      // Try to get existing deployment
      mockToken = await ethers.getContractAt('MockToken', '0x5FbDB2315678afecb367f032d93F642f64180aa3');
      console.log('Using existing MockToken deployment');
    } catch (e) {
      // Deploy new instance
      const MockToken = await ethers.getContractFactory('MockToken');
      mockToken = await MockToken.deploy('Mock Token', 'MOCK', 18, ethers.parseEther('1000000'));
      await mockToken.waitForDeployment();
      console.log('Deployed new MockToken at:', await mockToken.getAddress());
    }
  });

  it('should have the correct initial setup', async function () {
    const [signer] = signers;

    expect(signer.address).to.be.a('string');
    expect(await ethers.provider.getBalance(signer.address)).to.be.gt(0);

    console.log('First signer address:', signer.address);
    console.log('Balance:', ethers.formatEther(await ethers.provider.getBalance(signer.address)), 'ETH');
  });

  it('should advance time', async function () {
    const blockBefore = await ethers.provider.getBlock('latest');

    // Advance time by 1 hour
    await network.provider.send('evm_increaseTime', [3600]);
    await network.provider.send('evm_mine');

    const blockAfter = await ethers.provider.getBlock('latest');

    expect(blockAfter.timestamp).to.be.gt(blockBefore.timestamp);
    console.log('Time advanced by', blockAfter.timestamp - blockBefore.timestamp, 'seconds');
  });

  it('should create and revert snapshot', async function () {
    // Create snapshot
    const snapshotId = await network.provider.send('evm_snapshot');

    // Make some changes
    const initialBlock = await ethers.provider.getBlockNumber();

    // Mine 5 blocks
    for (let i = 0; i < 5; i++) {
      await network.provider.send('evm_mine');
    }

    const newBlock = await ethers.provider.getBlockNumber();
    expect(newBlock).to.equal(initialBlock + 5);

    // Revert to snapshot
    await network.provider.send('evm_revert', [snapshotId]);
    const revertedBlock = await ethers.provider.getBlockNumber();

    expect(revertedBlock).to.equal(initialBlock);
    console.log('Successfully reverted to snapshot');
  });

  it('should interact with MOCK token', async function () {
    const [signer, recipient] = signers;

    // Check initial balance
    const balance = await mockToken.balanceOf(signer.address);
    console.log('MOCK token balance:', ethers.formatEther(balance));

    if (balance > 0) {
      // Transfer some tokens
      const transferAmount = ethers.parseEther('100');
      await mockToken.transfer(recipient.address, transferAmount);

      const recipientBalance = await mockToken.balanceOf(recipient.address);
      expect(recipientBalance).to.equal(transferAmount);
      console.log('Transferred', ethers.formatEther(transferAmount), 'MOCK to', recipient.address);
    }
  });
});
