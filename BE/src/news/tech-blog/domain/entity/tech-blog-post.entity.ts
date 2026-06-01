import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('news_tech_blog')
@Index(['url'], { unique: true })
export class TechBlogPostEntity {
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

  @Column({ name: 'published_at', type: 'text', nullable: true })
  publishedAt: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;

  @Column({ name: 'tags_json', type: 'text', default: '[]' })
  tagsJson: string;

  @Column({ type: 'boolean', default: false })
  bookmarked: boolean;

  @Column({ name: 'read_at', type: 'text', nullable: true })
  readAt: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
