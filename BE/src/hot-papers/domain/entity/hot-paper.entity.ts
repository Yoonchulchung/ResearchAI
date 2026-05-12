import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('hot_paper')
@Index(['url'], { unique: true })
export class HotPaperEntity {
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
