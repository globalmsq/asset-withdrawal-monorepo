import { ethers } from 'ethers';
import { logger } from '@asset-withdrawal/shared';
import { ChainService } from './chain.service';
import { MonitorService } from './monitor.service';

export class WebSocketService {
  private chainService: ChainService;
  private monitorService: MonitorService;
  private blockListeners: Map<string, (blockNumber: number) => void>;
  private transactionListeners: Map<string, ethers.Listener>;
  private lastBlockNumbers: Map<string, number>;
  private isListening: boolean = false;
  private connectionStates: Map<
    string,
    'disconnected' | 'connecting' | 'connected'
  >;
  private blockSubscriptionActive: Map<string, boolean>;

  constructor(chainService: ChainService, monitorService: MonitorService) {
    this.chainService = chainService;
    this.monitorService = monitorService;
    this.blockListeners = new Map();
    this.transactionListeners = new Map();
    this.lastBlockNumbers = new Map();
    this.connectionStates = new Map();
    this.blockSubscriptionActive = new Map();
  }

  async startListening(): Promise<void> {
    if (this.isListening) {
      logger.warn('[WebSocketService] Already listening for events');
      return;
    }

    this.isListening = true;

    // Get all loaded configurations from ChainService
    const loadedConfigs = this.chainService.getLoadedConfigurations();

    // Start WebSocket listeners for all enabled chains
    for (const [key, config] of loadedConfigs) {
      const [chain, network] = key.split('-');
      await this.setupChainListener(chain, network);
    }

    logger.info('[WebSocketService] Started listening for blockchain events');
  }

  private async setupChainListener(
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;

    // Check if already connected or connecting
    const state = this.connectionStates.get(key);
    if (state === 'connected' || state === 'connecting') {
      logger.debug(
        `[WebSocketService] Already ${state} for ${chain}-${network}`
      );
      return;
    }

    this.connectionStates.set(key, 'connecting');

    try {
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (!provider) {
        logger.warn(
          `[WebSocketService] No WebSocket provider available for ${chain}-${network}`
        );
        this.connectionStates.set(key, 'disconnected');
        return;
      }

      // Set up WebSocket event handlers for disconnection
      const websocket = (provider as any).websocket;
      if (websocket) {
        websocket.on('close', () => {
          logger.info(
            `[WebSocketService] WebSocket closed for ${chain}-${network}`
          );
          this.handleDisconnection(chain, network);
        });

        websocket.on('error', (error: any) => {
          logger.error(
            `[WebSocketService] WebSocket error for ${chain}-${network}:`,
            error
          );
          this.handleDisconnection(chain, network);
        });
      }

      this.connectionStates.set(key, 'connected');
      logger.info(
        `[WebSocketService] WebSocket connected for ${chain}-${network}`
      );

      // Check if we need to start block subscription based on active transactions
      await this.updateBlockSubscription(chain, network);
    } catch (error) {
      logger.error(
        `[WebSocketService] Failed to setup listener for ${chain}-${network}:`,
        error
      );
      this.connectionStates.set(key, 'disconnected');
    }
  }

  private async handleDisconnection(
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;

    // Update state
    this.connectionStates.set(key, 'disconnected');

    // Remove block listener
    this.blockListeners.delete(key);

    // Remove the provider from ChainService
    this.chainService.removeProvider(chain, network);

    // Clear transaction listeners for this chain
    for (const [txKey, listener] of this.transactionListeners) {
      if (txKey.startsWith(key)) {
        this.transactionListeners.delete(txKey);
      }
    }

    logger.info(
      `[WebSocketService] Cleaned up after disconnection for ${chain}-${network}`
    );

    // Try to reconnect after a short delay
    setTimeout(() => {
      logger.info(
        `[WebSocketService] Attempting to reconnect ${chain}-${network}`
      );
      this.setupChainListener(chain, network);
    }, 5000);
  }

  private async updateBlockSubscription(
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;
    const activeTransactions = this.monitorService.getActiveTransactions();
    const chainTransactions = Array.from(activeTransactions.values()).filter(
      tx =>
        tx.chain === chain &&
        tx.network === network &&
        (tx.status === 'SENT' || tx.status === 'CONFIRMING')
    );

    const hasActiveTx = chainTransactions.length > 0;
    const isSubscribed = this.blockSubscriptionActive.get(key) || false;

    if (hasActiveTx && !isSubscribed) {
      // Need to start block subscription
      await this.startBlockSubscription(chain, network);
      logger.info(
        `[WebSocketService] Started block monitoring for ${chain}-${network} (${chainTransactions.length} active tx)`
      );
    } else if (!hasActiveTx && isSubscribed) {
      // Need to stop block subscription
      await this.stopBlockSubscription(chain, network);
      logger.info(
        `[WebSocketService] Stopped block monitoring for ${chain}-${network} (no active tx)`
      );
    } else if (hasActiveTx && isSubscribed) {
      logger.debug(
        `[WebSocketService] Block monitoring already active for ${chain}-${network} (${chainTransactions.length} tx)`
      );
    }
  }

