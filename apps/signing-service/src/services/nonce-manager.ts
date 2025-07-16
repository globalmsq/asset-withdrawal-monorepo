import { PolygonProvider } from './polygon-provider';
import { Logger } from '../utils/logger';

export class NonceManager {
  private address: string | null = null;
  private currentNonce: number | null = null;
  private pendingNonces: Set<number> = new Set();
  private lastUpdate: number = 0;
  private readonly cacheTimeout = 30000; // 30 seconds
  private lock: Promise<void> = Promise.resolve();
  
  constructor(
    private polygonProvider: PolygonProvider,
    private logger: Logger
  ) {}
  
  async initialize(address: string): Promise<void> {
    this.address = address;
    await this.refreshNonce();
    this.logger.info('Nonce manager initialized', { address, nonce: this.currentNonce });
  }
  
  async getNextNonce(): Promise<number> {
    if (!this.address) {
      throw new Error('Nonce manager not initialized');
    }
    
    // Use lock to ensure thread safety
    await this.lock;
    
    const lockPromise = (async () => {
      try {
        // Refresh if cache expired or too many pending
        if (this.shouldRefresh()) {
          await this.refreshNonce();
        }
        
        if (this.currentNonce === null) {
          throw new Error('Failed to get current nonce');
        }
        
        // Find next available nonce
        let nonce = this.currentNonce;
        while (this.pendingNonces.has(nonce)) {
          nonce++;
        }
        
        // Update current nonce for next request
        this.currentNonce = nonce + 1;
        
        this.logger.debug('Allocated nonce', { nonce, pending: this.pendingNonces.size });
        
        return nonce;
      } catch (error) {
        this.logger.error('Failed to get next nonce', error);
        throw error;
      }
    })();
    
    this.lock = lockPromise.catch(() => undefined).then(() => undefined);
    
    return lockPromise;
  }
  
  markNoncePending(nonce: number): void {
    this.pendingNonces.add(nonce);
    this.logger.debug('Marked nonce as pending', { nonce, total: this.pendingNonces.size });
  }
  
  markNonceConfirmed(nonce: number): void {
    this.pendingNonces.delete(nonce);
    this.logger.debug('Marked nonce as confirmed', { nonce, remaining: this.pendingNonces.size });
  }
  
  private shouldRefresh(): boolean {
    const now = Date.now();
    const cacheExpired = now - this.lastUpdate > this.cacheTimeout;
    const tooManyPending = this.pendingNonces.size > 10;
    
    return cacheExpired || tooManyPending;
  }
  
  private async refreshNonce(): Promise<void> {
    if (!this.address) {
      throw new Error('Address not set');
    }
    
    try {
      const provider = this.polygonProvider.getProvider();
      const onChainNonce = await provider.getTransactionCount(this.address, 'pending');
      
      // Clear old pending nonces that have been confirmed
      const pendingArray = Array.from(this.pendingNonces);
      this.pendingNonces.clear();
      
      for (const nonce of pendingArray) {
        if (nonce >= onChainNonce) {
          this.pendingNonces.add(nonce);
        }
      }
      
      // Update current nonce
      this.currentNonce = onChainNonce;
      this.lastUpdate = Date.now();
      
      this.logger.debug('Refreshed nonce', {
        nonce: this.currentNonce,
        pending: this.pendingNonces.size,
      });
    } catch (error) {
      this.logger.error('Failed to refresh nonce', error);
      throw error;
    }
  }
  
  async reset(): Promise<void> {
    this.pendingNonces.clear();
    await this.refreshNonce();
    this.logger.info('Nonce manager reset', { nonce: this.currentNonce });
  }
}