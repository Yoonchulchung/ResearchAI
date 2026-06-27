import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('news_papers')
@Index(['url'], { unique: true })
export class PaperEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'source_id', type: 'text' })
  sourceId: string;

  @Column({ name: 'source_name', type: 'text' })
  sourceName: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'ai_summary', type: 'text', nullable: true })
  aiSummary: string | null;

  @Column({ name: 'ai_summary_model', type: 'text', nullable: true })
  aiSummaryModel: string | null;

  @Column({ name: 'ai_summary_at', type: 'text', nullable: true })
  aiSummaryAt: string | null;

  @Column({ name: 'authors_json', type: 'text', default: '[]' })
  authorsJson: string;

  @Column({ name: 'published_at', type: 'text', nullable: true })
  publishedAt: string | null;

  @Column({ type: 'text', nullable: true })
  venue: string | null;

  @Column({ type: 'integer', nullable: true })
  upvotes: number | null;

  @Column({ name: 'pdf_url', type: 'text', nullable: true })
  pdfUrl: string | null;

  @Column({ name: 'code_url', type: 'text', nullable: true })
  codeUrl: string | null;

  @Column({ name: 'tags_json', type: 'text', default: '[]' })
  tagsJson: string;

  @Column({ name: 'chat_messages_json', type: 'text', default: '[]' })
  chatMessagesJson: string;

  @Column({ type: 'boolean', default: false })
  bookmarked: boolean;

  @Column({ name: 'read_at', type: 'text', nullable: true })
  readAt: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