  private async startBlockSubscription(
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;
    const provider = await this.chainService.getWebSocketProvider(
      chain,
      network
    );

    if (!provider) {
      logger.warn(
        `[WebSocketService] Cannot start block subscription - no provider for ${chain}-${network}`
      );
      return;
    }

    // Create block listener
    const blockListener = async (blockNumber: number) => {
      await this.handleNewBlock(chain, network, blockNumber);
    };

    // Clear any existing listeners on the provider
    provider.removeAllListeners('block');

    // Subscribe to new blocks
    provider.on('block', blockListener);
    this.blockListeners.set(key, blockListener);
    this.blockSubscriptionActive.set(key, true);
  }

  private async stopBlockSubscription(
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;
    const listener = this.blockListeners.get(key);

    if (listener) {
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (provider) {
        provider.removeListener('block', listener);
      }
      this.blockListeners.delete(key);
    }

    this.blockSubscriptionActive.set(key, false);
  }

  private async handleNewBlock(
    chain: string,
    network: string,
    blockNumber: number
  ): Promise<void> {
    const key = `${chain}-${network}`;

    // Track last block number
    const lastBlock = this.lastBlockNumbers.get(key) || 0;
    this.lastBlockNumbers.set(key, blockNumber);

    // Check for missed blocks (but limit to prevent spam)
    if (lastBlock > 0 && blockNumber > lastBlock + 1) {
      const missed = blockNumber - lastBlock - 1;
      if (missed <= 10) {
        logger.warn(
          `[WebSocketService] Missed ${missed} blocks on ${chain}-${network} (${lastBlock + 1} to ${blockNumber - 1})`
        );
      }
    }

    // Get active transactions for this chain
    const activeTransactions = this.monitorService.getActiveTransactions();
    const chainTransactions = Array.from(activeTransactions.values()).filter(
      tx =>
        tx.chain === chain &&
        tx.network === network &&
        (tx.status === 'SENT' || tx.status === 'CONFIRMING')
    );

    if (chainTransactions.length === 0) {
      // No active transactions - shouldn't happen as we only subscribe when there are active tx
      logger.debug(
        `[WebSocketService] Block ${blockNumber} on ${chain}-${network} - no active transactions`
      );
      // Stop subscription since there are no active transactions
      await this.updateBlockSubscription(chain, network);
      return;
    }

    logger.info(
      `📦 [WebSocketService] Block ${blockNumber} on ${chain}-${network} - checking ${chainTransactions.length} active tx`,
      {
        metadata: {
          chain,
          network,
          blockNumber,
          activeTxCount: chainTransactions.length,
          timestamp: new Date().toISOString(),
        },
      }
    );

    // For CONFIRMING transactions, just update confirmation count
    // For SENT transactions, check if they're included in this block
    const confirmingTxs = chainTransactions.filter(
      tx => tx.status === 'CONFIRMING'
    );
    const sentTxs = chainTransactions.filter(tx => tx.status === 'SENT');

    // Check CONFIRMING transactions (they're already in a block, just need confirmation updates)
    if (confirmingTxs.length > 0) {
      logger.debug(
        `[WebSocketService] Updating confirmations for ${confirmingTxs.length} CONFIRMING transactions`
      );
      for (const tx of confirmingTxs) {
        await this.monitorService.checkTransaction(tx.txHash);
      }
    }

    // For SENT transactions, check if they're in this new block
    if (sentTxs.length > 0) {
      logger.debug(
        `[WebSocketService] Checking if ${sentTxs.length} SENT transactions are in block ${blockNumber}`
      );

      // Get the block to see which transactions are included
      try {
        const provider = await this.chainService.getWebSocketProvider(
          chain,
          network
        );
        if (provider) {
          const block = await provider.getBlock(blockNumber, false); // false = don't need full tx details
          if (block && block.transactions.length > 0) {
            // Check if any of our SENT transactions are in this block
            const blockTxHashes = new Set(block.transactions);
            const includedTxs = sentTxs.filter(tx =>
              blockTxHashes.has(tx.txHash)
            );

            if (includedTxs.length > 0) {
              logger.info(
                `[WebSocketService] Found ${includedTxs.length} transactions in block ${blockNumber}`
              );
              for (const tx of includedTxs) {
                await this.monitorService.checkTransaction(tx.txHash);
              }
            }

            // For new transactions (less than 5 minutes old), check them even if not in block
            // This ensures we catch status changes quickly
            const now = Date.now();
            const newSentTxs = sentTxs.filter(tx => {
              const age = now - tx.lastChecked.getTime();
              return age < 300000 && !blockTxHashes.has(tx.txHash); // Less than 5 minutes old and not in block
            });

            if (newSentTxs.length > 0) {
              logger.debug(
                `[WebSocketService] Checking ${newSentTxs.length} new SENT transactions on block event`
              );
              for (const tx of newSentTxs) {
                await this.monitorService.checkTransaction(tx.txHash);
              }
            }
          }
        }
      } catch (error) {
        logger.error(
          `[WebSocketService] Error fetching block ${blockNumber} for tx checking:`,
          error
        );
        // Fallback to checking all SENT transactions
        for (const tx of sentTxs) {
          await this.monitorService.checkTransaction(tx.txHash);
        }
      }
    }
  }

