"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hardhatHelpers = exports.HardhatHelpers = void 0;
const ethers_1 = require("ethers");
const chain_provider_1 = require("../providers/chain.provider");
class HardhatHelpers {
    provider;
    chainProvider;
    constructor(chainProvider) {
        // Default to localhost testnet if no chain provider given
        this.chainProvider =
            chainProvider ||
                new chain_provider_1.ChainProvider({ chain: 'localhost', network: 'testnet' });
        this.provider = this.chainProvider.getProvider();
    }
    /**
     * Get the default signing account (first account)
     */
    async getSigningAccount() {
        const accounts = await this.provider.listAccounts();
        if (accounts.length === 0) {
            throw new Error('No accounts found in Hardhat node');
        }
        const address = accounts[0].address;
        const balance = await this.provider.getBalance(address);
        // Default Hardhat private key for first account
        const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        return {
            address,
            privateKey,
            balance,
        };
    }
    /**
     * Get all available accounts
     */
    async getAllAccounts() {
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
        return Promise.all(accounts.map(async (account, index) => {
            const balance = await this.provider.getBalance(account.address);
            return {
                address: account.address,
                privateKey: privateKeys[index] || '',
                balance,
            };
        }));
    }
    /**
     * Fund an account with ETH
     */
    async fundAccount(toAddress, amountInEth) {
        const signingAccount = await this.getSigningAccount();
        const signer = new ethers_1.ethers.Wallet(signingAccount.privateKey, this.provider);
        const tx = await signer.sendTransaction({
            to: toAddress,
            value: ethers_1.ethers.parseEther(amountInEth),
        });
        await tx.wait();
        return tx;
    }
    /**
     * Advance time by specified seconds
     */
    async advanceTime(seconds) {
        await this.provider.send('evm_increaseTime', [seconds]);
        await this.provider.send('evm_mine', []);
    }
    /**
     * Advance blocks
     */
    async advanceBlocks(blocks) {
        for (let i = 0; i < blocks; i++) {
            await this.provider.send('evm_mine', []);
        }
    }
    /**
     * Get current block number
     */
    async getBlockNumber() {
        return await this.provider.getBlockNumber();
    }
    /**
     * Get current block timestamp
     */
    async getBlockTimestamp() {
        const block = await this.provider.getBlock('latest');
        return block?.timestamp || 0;
    }
    /**
     * Snapshot the current state
     */
    async snapshot() {
        return await this.provider.send('evm_snapshot', []);
    }
    /**
     * Revert to a snapshot
     */
    async revert(snapshotId) {
        return await this.provider.send('evm_revert', [snapshotId]);
    }
    /**
     * Set account balance
     */
    async setBalance(address, balanceInEth) {
        const balance = ethers_1.ethers.parseEther(balanceInEth);
        await this.provider.send('hardhat_setBalance', [
            address,
            '0x' + balance.toString(16),
        ]);
    }
    /**
     * Impersonate an account (useful for testing)
     */
    async impersonateAccount(address) {
        await this.provider.send('hardhat_impersonateAccount', [address]);
    }
    /**
     * Stop impersonating an account
     */
    async stopImpersonatingAccount(address) {
        await this.provider.send('hardhat_stopImpersonatingAccount', [address]);
    }
    /**
     * Deploy a contract from bytecode
     */
    async deployContract(bytecode, abi, args = []) {
        const signingAccount = await this.getSigningAccount();
        const signer = new ethers_1.ethers.Wallet(signingAccount.privateKey, this.provider);
        const factory = new ethers_1.ethers.ContractFactory(abi, bytecode, signer);
        const contract = await factory.deploy(...args);
        await contract.waitForDeployment();
        return contract;
    }
    /**
     * Get token balance for an address
     */
    async getTokenBalance(tokenAddress, accountAddress) {
        const abi = ['function balanceOf(address) view returns (uint256)'];
        const token = new ethers_1.ethers.Contract(tokenAddress, abi, this.provider);
        return await token.balanceOf(accountAddress);
    }
    /**
     * Transfer tokens from the signing account
     */
    async transferTokens(tokenAddress, toAddress, amount) {
        const signingAccount = await this.getSigningAccount();
        const signer = new ethers_1.ethers.Wallet(signingAccount.privateKey, this.provider);
        const abi = [
            'function transfer(address to, uint256 amount) returns (bool)',
        ];
        const token = new ethers_1.ethers.Contract(tokenAddress, abi, signer);
        const tx = await token.transfer(toAddress, amount);
        await tx.wait();
        return tx;
    }
    /**
     * Get the deployed MOCK token address
     */
    getMockTokenAddress() {
        // From deployment.json
        return '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    }
    /**
     * Get the deployed Multicall3 address
     */
    getMulticall3Address() {
        // From deployment.json
        return '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    }
    /**
     * Reset Hardhat node to clean state
     */
    async reset() {
        await this.provider.send('hardhat_reset', []);
    }
    /**
     * Mine a block with specific timestamp
     */
    async mineBlock(timestamp) {
        if (timestamp) {
            await this.provider.send('evm_mine', [timestamp]);
        }
        else {
            await this.provider.send('evm_mine', []);
        }
    }
    /**
     * Get transaction receipt
     */
    async getTransactionReceipt(txHash) {
        return await this.provider.getTransactionReceipt(txHash);
    }
    /**
     * Wait for transaction confirmation
     */
    async waitForTransaction(txHash, confirmations = 1) {
        const receipt = await this.provider.waitForTransaction(txHash, confirmations);
        if (!receipt) {
            throw new Error(`Transaction ${txHash} not found`);
        }
        return receipt;
    }
}
exports.HardhatHelpers = HardhatHelpers;
// Export singleton instance for convenience
exports.hardhatHelpers = new HardhatHelpers();
//# sourceMappingURL=hardhat-helpers.js.map