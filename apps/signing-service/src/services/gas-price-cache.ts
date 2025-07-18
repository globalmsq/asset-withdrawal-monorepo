export interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface CachedGasPrice extends GasPrice {
  timestamp: number;
}

export class GasPriceCache {
  private cache: CachedGasPrice | null = null;
  private readonly cacheDuration: number;

  constructor(cacheDurationSeconds: number = 30) {
    this.cacheDuration = cacheDurationSeconds * 1000; // Convert to milliseconds
  }

  /**
   * Get cached gas price if still valid
   */
  get(): GasPrice | null {
    if (!this.cache) {
      return null;
    }

    const now = Date.now();
    if (now - this.cache.timestamp > this.cacheDuration) {
      // Cache expired
      this.cache = null;
      return null;
    }

    return {
      maxFeePerGas: this.cache.maxFeePerGas,
      maxPriorityFeePerGas: this.cache.maxPriorityFeePerGas,
    };
  }

  /**
   * Update cache with new gas price
   */
  set(gasPrice: GasPrice): void {
    this.cache = {
      ...gasPrice,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if cache is valid
   */
  isValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const now = Date.now();
    return now - this.cache.timestamp <= this.cacheDuration;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache = null;
  }
}
