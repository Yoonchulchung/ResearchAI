import { Injectable, Logger } from '@nestjs/common';

export interface ParsedMedia {
  filename: string;
  mimetype: string;
  size: number;
  type: 'image' | 'pdf' | 'docx';
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

  async parse(file: Express.Multer.File): Promise<ParsedMedia> {
    const { originalname, mimetype, buffer, size } = file;

    this.logger.log(`Parsing media: ${originalname} (${mimetype}, ${size}B)`);

    if (mimetype.startsWith('image/')) {
      return this.parseImage(originalname, mimetype, size, buffer);
    }
    if (mimetype === 'application/pdf') {
      return this.parsePdf(originalname, mimetype, size, buffer);
    }
    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword'
    ) {
      return this.parseDocx(originalname, mimetype, size, buffer);
    }

    throw new Error(`Unsupported mimetype: ${mimetype}`);
  }

  private parseImage(
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): ParsedMedia {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimetype};base64,${base64}`;
    return { filename, mimetype, size, type: 'image', dataUrl };
  }

  private async parsePdf(
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): Promise<ParsedMedia> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    return {
      filename,
      mimetype,
      size,
      type: 'pdf',
      text: result.text ?? '',
      pageCount: result.numpages ?? 0,
    };
  }

  private async parseDocx(
    filename: string,
    mimetype: string,
    size: number,
    buffer: Buffer,
  ): Promise<ParsedMedia> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return {
      filename,
      mimetype,
      size,
      type: 'docx',
      text: result.value ?? '',
    };
  }
}
