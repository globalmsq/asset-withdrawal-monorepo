import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';
import { ChainService } from './chain.service';
import { MonitorService } from './monitor.service';

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

    // Set up event listeners for reconnection
    this.setupReconnectionHandlers();

    // Get all loaded configurations from ChainService
    const loadedConfigs = this.chainService.getLoadedConfigurations();

    // Start WebSocket listeners for all enabled chains
    for (const [key, config] of loadedConfigs) {
      const [chain, network] = key.split('-');
      await this.setupChainListener(chain, network);
    }

    logger.info('[WebSocketService] Started listening for blockchain events');
  }

  private setupReconnectionHandlers(): void {
    // Handle WebSocket disconnection - trigger immediate polling
    this.chainService.on(
      'websocket-disconnected',
      async ({ chain, network }) => {
        logger.info(
          `[WebSocketService] WebSocket disconnected for ${chain}-${network}, triggering immediate poll`
        );

        // Remove the listener for this chain
        const key = `${chain}-${network}`;
        const listener = this.blockListeners.get(key);
        if (listener) {
          this.blockListeners.delete(key);
        }

        // Trigger immediate polling for affected transactions
        const activeTransactions = this.monitorService.getActiveTransactions();
        const affectedTxs = Array.from(activeTransactions.values()).filter(
          tx => tx.chain === chain && tx.network === network
        );

        if (affectedTxs.length > 0) {
          logger.info(
            `[WebSocketService] Checking ${affectedTxs.length} transactions via polling due to disconnection`
          );
          for (const tx of affectedTxs) {
            await this.monitorService.checkTransaction(tx.txHash);
          }
        }
      }
    );

    // Handle WebSocket reconnection - re-setup listeners and check missed blocks
    this.chainService.on(
      'websocket-reconnected',
      async ({ chain, network, lastBlock, currentBlock }) => {
        logger.info(
          `[WebSocketService] WebSocket reconnected for ${chain}-${network}, checking blocks ${lastBlock + 1} to ${currentBlock}`
        );

        // Re-setup the chain listener
        await this.setupChainListener(chain, network);

        // Check for missed blocks
        if (currentBlock > lastBlock) {
          await this.checkMissedBlocks(
            chain,
            network,
            lastBlock + 1,
            currentBlock
          );
        }
      }
    );
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
      const chainTransactions = Array.from(activeTransactions.values()).filter(
        tx =>
          tx.chain === chain &&
          tx.network === network &&
          (tx.status === 'SENT' || tx.status === 'CONFIRMING')
      );

      if (chainTransactions.length > 0) {
        logger.info(
          `[WebSocketService] Setting up watchers for ${chainTransactions.length} active transactions on ${chain}-${network}`
        );

        // Watch for specific transaction confirmations
        for (const tx of chainTransactions) {
          this.watchTransaction(provider, tx.txHash, chain, network);
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

        // No delay needed here - block event already implies time has passed
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

      // Wait for tx-broadcaster to save to DB
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get transaction from activeTransactions
      const monitoredTx = this.monitorService
        .getActiveTransactions()
        .get(txHash);
      if (!monitoredTx) {
        logger.warn(
          `[WebSocketService] Transaction ${txHash} not found in monitoring`
        );
        return;
      }

      // Calculate confirmations using the receipt we already have
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;
      const requiredConfirmations =
        await this.chainService.getRequiredConfirmations(chain, network);

      // Update transaction status
      const previousStatus = monitoredTx.status;
      monitoredTx.blockNumber = receipt.blockNumber;
      monitoredTx.confirmations = confirmations;
      monitoredTx.lastChecked = new Date();

      if (receipt.status === 0) {
        monitoredTx.status = 'FAILED';
      } else if (confirmations >= requiredConfirmations) {
        monitoredTx.status = 'CONFIRMED';
      } else {
        monitoredTx.status = 'CONFIRMING';
      }

      // Update DB directly (no need to call checkTransaction)
      if (previousStatus !== monitoredTx.status) {
        await this.monitorService.updateTransactionStatus(monitoredTx, receipt);
      }

      // Remove from active monitoring if finalized
      if (
        monitoredTx.status === 'CONFIRMED' ||
        monitoredTx.status === 'FAILED'
      ) {
        this.monitorService.getActiveTransactions().delete(txHash);
        logger.info(
          `[WebSocketService] Transaction ${txHash} finalized: ${monitoredTx.status}`
        );
      } else if (confirmations < requiredConfirmations) {
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
      const confirmations = currentBlock - blockNumber + 1;
      const requiredConfirmations =
        await this.chainService.getRequiredConfirmations(chain, network);

      logger.info(
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

    // Get all loaded configurations from ChainService
    const loadedConfigs = this.chainService.getLoadedConfigurations();

    // Check connection status for all loaded chains
    for (const key of loadedConfigs.keys()) {
      status.set(key, this.blockListeners.has(key));
    }

    return status;
  }

  // Check missed blocks during disconnection
  private async checkMissedBlocks(
    chain: string,
    network: string,
    fromBlock: number,
    toBlock: number
  ): Promise<void> {
    try {
      logger.info(
        `[WebSocketService] Re-checking active transactions for ${chain}-${network} after reconnection (blocks ${fromBlock} to ${toBlock})`
      );

      const activeTransactions = this.monitorService.getActiveTransactions();
      const chainTransactions = Array.from(activeTransactions.values()).filter(
        tx =>
          tx.chain === chain &&
          tx.network === network &&
          (tx.status === 'SENT' || tx.status === 'CONFIRMING')
      );

      if (chainTransactions.length === 0) {
        logger.info(
          `[WebSocketService] No active transactions to check for ${chain}-${network}`
        );
        return;
      }

      logger.info(
        `[WebSocketService] Checking ${chainTransactions.length} active transaction(s) for ${chain}-${network}`
      );

      // Concurrently check all potentially affected transactions.
      // The monitorService.checkTransaction is idempotent and will handle fetching receipts
      // and updating status and confirmations correctly.
      const checkPromises = chainTransactions.map(tx =>
        this.monitorService.checkTransaction(tx.txHash).catch(error => {
          logger.error(
            `[WebSocketService] Error checking transaction ${tx.txHash} during missed block recovery:`,
            error
          );
        })
      );

      await Promise.all(checkPromises);

      logger.info(
        `[WebSocketService] Completed checking transactions for ${chain}-${network} after reconnection`
      );
    } catch (error) {
      logger.error(
        `[WebSocketService] Error during missed block recovery for ${chain}-${network}:`,
        error
      );
    }
  }
}
