import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';

@Entity('resume_cover_letter')
export class ResumeCoverLetterEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  @Column({ type: 'text', default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  answer: string;

  @Column({ type: 'text', nullable: true, default: null })
  category: string | null;

  @Column({
    name: 'refined_title',
    type: 'text',
    nullable: true,
    default: null,
  })
  refinedTitle: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @ManyToOne(() => ResumeEntity, (resume) => resume.coverLetters, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resume_id' })
  resume: ResumeEntity;
}
