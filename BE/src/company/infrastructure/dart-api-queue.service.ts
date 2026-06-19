import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DartFinancialData } from 'src/company/infrastructure/dart/dart-types';
import type { SessionGateway } from 'src/sessions/presentation/session.gateway';

// DART API: 여러 회사를 동시에 조회하면 각각 4개 이상 요청이 쌓여 오류 발생
// → 회사 단위로 직렬화, 최소 1초 간격 유지
const MIN_INTERVAL_MS = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry {
  result: DartFinancialData | null;
  cachedAt: number;
}

@Injectable()
export class DartApiQueueService {
  private readonly logger = new Logger(DartApiQueueService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private pendingCount = 0;
  private runningCount = 0;

  constructor(@Optional() private readonly gateway?: SessionGateway) {}

  getStatus() {
    return {
      name: 'dart' as const,
      pending: this.pendingCount,
      running: this.runningCount,
      cacheSize: this.cache.size,
    };
  }

  async run(
    cacheKey: string,
    fn: () => Promise<DartFinancialData | null>,
  ): Promise<DartFinancialData | null> {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      this.logger.debug(`[DartQueue] 캐시 사용 — "${cacheKey}"`);
      return cached.result;
    }

    this.pendingCount++;
    this.gateway?.updateDataSourceStatus(this.getStatus());
    return this.enqueue(async () => {
      this.pendingCount--;
      this.runningCount++;
      this.gateway?.updateDataSourceStatus(this.getStatus());
      try {
        const fresh = this.cache.get(cacheKey);
        if (fresh && Date.now() - fresh.cachedAt < CACHE_TTL_MS)
          return fresh.result;

        const elapsed = Date.now() - this.lastRequestAt;
        if (elapsed < MIN_INTERVAL_MS) {
          await new Promise<void>((r) =>
            setTimeout(r, MIN_INTERVAL_MS - elapsed),
          );
        }
        this.lastRequestAt = Date.now();

        const result = await fn();
        this.cache.set(cacheKey, { result, cachedAt: Date.now() });
        return result;
      } finally {
        this.runningCount--;
        this.gateway?.updateDataSourceStatus(this.getStatus());
      }
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => fn());
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