  private watchTransaction(
    provider: ethers.WebSocketProvider,
    txHash: string,
    chain: string,
    network: string
  ): void {
    const key = `${chain}-${network}-${txHash}`;

    // Check if already watching
    if (this.transactionListeners.has(key)) {
      return;
    }

    logger.info(
      `[WebSocketService] Watching transaction ${txHash} on ${chain}-${network}`
    );

    // Create a listener for this specific transaction
    const listener = async (receipt: ethers.TransactionReceipt) => {
      logger.info(
        `[WebSocketService] Transaction ${txHash} confirmed on ${chain}-${network}`,
        {
          metadata: {
            blockNumber: receipt.blockNumber,
            status: receipt.status,
            gasUsed: receipt.gasUsed.toString(),
          },
        }
      );

      // Remove listener after confirmation
      this.transactionListeners.delete(key);

      // Trigger immediate check
      await this.monitorService.checkTransaction(txHash);
    };

    // Watch for transaction confirmation
    provider.once(txHash, listener);
    this.transactionListeners.set(key, listener as ethers.Listener);
  }

  async stopListening(): Promise<void> {
    this.isListening = false;

    // Clear all block listeners
    for (const [key, listener] of this.blockListeners) {
      const [chain, network] = key.split('-');
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (provider) {
        provider.removeListener('block', listener);
      }
    }
    this.blockListeners.clear();

    // Clear all transaction listeners
    for (const [key, listener] of this.transactionListeners) {
      const parts = key.split('-');
      const chain = parts[0];
      const network = parts[1];
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (provider) {
        provider.removeListener(parts[2], listener);
      }
    }
    this.transactionListeners.clear();

    // Clear states
    this.connectionStates.clear();
    this.lastBlockNumbers.clear();

    logger.info('[WebSocketService] Stopped listening for events');
  }

  getConnectionStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const [key, state] of this.connectionStates) {
      status.set(key, state === 'connected');
    }
    return status;
  }

  async addTransactionToWatch(
    txHash: string,
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}`;
    const state = this.connectionStates.get(key);

    if (state === 'connected') {
      // Update block subscription if needed
      await this.updateBlockSubscription(chain, network);

      logger.info(
        `[WebSocketService] Added transaction ${txHash} to watch on ${chain}-${network}`
      );
    } else {
      logger.warn(
        `[WebSocketService] Cannot add transaction to watch - not connected to ${chain}-${network}`
      );
    }
  }

  async removeTransactionFromWatch(
    txHash: string,
    chain: string,
    network: string
  ): Promise<void> {
    const key = `${chain}-${network}-${txHash}`;

    // Remove individual transaction listener if exists
    const listener = this.transactionListeners.get(key);
    if (listener) {
      const provider = await this.chainService.getWebSocketProvider(
        chain,
        network
      );
      if (provider) {
        provider.removeListener(txHash, listener);
      }
      this.transactionListeners.delete(key);
    }

    // Update block subscription - might need to stop if no more active tx
    await this.updateBlockSubscription(chain, network);

    logger.info(
      `[WebSocketService] Removed transaction ${txHash} from watch on ${chain}-${network}`
    );
  }

  async shutdown(): Promise<void> {
    await this.stopListening();
  }
}
