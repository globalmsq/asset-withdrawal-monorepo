import { logger } from '@asset-withdrawal/shared';
import { MonitorService } from './monitor.service';
import { config } from '../config';
import { PollingTier } from '../types';

export class PollingService {
  private monitorService: MonitorService;
  private pollingIntervals: Map<string, NodeJS.Timeout>;
  private isPolling: boolean = false;
  private lastPollTime: Map<string, Date>;

  constructor(monitorService: MonitorService) {
    this.monitorService = monitorService;
    this.pollingIntervals = new Map();
    this.lastPollTime = new Map();
  }

  async startPolling(): Promise<void> {
    if (this.isPolling) {
      logger.warn('[PollingService] Already polling');
      return;
    }

    this.isPolling = true;

    // Start three polling tiers
    this.startTierPolling('fast');
    this.startTierPolling('medium');
    this.startTierPolling('full');

    logger.info('[PollingService] Started three-tier polling system');
  }

  private startTierPolling(tierName: 'fast' | 'medium' | 'full'): void {
    const tier = config.pollingTiers[tierName];

    // Immediate first poll
    this.pollTier(tierName);

    // For fast tier, use dual-speed polling
    if (tierName === 'fast') {
      // Poll every minute for new transactions, even though config says 5 minutes
      const fastInterval = 60000; // 1 minute for fast checks
      const interval = setInterval(async () => {
        await this.pollTier(tierName);
      }, fastInterval);

      this.pollingIntervals.set(tierName, interval);
      logger.info(
        `[PollingService] Started ${tierName} tier polling with enhanced speed (interval: ${fastInterval}ms for new tx, config: ${tier.interval}ms)`
      );
    } else {
      // Set up normal interval for medium and full tiers
      const interval = setInterval(async () => {
        await this.pollTier(tierName);
      }, tier.interval);

      this.pollingIntervals.set(tierName, interval);
      logger.info(
        `[PollingService] Started ${tierName} tier polling (interval: ${tier.interval}ms)`
      );
    }
  }

  private async pollTier(tierName: 'fast' | 'medium' | 'full'): Promise<void> {
    const startTime = Date.now();
    const tier = config.pollingTiers[tierName];

    try {
      // Get transactions for this tier
      const transactions = this.monitorService.getTransactionsByTier(tierName);

      if (transactions.length === 0) {
        logger.debug(
          `[PollingService] No transactions to poll in ${tierName} tier`
        );
        this.lastPollTime.set(tierName, new Date());
        return;
      }

      logger.info(
        `[PollingService] Polling ${transactions.length} transactions in ${tierName} tier`
      );

      // Process in batches
      const batchSize = tier.batchSize;
      let processed = 0;
      let confirmed = 0;
      let failed = 0;

      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(
          i,
          Math.min(i + batchSize, transactions.length)
        );
        const results = await this.monitorService.checkBatch(batch);

        // Count results
        for (const [txHash, result] of results.entries()) {
          processed++;
          if (result) {
            if (result.status === 'CONFIRMED') confirmed++;
            if (result.status === 'FAILED') failed++;
          }
        }

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < transactions.length) {
          await this.delay(config.monitoring.batchDelay);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `[PollingService] ${tierName} tier poll completed: ` +
          `${processed} processed, ${confirmed} confirmed, ${failed} failed ` +
          `(${duration}ms)`
      );

      this.lastPollTime.set(tierName, new Date());
    } catch (error) {
      logger.error(
        `[PollingService] Error in ${tierName} tier polling:`,
        error
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stopPolling(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    this.isPolling = false;

    // Clear all intervals
    for (const [tier, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
      logger.info(`[PollingService] Stopped ${tier} tier polling`);
    }

    this.pollingIntervals.clear();
    logger.info('[PollingService] Stopped all polling');
  }

  getPollingStatus(): {
    isPolling: boolean;
    tiers: {
      name: string;
      lastPoll: Date | null;
      interval: number;
      transactionCount: number;
    }[];
  } {
    const tiers = ['fast', 'medium', 'full'] as const;

    return {
      isPolling: this.isPolling,
      tiers: tiers.map(tierName => ({
        name: tierName,
        lastPoll: this.lastPollTime.get(tierName) || null,
        interval: config.pollingTiers[tierName].interval,
        transactionCount:
          this.monitorService.getTransactionsByTier(tierName).length,
      })),
    };
  }

  // Force poll a specific tier (useful for testing or manual triggers)
  async forcePoll(tierName: 'fast' | 'medium' | 'full'): Promise<void> {
    logger.info(`[PollingService] Force polling ${tierName} tier`);
    await this.pollTier(tierName);
  }

  // Get tier statistics
  getTierStats(): Map<
    string,
    {
      interval: number;
      maxAge: number;
      batchSize: number;
      lastPoll: Date | null;
      activeTransactions: number;
    }
  > {
    const stats = new Map();
    const tiers = ['fast', 'medium', 'full'] as const;

    for (const tierName of tiers) {
      const tier = config.pollingTiers[tierName];
      stats.set(tierName, {
        interval: tier.interval,
        maxAge: tier.maxAge,
        batchSize: tier.batchSize,
        lastPoll: this.lastPollTime.get(tierName) || null,
        activeTransactions:
          this.monitorService.getTransactionsByTier(tierName).length,
      });
    }

    return stats;
  }

  // Optimize polling based on transaction age distribution
  optimizePolling(): void {
    const activeTransactions = this.monitorService.getActiveTransactions();
    const now = Date.now();

    // Analyze transaction age distribution
    const ageDistribution = {
      fast: 0, // < 5 minutes
      medium: 0, // 5 minutes - 1 hour
      full: 0, // > 1 hour
    };

    for (const [_, tx] of activeTransactions) {
      const age = now - tx.lastChecked.getTime();
      if (age < config.pollingTiers.fast.maxAge) {
        ageDistribution.fast++;
      } else if (age < config.pollingTiers.medium.maxAge) {
        ageDistribution.medium++;
      } else {
        ageDistribution.full++;
      }
    }

    logger.info(
      `[PollingService] Transaction age distribution - fast: ${ageDistribution.fast}, medium: ${ageDistribution.medium}, full: ${ageDistribution.full}`
    );

    // Could implement dynamic interval adjustment based on distribution
    // For now, just log the information for monitoring
  }
}
