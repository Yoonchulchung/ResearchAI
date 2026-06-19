import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { randomUUID } from 'crypto';
import type { ImageContentBlock } from 'src/ai/infrastructure/provider/vlm.types';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';

interface OcrJob {
  subject: Subject<MessageEvent>;
  abortController: AbortController;
}

@Injectable()
export class ImageOcrQueueService implements OnModuleDestroy {
  private jobs = new Map<string, OcrJob>();

  constructor(private readonly aiProvider: AiProviderService) {}

  onModuleDestroy() {
    for (const { subject, abortController } of this.jobs.values()) {
      abortController.abort();
      subject.complete();
    }
    this.jobs.clear();
  }

  enqueue(
    buffer: Buffer,
    mimetype: string,
    filename: string,
    model = 'gemini-2.0-flash',
  ): string {
    const jobId = randomUUID();
    const subject = new Subject<MessageEvent>();
    const abortController = new AbortController();

    this.jobs.set(jobId, { subject, abortController });

    this.run(
      jobId,
      buffer,
      mimetype,
      model,
      subject,
      abortController.signal,
    ).catch((e) => {
      if (!abortController.signal.aborted) {
        subject.next({
          data: {
            type: 'error',
            message: e instanceof Error ? e.message : '오류',
          },
        });
        subject.complete();
      }
      this.jobs.delete(jobId);
    });

    return jobId;
  }

  getStream(jobId: string): Observable<MessageEvent> | null {
    return this.jobs.get(jobId)?.subject ?? null;
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.abortController.abort();
    job.subject.next({ data: { type: 'error', message: '취소되었습니다.' } });
    job.subject.complete();
    this.jobs.delete(jobId);
  }

  private async run(
    jobId: string,
    buffer: Buffer,
    mimetype: string,
    model: string,
    subject: Subject<MessageEvent>,
    signal: AbortSignal,
  ) {
    const image: ImageContentBlock = {
      type: 'image',
      mediaType: this.toMediaType(mimetype),
      data: buffer.toString('base64'),
    };
    const system = [
      '너는 채용공고 이미지에서 텍스트를 추출하는 OCR 도우미다.',
      '이미지에 보이는 채용공고/JD 텍스트를 빠짐없이 한국어 원문 중심으로 전사한다.',
      '추측, 요약, 설명은 하지 말고 텍스트만 출력한다.',
      '레이아웃이 있으면 제목, 섹션, 불릿의 줄바꿈을 최대한 유지한다.',
    ].join('\n');
    const prompt =
      '이 이미지의 채용공고/JD 텍스트를 추출해줘. 텍스트만 출력해.';

    for await (const chunk of this.aiProvider.stream(model, system, [
      { role: 'user', content: [prompt, image] },
    ])) {
      if (signal.aborted) break;
      subject.next({ data: { type: 'chunk', text: chunk } });
    }

    if (!signal.aborted) {
      subject.next({ data: { type: 'done' } });
      subject.complete();
    }
    this.jobs.delete(jobId);
  }

  private toMediaType(mimetype: string): ImageContentBlock['mediaType'] {
    if (mimetype === 'image/png') return 'image/png';
    if (mimetype === 'image/gif') return 'image/gif';
    if (mimetype === 'image/webp') return 'image/webp';
    return 'image/jpeg';
  }
}
