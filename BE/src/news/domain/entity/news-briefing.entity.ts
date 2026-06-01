import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('news_briefing')
export class NewsBriefingEntity {
  @PrimaryColumn()
  date: string; // YYYY-MM-DD or raw-{source}-{date}

  @Column({ name: 'titles_hash' })
  titlesHash: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'raw_data', type: 'text', nullable: true })
  rawData: string | null;

  @Column({ name: 'ai_model', type: 'varchar', nullable: true })
  aiModel: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
