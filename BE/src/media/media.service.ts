import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VectorService } from '../vector/vector.service';
import { requestContext } from '../shared/request-context';

export enum MediaType {
  IMAGE = 'image',
  PDF = 'pdf',
  DOCX = 'docx',
}

export enum MimeType {
  JPEG = 'image/jpeg',
  JPG = 'image/jpg',
  PNG = 'image/png',
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

  constructor(private readonly vectorService: VectorService) {}

  async parse(file: Express.Multer.File): Promise<ParsedMedia> {
    const { originalname, mimetype, buffer, size } = file;
    const fileId = randomUUID();

    this.logger.log(`Parsing media: ${originalname} (${mimetype}, ${size}B) → fileId=${fileId}`);

    let result: ParsedMedia;

    if (mimetype.startsWith('image/')) {
      result = this.parseImage(fileId, originalname, mimetype, size, buffer);
    } else if (mimetype === MimeType.PDF) {
      result = await this.parsePdf(fileId, originalname, mimetype, size, buffer);
    } else if (mimetype === MimeType.DOCX || mimetype === MimeType.DOC) {
      result = await this.parseDocx(fileId, originalname, mimetype, size, buffer);
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
