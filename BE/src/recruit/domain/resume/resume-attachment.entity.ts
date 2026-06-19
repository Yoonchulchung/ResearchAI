import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('resume_attachment')
export class ResumeAttachmentEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  @Column({ type: 'text' })
  filename: string;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize: number;

  @Column({ name: 'parsed_text', type: 'text', nullable: true, default: null })
  parsedText: string | null;

  @Column({ name: 'page_count', type: 'integer', nullable: true, default: null })
  pageCount: number | null;

  @Column({ name: 'file_data', type: 'blob' })
  fileData: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
