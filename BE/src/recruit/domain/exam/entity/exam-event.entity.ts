import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('recruit_exam_event')
@Index(['source', 'groupId', 'start'])
export class ExamEventEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text', default: 'dataq' })
  source: 'dataq';

  @Column({ name: 'group_id', type: 'text' })
  groupId: string;

  @Column({ type: 'text', nullable: true })
  phase: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'short_title', type: 'text', nullable: true })
  shortTitle: string | null;

  @Column({ type: 'text' })
  start: string;

  @Column({ type: 'text' })
  end: string;

  @Column({ name: 'exam_operation_seq', type: 'integer', nullable: true })
  examOperationSeq: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl: string;

  @Column({ name: 'collected_at', type: 'text' })
  collectedAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
