import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ContentRefreshStateEntity } from '../../../shared/entity/content-refresh-state.entity';
import { ExamEventEntity } from '../../domain/exam/entity/exam-event.entity';
import type { ExamEvent, ExamEventListResult } from '../../domain/exam/exam-event.types';
import { DataqExamProvider } from '../../infrastructure/exam/dataq-exam.provider';

const MONTHLY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 6 * 60 * 60 * 1000;
const REFRESH_STATE_KEY = 'content-refresh:exams';

@Injectable()
export class ExamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<string[]> | null = null;

  constructor(
    @InjectRepository(ExamEventEntity)
    private readonly eventRepo: Repository<ExamEventEntity>,
    @InjectRepository(ContentRefreshStateEntity)
    private readonly refreshStateRepo: Repository<ContentRefreshStateEntity>,
    private readonly dataqProvider: DataqExamProvider,
  ) {}

  onModuleInit() {
    setTimeout(() => {
      this.refreshCacheIfStale().catch((error) => {
        this.logger.warn(error instanceof Error ? error.message : '시험 일정 자동 수집에 실패했습니다.');
      });
    }, 5_000);

    this.refreshTimer = setInterval(() => {
      this.refreshCacheIfStale().catch((error) => {
        this.logger.warn(error instanceof Error ? error.message : '시험 일정 자동 수집에 실패했습니다.');
      });
    }, REFRESH_CHECK_MS);
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async getEvents(options: { from?: string; to?: string; refresh?: boolean } = {}): Promise<ExamEventListResult> {
    const cachedCount = await this.eventRepo.count();
    let errors: string[] = [];

    if (options.refresh || cachedCount === 0) {
      errors = await this.refreshCache(options.from, options.to);
    } else {
      this.refreshCacheIfStale().catch((error) => {
        this.logger.warn(error instanceof Error ? error.message : '시험 일정 백그라운드 수집에 실패했습니다.');
      });
    }

    const items = await this.readCachedEvents(options.from, options.to);
    return {
      items,
      total: items.length,
      fetchedAt: await this.getLastRefreshAt(),
      errors,
    };
  }

  async refreshCache(from?: string, to?: string): Promise<string[]> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.collectAndStoreEvents(from, to)
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async refreshCacheIfStale(): Promise<void> {
    const lastRefreshAt = await this.getLastRefreshAt();
    const empty = (await this.eventRepo.count()) === 0;
    if (!empty && lastRefreshAt && Date.now() - new Date(lastRefreshAt).getTime() < MONTHLY_REFRESH_MS) return;
    await this.refreshCache();
  }

  private async collectAndStoreEvents(from?: string, to?: string): Promise<string[]> {
    const { startMs, endMs } = this.resolveFetchWindow(from, to);
    try {
      const events = await this.dataqProvider.fetchEvents(startMs, endMs);
      if (events.length > 0) {
        await this.eventRepo.save(events.map((event) => this.toEntity(event)));
      }
      await this.setLastRefreshAt(new Date().toISOString());
      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DATAQ 시험 일정 수집에 실패했습니다.';
      this.logger.warn(message);
      return [message];
    }
  }

  private async readCachedEvents(from?: string, to?: string): Promise<ExamEvent[]> {
    const where = this.resolveReadWindow(from, to);
    const entities = await this.eventRepo.find({
      where,
      order: { start: 'ASC', end: 'ASC', title: 'ASC' },
    });
    return entities.map((entity) => this.toEvent(entity));
  }

  private resolveFetchWindow(from?: string, to?: string): { startMs: number; endMs: number } {
    const now = new Date();
    const start = from ? this.parseDateParam(from) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = to ? this.parseDateParam(to) : new Date(now.getFullYear(), now.getMonth() + 13, 1);
    return {
      startMs: this.validDateOr(start, new Date(now.getFullYear(), now.getMonth() - 1, 1)).getTime(),
      endMs: this.validDateOr(end, new Date(now.getFullYear(), now.getMonth() + 13, 1)).getTime(),
    };
  }

  private resolveReadWindow(from?: string, to?: string) {
    if (!from && !to) return {};
    const fallbackStart = new Date(0);
    const fallbackEnd = new Date(8640000000000000);
    const start = from ? this.validDateOr(this.parseDateParam(from), fallbackStart) : fallbackStart;
    const end = to ? this.validDateOr(this.parseDateParam(to), fallbackEnd) : fallbackEnd;
    return { start: Between(start.toISOString(), end.toISOString()) };
  }

  private parseDateParam(value: string): Date {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return new Date(Number(trimmed));
    return new Date(trimmed);
  }

  private validDateOr(date: Date, fallback: Date): Date {
    return Number.isNaN(date.getTime()) ? fallback : date;
  }

  private toEntity(event: ExamEvent): ExamEventEntity {
    return this.eventRepo.create({
      id: event.id,
      source: event.source,
      groupId: event.groupId,
      phase: event.phase || null,
      title: event.title,
      shortTitle: event.shortTitle || null,
      start: event.start,
      end: event.end,
      examOperationSeq: event.examOperationSeq,
      description: event.description || null,
      sourceUrl: event.sourceUrl,
      collectedAt: event.collectedAt,
    });
  }

  private toEvent(entity: ExamEventEntity): ExamEvent {
    return {
      id: entity.id,
      source: entity.source,
      groupId: entity.groupId,
      phase: entity.phase ?? '',
      title: entity.title,
      shortTitle: entity.shortTitle ?? entity.title,
      start: entity.start,
      end: entity.end,
      examOperationSeq: entity.examOperationSeq,
      description: entity.description ?? entity.title,
      sourceUrl: entity.sourceUrl,
      collectedAt: entity.collectedAt,
    };
  }

  private async getLastRefreshAt(): Promise<string | null> {
    const state = await this.refreshStateRepo.findOne({ where: { key: REFRESH_STATE_KEY } });
    return state?.refreshedAt ?? null;
  }

  private async setLastRefreshAt(refreshedAt: string): Promise<void> {
    await this.refreshStateRepo.save({ key: REFRESH_STATE_KEY, refreshedAt });
  }
}
