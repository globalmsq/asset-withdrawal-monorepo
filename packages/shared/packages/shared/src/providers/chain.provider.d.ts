import { ethers } from 'ethers';
import { ChainName, ChainNetwork, ChainConfig, ChainProviderOptions } from '../types/chain.types';
export declare class ChainProvider {
    private provider;
    readonly chain: ChainName;
    readonly network: ChainNetwork;
    readonly config: ChainConfig;
    constructor(options: ChainProviderOptions);
    getProvider(): ethers.JsonRpcProvider;
    getChainId(): number;
    getChainName(): string;
    getNativeCurrency(): {
        name: string;
        symbol: string;
        decimals: number;
    };
    getBlockExplorerUrl(): string;
    getTxUrl(txHash: string): string;
    getAddressUrl(address: string): string;
    getMulticall3Address(): string;
    getBlockNumber(): Promise<number>;
    getBalance(address: string): Promise<bigint>;
    getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null>;
    estimateGas(transaction: ethers.TransactionRequest): Promise<bigint>;
    getTransactionCount(address: string, blockTag?: string): Promise<number>;
    waitForTransaction(txHash: string, confirmations?: number, timeout?: number): Promise<ethers.TransactionReceipt | null>;
    getFeeData(): Promise<ethers.FeeData>;
    getGasPrice(): Promise<bigint>;
    sendTransaction(signedTransaction: string): Promise<ethers.TransactionResponse>;
    getContract(address: string, abi: any[]): Promise<ethers.Contract>;
    isPolygon(): boolean;
    isEthereum(): boolean;
    isBsc(): boolean;
    isMainnet(): boolean;
    isTestnet(): boolean;
    isLocalhost(): boolean;
}
