import { Logger } from '../../utils/logger';
import { PolygonProvider } from './polygon-provider';

export class NonceManager {
  private logger = new Logger('NonceManager');
  private currentNonce: number | null = null;
  private pendingNonces: Set<number> = new Set();
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private lock: Promise<void> = Promise.resolve();

  constructor(
    private provider: PolygonProvider,
    private address: string
  ) {}

  setAddress(address: string): void {
    this.address = address;
    this.reset();
  }

  async getNextNonce(): Promise<number> {
    return this.withLock(async () => {
      // Fetch fresh nonce if cache is expired or not initialized
      if (this.shouldRefreshNonce()) {
        await this.refreshNonce();
      }

      if (this.currentNonce === null) {
        throw new Error('Failed to get nonce');
      }

      const nonce = this.currentNonce;
      this.pendingNonces.add(nonce);
      this.currentNonce++;

      this.logger.debug(`Allocated nonce ${nonce} for address ${this.address}`);
      return nonce;
    });
  }

  async releaseNonce(nonce?: number): Promise<void> {
    return this.withLock(async () => {
      if (nonce !== undefined) {
        this.pendingNonces.delete(nonce);

        // If this was the highest nonce, we can decrement current nonce
        if (this.currentNonce !== null && nonce === this.currentNonce - 1) {
          this.currentNonce--;
        }

        this.logger.debug(`Released nonce ${nonce}`);
      } else if (this.currentNonce !== null && this.currentNonce > 0) {
        // Release the last allocated nonce
        this.currentNonce--;
        this.pendingNonces.delete(this.currentNonce);
        this.logger.debug(`Released last nonce ${this.currentNonce}`);
      }
    });
  }

  async confirmNonce(nonce: number): Promise<void> {
    return this.withLock(async () => {
      this.pendingNonces.delete(nonce);
      this.logger.debug(`Confirmed nonce ${nonce}`);
    });
  }

  reset(): void {
    this.currentNonce = null;
    this.pendingNonces.clear();
    this.lastFetchTime = 0;
    this.logger.info('Nonce manager reset');
  }

  private shouldRefreshNonce(): boolean {
    return (
      this.currentNonce === null ||
      Date.now() - this.lastFetchTime > this.CACHE_DURATION ||
      this.pendingNonces.size > 10 // Refresh if too many pending
    );
  }

  private async refreshNonce(): Promise<void> {
    try {
      const onChainNonce = await this.provider.getTransactionCount(this.address, 'pending');

      // If we have pending nonces, use the highest one + 1
      const maxPendingNonce = Math.max(...Array.from(this.pendingNonces), -1);
      const nextNonce = Math.max(onChainNonce, maxPendingNonce + 1);

      this.currentNonce = nextNonce;
      this.lastFetchTime = Date.now();

      this.logger.info(`Refreshed nonce: ${this.currentNonce} for address ${this.address}`);
    } catch (error) {
      this.logger.error('Failed to refresh nonce', error);
      throw error;
    }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const currentLock = this.lock;
    let releaseLock: () => void;

    this.lock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      await currentLock;
      return await fn();
    } finally {
      releaseLock!();
    }
  }

  getStatus(): {
    address: string;
    currentNonce: number | null;
    pendingCount: number;
    lastFetchTime: number;
    } {
    return {
      address: this.address,
      currentNonce: this.currentNonce,
      pendingCount: this.pendingNonces.size,
      lastFetchTime: this.lastFetchTime,
    };
  }
}
