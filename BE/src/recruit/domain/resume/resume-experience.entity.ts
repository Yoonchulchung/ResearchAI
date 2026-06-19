import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';

@Entity('resume_experience')
export class ResumeExperienceEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  @Column({ name: 'activity_type', type: 'text', default: '' })
  activityType: string;

  @Column({ name: 'organization_name', type: 'text', default: '' })
  organizationName: string;

  @Column({ name: 'start_date', type: 'text', nullable: true, default: null })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'text', nullable: true, default: null })
  endDate: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  role: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @ManyToOne(() => ResumeEntity, (resume) => resume.experiences, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resume_id' })
  resume: ResumeEntity;
}
