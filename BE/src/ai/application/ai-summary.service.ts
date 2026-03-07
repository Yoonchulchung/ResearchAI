import { Injectable } from '@nestjs/common';
import { SummaryJobService, SummaryEvent, SummaryJob } from './summary-job.service';
import { SessionsService } from '../../sessions/application/sessions.service';
import { streamOllama } from '../infrastructure/ollama.ai';

@Injectable()
export class AiSummaryService {
  constructor(
    private readonly summaryJobService: SummaryJobService,
    private readonly sessionsService: SessionsService,
  ) {}

  /**
   * 서머리 생성 작업을 백그라운드에서 시작한다.
   * 같은 jobId로 이미 실행 중이거나 완료된 경우엔 새 작업을 시작하지 않는다 (멱등성).
   */
  startSummaryJob(jobId: string, sessionId: string, model?: string): void {
    this.summaryJobService.create(jobId);

    (async () => {
      const log = (message: string) => this.summaryJobService.push(jobId, { type: 'log', message });

      try {
        // 이미 저장된 서머리가 있으면 그대로 전송
        const { summary: existing } = await this.sessionsService.getSummary(sessionId);
        if (existing) {
          log('저장된 서머리를 불러옵니다...');
          this.summaryJobService.push(jobId, { type: 'chunk', text: existing });
          this.summaryJobService.push(jobId, { type: 'done' });
          return;
        }

        log('리서치 결과를 수집하는 중...');
        const ctx = await this.sessionsService.buildSummaryContext(sessionId);
        if (!ctx) {
          this.summaryJobService.push(jobId, { type: 'error', message: '완료된 태스크가 없습니다.' });
          return;
        }

        const targetModel = (model || ctx.model).replace(/^ollama:/, '');
        log(`로컬 LLM 호출 중... (${targetModel})`);

        let fullText = '';
        let isFirstChunk = true;
        for await (const chunk of streamOllama(targetModel, ctx.system, ctx.prompt)) {
          if (isFirstChunk) {
            log('서머리 생성 중...');
            isFirstChunk = false;
          }
          fullText += chunk;
          this.summaryJobService.push(jobId, { type: 'chunk', text: chunk });
        }

        if (fullText) this.sessionsService.saveSummary(sessionId, fullText);
        this.summaryJobService.push(jobId, { type: 'done' });
      } catch (e: any) {
        this.summaryJobService.push(jobId, { type: 'error', message: e?.message ?? '서머리 생성 실패' });
      } finally {
        this.summaryJobService.complete(jobId);
      }
    })();
  }

  getSummaryJob(jobId: string): SummaryJob | undefined {
    return this.summaryJobService.get(jobId);
  }

  replaySummaryJob(
    jobId: string,
    onEvent: (event: SummaryEvent) => void,
    onDone: () => void,
  ): (() => void) | null {
    return this.summaryJobService.replay(jobId, onEvent, onDone);
  }
}
