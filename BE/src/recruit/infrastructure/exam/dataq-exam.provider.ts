import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ExamEvent } from 'src/recruit/domain/exam/exam-event.types';

interface DataqEventResponse {
  pgsggb?: string;
  groupId?: string;
  start?: string;
  end?: string;
  title2?: string;
  title?: string;
  examoprSeq?: number;
  url?: string;
}

const DATAQ_EVENTS_URL = 'https://www.dataq.or.kr/www/events.dox';
const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class DataqExamProvider {
  async fetchEvents(startMs: number, endMs: number): Promise<ExamEvent[]> {
    const params = new URLSearchParams({
      start: String(startMs),
      end: String(endMs),
    });
    const url = `${DATAQ_EVENTS_URL}?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json, text/plain, */*',
          'user-agent': 'Mozilla/5.0 ResearchAI Exam Collector',
        },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(`DATAQ 일정 요청 실패: HTTP ${response.status}`);

      const data = (await response.json()) as DataqEventResponse[];
      const collectedAt = new Date().toISOString();
      return data
        .filter((event) => event.start && event.end && event.title)
        .map((event) => this.toExamEvent(event, collectedAt));
    } finally {
      clearTimeout(timeout);
    }
  }

  private toExamEvent(
    event: DataqEventResponse,
    collectedAt: string,
  ): ExamEvent {
    const groupId = event.groupId || 'unknown';
    const phase = event.pgsggb || '';
    const title = event.title || event.title2 || '';
    const shortTitle = event.title2 || title;
    const description = event.url || title;
    const id = this.createId(event);

    return {
      id,
      source: 'dataq',
      groupId,
      phase,
      title,
      shortTitle,
      start: event.start || '',
      end: event.end || '',
      examOperationSeq:
        typeof event.examoprSeq === 'number' ? event.examoprSeq : null,
      description,
      sourceUrl: DATAQ_EVENTS_URL,
      collectedAt,
    };
  }

  private createId(event: DataqEventResponse): string {
    const key = [
      event.examoprSeq ?? '',
      event.groupId ?? '',
      event.pgsggb ?? '',
      event.start ?? '',
      event.end ?? '',
      event.title ?? '',
      event.url ?? '',
    ].join('|');
    return `dataq-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
  }
}
