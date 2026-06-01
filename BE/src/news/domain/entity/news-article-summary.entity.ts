import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('news_article_summary')
@Index(['url'], { unique: true })
export class NewsArticleSummaryEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'text', nullable: true })
  model: string | null;

  @Column({ name: 'article_url', type: 'text', nullable: true })
  articleUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
