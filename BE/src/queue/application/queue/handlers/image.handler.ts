import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { BaseJobHandler, JobResult } from './base-job-handler';
import { QueueJob, SseEventType } from 'src/queue/domain/queue-job.model';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import type { ImageContentBlock } from 'src/ai/application/ai-provider.types';

interface PendingImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ImageHandler extends BaseJobHandler {
  readonly taskTypes = [QueueJob.TaskType.IMAGE_OCR] as const;

  private subjects = new Map<string, Subject<MessageEvent>>();
  // 이미지 버퍼는 itemContent에 직렬화하지 않고 별도 맵으로 관리
  private pendingImages = new Map<string, PendingImage>();

  constructor(private readonly aiProvider: AiProviderService) {
    super();
  }

  /** pushJob() 호출 전에 반드시 먼저 호출해야 한다 */
  storeImage(jobId: string, buffer: Buffer, mimetype: string): void {
    this.pendingImages.set(jobId, { buffer, mimetype });
  }

  setupChannel(channelId: string, _taskType: QueueJob.TaskType): void {
    this.subjects.set(channelId, new Subject<MessageEvent>());
  }

  getStream(
    channelId: string,
    _taskType: QueueJob.TaskType,
  ): Observable<MessageEvent> | null {
    return this.subjects.get(channelId) ?? null;
  }

  cancelChannel(channelId: string, _taskType: QueueJob.TaskType): void {
    const subject = this.subjects.get(channelId);
    subject?.next({
      data: { type: SseEventType.ERROR, message: '취소되었습니다.' },
    });
    subject?.complete();
    this.subjects.delete(channelId);
    this.pendingImages.delete(channelId);
  }

  async execute(job: QueueJob, signal: AbortSignal): Promise<JobResult> {
    const subject = this.subjects.get(job.jobId);
    const pending = this.pendingImages.get(job.jobId);
    if (!pending) {
      subject?.next({
        data: {
          type: SseEventType.ERROR,
          message: '이미지 데이터를 찾을 수 없습니다.',
        },
      });
      subject?.complete();
      this.subjects.delete(job.jobId);
      return {};
    }

    const { buffer, mimetype } = pending;
    this.pendingImages.delete(job.jobId);

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

    let fullText = '';
    for await (const chunk of this.aiProvider.stream(job.CloudAIModel, system, [
      {
        role: 'user',
        content: [
          '이 이미지의 채용공고/JD 텍스트를 추출해줘. 텍스트만 출력해.',
          image,
        ],
      },
    ])) {
      if (signal.aborted) break;
      fullText += chunk;
      subject?.next({ data: { type: 'chunk', text: chunk } });
    }

    if (!signal.aborted) {
      subject?.next({ data: { type: 'done' } });
      subject?.complete();
      this.subjects.delete(job.jobId);
    }
    return { result: fullText };
  }

  dispatchError(job: QueueJob, msg: string): void {
    const subject = this.subjects.get(job.jobId);
    subject?.next({ data: { type: SseEventType.ERROR, message: msg } });
    subject?.complete();
    this.subjects.delete(job.jobId);
    this.pendingImages.delete(job.jobId);
  }

  cleanupAll(): void {
    for (const s of this.subjects.values()) s.complete();
    this.pendingImages.clear();
  }

  private toMediaType(mimetype: string): ImageContentBlock['mediaType'] {
    if (mimetype === 'image/png') return 'image/png';
    if (mimetype === 'image/gif') return 'image/gif';
    if (mimetype === 'image/webp') return 'image/webp';
    return 'image/jpeg';
  }
}
