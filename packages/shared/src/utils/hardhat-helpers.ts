import { ethers } from 'ethers';
import { ChainProvider } from '../providers/chain.provider';

export interface HardhatAccount {
  address: string;
  privateKey: string;
  balance: bigint;
}

export class HardhatHelpers {
  private provider: ethers.JsonRpcProvider;
  private chainProvider: ChainProvider;

  constructor(chainProvider?: ChainProvider) {
    // Default to localhost testnet if no chain provider given
    this.chainProvider =
      chainProvider ||
      new ChainProvider({ chain: 'localhost', network: 'testnet' });
    this.provider = this.chainProvider.getProvider() as ethers.JsonRpcProvider;
  }

  /**
   * Get the default signing account (first account)
   */
  async getSigningAccount(): Promise<HardhatAccount> {
    const accounts = await this.provider.listAccounts();
    if (accounts.length === 0) {
      throw new Error('No accounts found in Hardhat node');
    }

    const address = accounts[0].address;
    const balance = await this.provider.getBalance(address);

    // Default Hardhat private key for first account
    const privateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    return {
      address,
      privateKey,
      balance,
    };
  }

  /**
   * Get all available accounts
   */
  async getAllAccounts(): Promise<HardhatAccount[]> {
    const accounts = await this.provider.listAccounts();

    // Default Hardhat private keys
    const privateKeys = [
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
      '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
      '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
      '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
      '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
      '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
    ];

    return Promise.all(
      accounts.map(async (account, index) => {
        const balance = await this.provider.getBalance(account.address);
        return {
          address: account.address,
          privateKey: privateKeys[index] || '',
          balance,
        };
      })
    );
  }

  /**
   * Fund an account with ETH
   */
  async fundAccount(
    toAddress: string,
    amountInEth: string
  ): Promise<ethers.TransactionResponse> {
    const signingAccount = await this.getSigningAccount();
    const signer = new ethers.Wallet(signingAccount.privateKey, this.provider);

    const tx = await signer.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amountInEth),
    });

    await tx.wait();
    return tx;
  }

  /**
   * Advance time by specified seconds
   */
  async advanceTime(seconds: number): Promise<void> {
    await this.provider.send('evm_increaseTime', [seconds]);
    await this.provider.send('evm_mine', []);
  }

  /**
   * Advance blocks
   */
  async advanceBlocks(blocks: number): Promise<void> {
    for (let i = 0; i < blocks; i++) {
      await this.provider.send('evm_mine', []);
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get current block timestamp
   */
  async getBlockTimestamp(): Promise<number> {
    const block = await this.provider.getBlock('latest');
    return block?.timestamp || 0;
  }

  /**
   * Snapshot the current state
   */
  async snapshot(): Promise<string> {
    return await this.provider.send('evm_snapshot', []);
  }

  /**
   * Revert to a snapshot
   */
  async revert(snapshotId: string): Promise<boolean> {
    return await this.provider.send('evm_revert', [snapshotId]);
  }

  /**
   * Set account balance
   */
  async setBalance(address: string, balanceInEth: string): Promise<void> {
    const balance = ethers.parseEther(balanceInEth);
    await this.provider.send('hardhat_setBalance', [
      address,
      '0x' + balance.toString(16),
    ]);
  }

  /**
   * Impersonate an account (useful for testing)
   */
  async impersonateAccount(address: string): Promise<void> {
    await this.provider.send('hardhat_impersonateAccount', [address]);
  }

  /**
   * Stop impersonating an account
   */
  async stopImpersonatingAccount(address: string): Promise<void> {
    await this.provider.send('hardhat_stopImpersonatingAccount', [address]);
  }

  /**
   * Deploy a contract from bytecode
   */
  async deployContract(
    bytecode: string,
    abi: any[],
    args: any[] = []
  ): Promise<any> {
    const signingAccount = await this.getSigningAccount();
    const signer = new ethers.Wallet(signingAccount.privateKey, this.provider);

    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();

    return contract;
  }

  /**
   * Get token balance for an address
   */
  async getTokenBalance(
    tokenAddress: string,
    accountAddress: string
  ): Promise<bigint> {
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const token = new ethers.Contract(tokenAddress, abi, this.provider);
    return await token.balanceOf(accountAddress);
  }

  /**
   * Transfer tokens from the signing account
   */
  async transferTokens(
    tokenAddress: string,
    toAddress: string,
    amount: bigint
  ): Promise<ethers.TransactionResponse> {
    const signingAccount = await this.getSigningAccount();
    const signer = new ethers.Wallet(signingAccount.privateKey, this.provider);

    const abi = [
      'function transfer(address to, uint256 amount) returns (bool)',
    ];
    const token = new ethers.Contract(tokenAddress, abi, signer);

    const tx = await token.transfer(toAddress, amount);
    await tx.wait();

    return tx;
  }

  /**
   * Get the deployed MOCK token address
   */
  getMockTokenAddress(): string {
    // From deployment.json
    return '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  }

  /**
   * Get the deployed Multicall3 address
   */
  getMulticall3Address(): string {
    // From deployment.json
    return '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
  }

  /**
   * Reset Hardhat node to clean state
   */
  async reset(): Promise<void> {
    await this.provider.send('hardhat_reset', []);
  }

  /**
   * Mine a block with specific timestamp
   */
  async mineBlock(timestamp?: number): Promise<void> {
    if (timestamp) {
      await this.provider.send('evm_mine', [timestamp]);
    } else {
      await this.provider.send('evm_mine', []);
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(
    txHash: string
  ): Promise<ethers.TransactionReceipt | null> {
    return await this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1
  ): Promise<ethers.TransactionReceipt> {
    const receipt = await this.provider.waitForTransaction(
      txHash,
      confirmations
    );
    if (!receipt) {
      throw new Error(`Transaction ${txHash} not found`);
    }
    return receipt;
  }
}

// Export singleton instance for convenience
export const hardhatHelpers = new HardhatHelpers();
