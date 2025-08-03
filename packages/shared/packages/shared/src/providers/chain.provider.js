"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainProvider = void 0;
const tslib_1 = require("tslib");
const ethers_1 = require("ethers");
const chainsConfig = tslib_1.__importStar(require("../config/chains.config.json"));
class ChainProvider {
    provider;
    chain;
    network;
    config;
    constructor(options) {
        this.chain = options.chain;
        this.network = options.network;
        const chainConfigs = chainsConfig[options.chain];
        if (!chainConfigs) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }
        this.config = chainConfigs[options.network];
        if (!this.config) {
            throw new Error(`Unsupported network: ${options.network} for chain: ${options.chain}`);
        }
        // Allow RPC URL override from environment variable
        const rpcUrl = process.env.RPC_URL || options.rpcUrl || this.config.rpcUrl;
        // Allow Chain ID override from environment variable
        const chainId = process.env.CHAIN_ID
            ? parseInt(process.env.CHAIN_ID)
            : this.config.chainId;
        // Use simplified constructor to avoid network detection issues
        this.provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl, chainId);
    }
    getProvider() {
        return this.provider;
    }
    getChainId() {
        return this.config.chainId;
    }
    getChainName() {
        return this.config.name;
    }
    getNativeCurrency() {
        return this.config.nativeCurrency;
    }
    getBlockExplorerUrl() {
        return this.config.blockExplorerUrl;
    }
    getTxUrl(txHash) {
        return `${this.config.blockExplorerUrl}/tx/${txHash}`;
    }
    getAddressUrl(address) {
        return `${this.config.blockExplorerUrl}/address/${address}`;
    }
    getMulticall3Address() {
        // Universal Multicall3 address for most EVM chains
        const UNIVERSAL_MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
        return this.config.multicall3Address || UNIVERSAL_MULTICALL3_ADDRESS;
    }
    async getBlockNumber() {
        try {
            return await this.provider.getBlockNumber();
        }
        catch (error) {
            throw new Error(`Failed to get block number: ${error}`);
        }
    }
    async getBalance(address) {
        try {
            return await this.provider.getBalance(address);
        }
        catch (error) {
            throw new Error(`Failed to get balance for ${address}: ${error}`);
        }
    }
    async getTransactionReceipt(txHash) {
        try {
            return await this.provider.getTransactionReceipt(txHash);
        }
        catch (error) {
            throw new Error(`Failed to get transaction receipt for ${txHash}: ${error}`);
        }
    }
    async estimateGas(transaction) {
        try {
            const estimated = await this.provider.estimateGas(transaction);
            // Add 20% buffer for safety
            return (estimated * 120n) / 100n;
        }
        catch (error) {
            throw new Error(`Failed to estimate gas: ${error}`);
        }
    }
    async getTransactionCount(address, blockTag) {
        try {
            return await this.provider.getTransactionCount(address, blockTag);
        }
        catch (error) {
            throw new Error(`Failed to get transaction count for ${address}: ${error}`);
        }
    }
    async waitForTransaction(txHash, confirmations, timeout) {
        try {
            return await this.provider.waitForTransaction(txHash, confirmations, timeout);
        }
        catch (error) {
            throw new Error(`Failed to wait for transaction ${txHash}: ${error}`);
        }
    }
    async getFeeData() {
        try {
            return await this.provider.getFeeData();
        }
        catch (error) {
            throw new Error(`Failed to get fee data: ${error}`);
        }
    }
    async getGasPrice() {
        try {
            const feeData = await this.provider.getFeeData();
            return feeData.gasPrice || BigInt(0);
        }
        catch (error) {
            throw new Error(`Failed to get gas price: ${error}`);
        }
    }
    async sendTransaction(signedTransaction) {
        try {
            return await this.provider.broadcastTransaction(signedTransaction);
        }
        catch (error) {
            throw new Error(`Failed to send transaction: ${error}`);
        }
    }
    async getContract(address, abi) {
        return new ethers_1.ethers.Contract(address, abi, this.provider);
    }
    isPolygon() {
        return this.chain === 'polygon';
    }
    isEthereum() {
        return this.chain === 'ethereum';
    }
    isBsc() {
        return this.chain === 'bsc';
    }
    isMainnet() {
        return this.network === 'mainnet';
    }
    isTestnet() {
        return this.network === 'testnet';
    }
    isLocalhost() {
        return this.chain === 'localhost';
    }
}
exports.ChainProvider = ChainProvider;
//# sourceMappingURL=chain.provider.js.map