import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';

@Entity('recruit_resume_versions')
@Index(['resumeId', 'createdAt'])
export class ResumeVersionEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  @Column({ type: 'text', nullable: true, default: null })
  title: string | null;

  @Column({ name: 'snapshot_json', type: 'text' })
  snapshotJson: string;

  @ManyToOne(() => ResumeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resume_id' })
  resume: ResumeEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
