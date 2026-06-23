import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from 'src/vector/vector.service';
import { requestContext } from 'src/shared/request-context';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import type { ImageContentBlock } from 'src/ai/application/ai-provider.types';

export enum MediaType {
  IMAGE = 'image',
  PDF = 'pdf',
  DOCX = 'docx',
}

export enum MimeType {
  JPEG = 'image/jpeg',
  JPG = 'image/jpg',
  PNG = 'image/png',
  GIF = 'image/gif',
  WEBP = 'image/webp',
  PDF = 'application/pdf',
  DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  DOC = 'application/msword',
}

export interface ParsedMedia {
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
  type: MediaType;
  /** 이미지: base64 dataUrl, PDF/DOCX: undefined */
  dataUrl?: string;
  /** PDF/DOCX: 추출된 텍스트 */
  text?: string;
  /** PDF 전용 */
  pageCount?: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async parse(file: Express.Multer.File): Promise<ParsedMedia> {
    const { originalname, mimetype, buffer, size } = file;
    const fileId = randomUUID();

    this.logger.log(
      `Parsing media: ${originalname} (${mimetype}, ${size}B) → fileId=${fileId}`,
    );

    let result: ParsedMedia;

    if (mimetype.startsWith('image/')) {
      result = this.parseImage(fileId, originalname, mimetype, size, buffer);
    } else if (mimetype === MimeType.PDF) {
      result = await this.parsePdf(
        fileId,
        originalname,
        mimetype,
        size,
        buffer,
      );
    } else if (mimetype === MimeType.DOCX || mimetype === MimeType.DOC) {
      result = await this.parseDocx(
        fileId,
        originalname,
        mimetype,
        size,
        buffer,
      );
    } else {
      throw new Error(`Unsupported mimetype: ${mimetype}`);
    }

    // PDF / DOCX 텍스트를 Qdrant에 비동기 인덱싱
    if (result.text && result.text.trim().length > 0) {
      const userId = requestContext.getStore()?.id ?? null;
      this.vectorService
        .indexDocument(fileId, originalname, result.type, result.text, userId)
        .catch((e) => this.logger.error(`문서 인덱싱 실패: ${e.message}`));
    }

    return result;
  }

  private parseImage(
    fileId: string,
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): ParsedMedia {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimetype};base64,${base64}`;
    return { fileId, filename, mimetype, size, type: MediaType.IMAGE, dataUrl };
  }

  async extractImageText(
    file: Express.Multer.File,
    model = 'gemini-2.0-flash',
  ): Promise<{ text: string; filename: string; model: string }> {
    if (!file.mimetype.startsWith('image/')) {
      throw new Error(`이미지 파일만 지원합니다: ${file.mimetype}`);
    }

    const mediaType = this.toImageMediaType(file.mimetype);
    const image: ImageContentBlock = {
      type: 'image',
      mediaType,
      data: file.buffer.toString('base64'),
    };
    const system = [
      '너는 채용공고 이미지에서 텍스트를 추출하는 OCR 도우미다.',
      '이미지에 보이는 채용공고/JD 텍스트를 빠짐없이 한국어 원문 중심으로 전사한다.',
      '추측, 요약, 설명은 하지 말고 텍스트만 출력한다.',
      '레이아웃이 있으면 제목, 섹션, 불릿의 줄바꿈을 최대한 유지한다.',
    ].join('\n');
    const prompt =
      '이 이미지의 채용공고/JD 텍스트를 추출해줘. 텍스트만 출력해.';
    let text = '';
    for await (const chunk of this.aiProvider.stream(model, system, [
      { role: 'user', content: [prompt, image] },
    ])) {
      text += chunk;
    }
    return {
      text: text.trim(),
      filename: file.originalname,
      model: this.aiProvider.resolveEffectiveModel(model),
    };
  }

  private toImageMediaType(mimetype: string): ImageContentBlock['mediaType'] {
    if (mimetype === MimeType.PNG) return 'image/png';
    if (mimetype === MimeType.GIF) return 'image/gif';
    if (mimetype === MimeType.WEBP) return 'image/webp';
    return 'image/jpeg';
  }

  private async parsePdf(
    fileId: string,
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): Promise<ParsedMedia> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return {
      fileId,
      filename,
      mimetype,
      size,
      type: MediaType.PDF,
      text: result.text ?? '',
      pageCount: result.numpages ?? 0,
    };
  }

  private async parseDocx(
    fileId: string,
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): Promise<ParsedMedia> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return {
      fileId,
      filename,
      mimetype,
      size,
      type: MediaType.DOCX,
      text: result.value ?? '',
    };
  }
}
