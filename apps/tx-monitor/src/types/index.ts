export interface TransactionToMonitor {
  id: string;
  transactionHash: string;
  network: string;
  status: string;
  sentAt: Date;
}

export interface MonitorStatus {
  isRunning: boolean;
  lastPollTime: Date | null;
  pendingTransactions: number;
  processedTransactions: number;
  failedTransactions: number;
}