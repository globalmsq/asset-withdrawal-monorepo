export type TransactionStatus =
  | 'SENT'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELED';

export interface MonitoredTransaction {
  txHash: string;
  requestId?: string | null;
  batchId?: string | null;
  chain: string;
  network: string;
  status: TransactionStatus;
  blockNumber?: number;
  confirmations: number;
  lastChecked: Date;
  retryCount: number;
  nonce: number;
}

export interface PollingTier {
  name: string;
  interval: number;
  maxAge: number;
  batchSize: number;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  wsUrl?: string;
  requiredConfirmations?: number;
  blockTime?: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrl?: string;
  multicall3Address?: string;
}

export interface TransactionReceipt {
  txHash: string;
  blockNumber: number;
  status: number; // 1 for success, 0 for failure
  gasUsed: bigint;
  confirmations: number;
}

export interface BlockEvent {
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  transactions: string[];
}

export interface StatusUpdateMessage {
  txHash: string;
  requestId?: string | null;
  batchId?: string | null;
  status: TransactionStatus;
  blockNumber?: number;
  confirmations: number;
  gasUsed?: string;
  error?: string;
  timestamp: string;
}
