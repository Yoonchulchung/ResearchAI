import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('news_briefing')
export class NewsBriefingEntity {
  @PrimaryColumn()
  date: string; // YYYY-MM-DD

  @Column({ name: 'titles_hash' })
  titlesHash: string; // SHA-256 of sorted titles — 변경 감지용

  @Column({ type: 'text' })
  summary: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
