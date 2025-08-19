import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';
import { ChainService } from './chain.service';
import { MonitorService } from './monitor.service';
import { BlockEvent } from '../types';

export class WebSocketService {
  private chainService: ChainService;
  private monitorService: MonitorService;
  private blockListeners: Map<string, ethers.Listener>;
  private isListening: boolean = false;

  constructor(chainService: ChainService, monitorService: MonitorService) {
    this.chainService = chainService;
    this.monitorService = monitorService;
    this.blockListeners = new Map();
  }

  async startListening(): Promise<void> {
    if (this.isListening) {
      logger.warn('[WebSocketService] Already listening for events');
      return;
    }

    this.isListening = true;

    // Start WebSocket listeners for each chain
    const chains = [
      { chain: 'polygon', network: 'mainnet' },
      { chain: 'polygon', network: 'testnet' },
      { chain: 'ethereum', network: 'mainnet' },
      { chain: 'ethereum', network: 'testnet' },
      { chain: 'bsc', network: 'mainnet' },
      { chain: 'bsc', network: 'testnet' },
    ];

    for (const { chain, network } of chains) {
      await this.setupChainListener(chain, network);
    }

    logger.info('[WebSocketService] Started listening for blockchain events');
  }

  private async setupChainListener(
    chain: string,
    network: string
  ): Promise<void> {
    try {
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (!provider) {
        logger.warn(
          `[WebSocketService] No WebSocket provider available for ${chain}-${network}`
        );
        return;
      }

      const key = `${chain}-${network}`;

      // Create block listener
      const blockListener = async (blockNumber: number) => {
        await this.handleNewBlock(chain, network, blockNumber);
      };

      // Subscribe to new blocks
      provider.on('block', blockListener);
      this.blockListeners.set(key, blockListener);

      // Also set up pending transaction filter for our transactions
      const activeTransactions = this.monitorService.getActiveTransactions();
      const chainTransactions = Array.from(activeTransactions.values())
        .filter(tx => tx.chain === chain && tx.network === network)
        .map(tx => tx.txHash);

      if (chainTransactions.length > 0) {
        // Watch for specific transaction confirmations
        for (const txHash of chainTransactions) {
          this.watchTransaction(provider, txHash, chain, network);
        }
      }

      logger.info(`[WebSocketService] Set up listener for ${chain}-${network}`);
    } catch (error) {
      logger.error(
        `[WebSocketService] Failed to setup listener for ${chain}-${network}:`,
        error
      );
    }
  }

  private async handleNewBlock(
    chain: string,
    network: string,
    blockNumber: number
  ): Promise<void> {
    try {
      logger.debug(
        `[WebSocketService] New block ${blockNumber} on ${chain}-${network}`
      );

      // Get transactions that need checking for this chain
      const activeTransactions = this.monitorService.getActiveTransactions();
      const chainTransactions = Array.from(activeTransactions.values()).filter(
        tx =>
          tx.chain === chain &&
          tx.network === network &&
          (tx.status === 'SENT' || tx.status === 'CONFIRMING')
      );

      if (chainTransactions.length === 0) {
        return;
      }

      // Check transactions in this block
      const provider = await this.chainService.getProvider(chain, network);
      const block = await provider.getBlock(blockNumber);

      if (!block) {
        return;
      }

      // Check if any of our transactions are in this block
      const blockTxHashes = new Set(block.transactions);
      const ourTransactions = chainTransactions.filter(tx =>
        blockTxHashes.has(tx.txHash)
      );

      // Process found transactions
      for (const tx of ourTransactions) {
        logger.info(
          `[WebSocketService] Transaction ${tx.txHash} found in block ${blockNumber}`
        );
        await this.monitorService.checkTransaction(tx.txHash);
      }

      // Also update confirmations for transactions in earlier blocks
      const confirmingTransactions = chainTransactions.filter(
        tx =>
          tx.status === 'CONFIRMING' &&
          tx.blockNumber &&
          tx.blockNumber < blockNumber
      );

      for (const tx of confirmingTransactions) {
        const confirmations = blockNumber - (tx.blockNumber || 0);
        logger.debug(
          `[WebSocketService] Transaction ${tx.txHash} now has ${confirmations} confirmations`
        );
        await this.monitorService.checkTransaction(tx.txHash);
      }
    } catch (error) {
      logger.error(
        `[WebSocketService] Error handling block ${blockNumber}:`,
        error
      );
    }
  }

  private watchTransaction(
    provider: ethers.WebSocketProvider,
    txHash: string,
    chain: string,
    network: string
  ): void {
    // Set up transaction-specific watcher
    provider.once(txHash, async receipt => {
      logger.info(
        `[WebSocketService] Transaction ${txHash} confirmed via WebSocket`
      );
      await this.monitorService.checkTransaction(txHash);

      // Continue watching for more confirmations
      const requiredConfirmations =
        await this.chainService.getRequiredConfirmations(chain, network);
      if (receipt && receipt.confirmations < requiredConfirmations) {
        // Keep watching for more confirmations
        this.watchTransactionConfirmations(
          provider,
          txHash,
          chain,
          network,
          receipt.blockNumber
        );
      }
    });
  }

  private watchTransactionConfirmations(
    provider: ethers.WebSocketProvider,
    txHash: string,
    chain: string,
    network: string,
    blockNumber: number
  ): void {
    const confirmationListener = async (currentBlock: number) => {
      const confirmations = currentBlock - blockNumber;
      const requiredConfirmations =
        await this.chainService.getRequiredConfirmations(chain, network);

      logger.debug(
        `[WebSocketService] Transaction ${txHash} has ${confirmations}/${requiredConfirmations} confirmations`
      );

      // Check transaction status
      const tx = await this.monitorService.checkTransaction(txHash);

      // Stop listening if transaction is confirmed or failed
      if (!tx || tx.status === 'CONFIRMED' || tx.status === 'FAILED') {
        provider.off('block', confirmationListener);
      }
    };

    provider.on('block', confirmationListener);
  }

  async addTransactionWatch(
    txHash: string,
    chain: string,
    network: string
  ): Promise<void> {
    try {
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (!provider) {
        logger.warn(
          `[WebSocketService] Cannot watch transaction - no WebSocket for ${chain}-${network}`
        );
        return;
      }

      this.watchTransaction(provider, txHash, chain, network);
      logger.info(`[WebSocketService] Added watch for transaction ${txHash}`);
    } catch (error) {
      logger.error(
        `[WebSocketService] Failed to add transaction watch:`,
        error
      );
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;

    // Remove all block listeners
    for (const [key, listener] of this.blockListeners.entries()) {
      const [chain, network] = key.split('-');
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (provider) {
        provider.off('block', listener);
      }
    }

    this.blockListeners.clear();
    logger.info('[WebSocketService] Stopped listening for blockchain events');
  }

  isConnected(chain: string, network: string): boolean {
    const key = `${chain}-${network}`;
    return this.blockListeners.has(key);
  }

  getConnectionStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    const chains = ['polygon', 'ethereum', 'bsc'];
    const networks = ['mainnet', 'testnet'];

    for (const chain of chains) {
      for (const network of networks) {
        const key = `${chain}-${network}`;
        status.set(key, this.blockListeners.has(key));
      }
    }

    return status;
  }
}
