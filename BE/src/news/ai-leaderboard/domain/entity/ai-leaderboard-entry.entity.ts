import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_leaderboard_entry')
@Index(['category', 'rank'])
@Index(['average', 'rank'])
export class AiLeaderboardEntryEntity {
  @PrimaryColumn({ type: 'text' })
  id: string; // category:fullname (or just fullname for legacy LLM)

  @Column({ type: 'text' })
  fullname: string;

  @Column({ type: 'text' })
  org: string;

  @Column({ type: 'text' })
  modelName: string;

  @Column({ type: 'real', nullable: true })
  average: number | null;

  @Column({ type: 'real', nullable: true })
  ifeval: number | null;

  @Column({ type: 'real', nullable: true })
  bbh: number | null;

  @Column({ type: 'real', nullable: true })
  mathLvl5: number | null;

  @Column({ type: 'real', nullable: true })
  gpqa: number | null;

  @Column({ type: 'real', nullable: true })
  musr: number | null;

  @Column({ type: 'real', nullable: true })
  mmluPro: number | null;

  @Column({ type: 'real', nullable: true })
  params: number | null;

  @Column({ type: 'text', nullable: true })
  architecture: string | null;

  @Column({ type: 'text', nullable: true })
  modelType: string | null;

  @Column({ type: 'text', nullable: true })
  license: string | null;

  @Column({ type: 'integer', nullable: true })
  likes: number | null;

  @Column({ type: 'text', default: 'llm' })
  category: string = 'llm';

  @Column({ name: 'benchmarks_json', type: 'text', default: '{}' })
  benchmarksJson: string = '{}';

  @Column({ name: 'source_scores_json', type: 'text', default: '{}' })
  sourceScoresJson: string = '{}';

  @Column({ name: 'source_count', type: 'integer', default: 0 })
  sourceCount: number = 0;

  @Column({ type: 'integer', default: 0 })
  rank: number;

  @Column({ type: 'text', nullable: true })
  fetchedAt: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
