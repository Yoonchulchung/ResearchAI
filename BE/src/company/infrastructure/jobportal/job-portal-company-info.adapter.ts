import { Logger } from '@nestjs/common';
import { SessionGateway } from 'src/sessions/presentation/session.gateway';

interface CacheEntry<T> {
  result: T | null;
  cachedAt: number;
}

export abstract class JobPortalCompanyInfoAdapter<T> {
  protected readonly logger = new Logger(this.constructor.name);

  private readonly cache = new Map<string, CacheEntry<T>>();
  private queue: Promise<void> = Promise.resolve();
  protected lastRequestAt = 0;
  private pendingCount = 0;
  private runningCount = 0;

  protected abstract readonly sourceName: string;
  protected readonly minIntervalMs: number = 3000;
  protected readonly cacheTtlMs: number = 24 * 60 * 60 * 1000;

  constructor(protected readonly gateway?: SessionGateway) {}

  getStatus() {
    return {
      name: this.sourceName,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async fetchCompanyInfo(
    companyName: string,
    { force = false } = {},
  ): Promise<T | null> {
    const key = companyName.trim().toLowerCase();
    if (!force) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs)
        return cached.result;
    }

    this.pendingCount++;
    this.gateway?.updateDataSourceStatus(this.getStatus());
    const result = await this.enqueue(() => this.fetchWithDelay(companyName));
    this.cache.set(key, { result, cachedAt: Date.now() });
    return result;
  }

  private enqueue<U>(fn: () => Promise<U>): Promise<U> {
    const next = this.queue.then(async () => {
      this.pendingCount--;
      this.runningCount++;
      this.gateway?.updateDataSourceStatus(this.getStatus());
      try {
        return await fn();
      } finally {
        this.runningCount--;
        this.gateway?.updateDataSourceStatus(this.getStatus());
      }
    });
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async fetchWithDelay(companyName: string): Promise<T | null> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs)
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    this.lastRequestAt = Date.now();
    return this.doFetch(companyName);
  }

  protected abstract doFetch(companyName: string): Promise<T | null>;
}
