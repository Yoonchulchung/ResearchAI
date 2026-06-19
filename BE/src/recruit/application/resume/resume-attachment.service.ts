import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { ResumeAttachmentEntity } from 'src/recruit/domain/resume/resume-attachment.entity';

@Injectable()
export class ResumeAttachmentService {
  constructor(
    @InjectRepository(ResumeAttachmentEntity)
    private readonly attachmentRepo: Repository<ResumeAttachmentEntity>,
  ) {}

  async listAttachments(resumeId: string) {
    const rows = await this.attachmentRepo.find({
      where: { resumeId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(({ fileData: _fd, ...rest }) => rest);
  }

  async addAttachment(
    resumeId: string,
    file: Express.Multer.File,
    parsedText: string | null,
    pageCount: number | null,
  ) {
    const entity = this.attachmentRepo.create({
      id: randomUUID(),
      resumeId,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      parsedText,
      pageCount,
      fileData: file.buffer,
    });
    await this.attachmentRepo.save(entity);
    const { fileData: _fd, ...rest } = entity;
    return rest;
  }

  async getAttachmentFile(resumeId: string, id: string) {
    return this.attachmentRepo.findOne({ where: { id, resumeId } });
  }

  async deleteAttachment(resumeId: string, id: string): Promise<void> {
    await this.attachmentRepo.delete({ id, resumeId });
  }
}
