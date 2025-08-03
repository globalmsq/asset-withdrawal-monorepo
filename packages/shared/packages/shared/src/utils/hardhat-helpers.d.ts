import { ethers } from 'ethers';
import { ChainProvider } from '../providers/chain.provider';
export interface HardhatAccount {
    address: string;
    privateKey: string;
    balance: bigint;
}
export declare class HardhatHelpers {
    private provider;
    private chainProvider;
    constructor(chainProvider?: ChainProvider);
    /**
     * Get the default signing account (first account)
     */
    getSigningAccount(): Promise<HardhatAccount>;
    /**
     * Get all available accounts
     */
    getAllAccounts(): Promise<HardhatAccount[]>;
    /**
     * Fund an account with ETH
     */
    fundAccount(toAddress: string, amountInEth: string): Promise<ethers.TransactionResponse>;
    /**
     * Advance time by specified seconds
     */
    advanceTime(seconds: number): Promise<void>;
    /**
     * Advance blocks
     */
    advanceBlocks(blocks: number): Promise<void>;
    /**
     * Get current block number
     */
    getBlockNumber(): Promise<number>;
    /**
     * Get current block timestamp
     */
    getBlockTimestamp(): Promise<number>;
    /**
     * Snapshot the current state
     */
    snapshot(): Promise<string>;
    /**
     * Revert to a snapshot
     */
    revert(snapshotId: string): Promise<boolean>;
    /**
     * Set account balance
     */
    setBalance(address: string, balanceInEth: string): Promise<void>;
    /**
     * Impersonate an account (useful for testing)
     */
    impersonateAccount(address: string): Promise<void>;
    /**
     * Stop impersonating an account
     */
    stopImpersonatingAccount(address: string): Promise<void>;
    /**
     * Deploy a contract from bytecode
     */
    deployContract(bytecode: string, abi: any[], args?: any[]): Promise<any>;
    /**
     * Get token balance for an address
     */
    getTokenBalance(tokenAddress: string, accountAddress: string): Promise<bigint>;
    /**
     * Transfer tokens from the signing account
     */
    transferTokens(tokenAddress: string, toAddress: string, amount: bigint): Promise<ethers.TransactionResponse>;
    /**
     * Get the deployed MOCK token address
     */
    getMockTokenAddress(): string;
    /**
     * Get the deployed Multicall3 address
     */
    getMulticall3Address(): string;
    /**
     * Reset Hardhat node to clean state
     */
    reset(): Promise<void>;
    /**
     * Mine a block with specific timestamp
     */
    mineBlock(timestamp?: number): Promise<void>;
    /**
     * Get transaction receipt
     */
    getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null>;
    /**
     * Wait for transaction confirmation
     */
    waitForTransaction(txHash: string, confirmations?: number): Promise<ethers.TransactionReceipt>;
}
export declare const hardhatHelpers: HardhatHelpers;
