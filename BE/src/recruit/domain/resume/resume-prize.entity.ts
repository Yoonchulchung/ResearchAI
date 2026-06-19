import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';

@Entity('resume_prize')
export class ResumePrizeEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  @Column({ type: 'text', default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  organization: string;

  @Column({ name: 'issued_date', type: 'text', nullable: true, default: null })
  issuedDate: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @ManyToOne(() => ResumeEntity, (resume) => resume.prizes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resume_id' })
  resume: ResumeEntity;
}
