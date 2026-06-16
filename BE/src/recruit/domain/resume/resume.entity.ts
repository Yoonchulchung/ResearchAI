import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ResumeCoverLetterEntity } from './resume-cover-letter.entity';
import { ResumeExperienceEntity } from './resume-experience.entity';
import { ResumePrizeEntity } from './resume-prize.entity';
import { ResumeTrainingEntity } from './resume-training.entity';

@Entity('recruit_resume')
export class ResumeEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'company_name', type: 'text', default: '' })
  companyName: string;

  @Column({ name: 'job_title', type: 'text', default: '' })
  jobTitle: string;

  @Column({ name: 'apply_date', type: 'text', nullable: true, default: null })
  applyDate: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  jd: string | null;

  @Column({ name: 'interview_script', type: 'text', nullable: true, default: null })
  interviewScript: string | null;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  // Deprecated migration source. New writes are stored in normalized child tables.
  @Column({ type: 'text', nullable: true, default: null })
  profileJson: string | null;

  @OneToMany(() => ResumeCoverLetterEntity, (coverLetter) => coverLetter.resume, {
    cascade: true,
  })
  coverLetters: ResumeCoverLetterEntity[];

  @OneToMany(() => ResumeExperienceEntity, (experience) => experience.resume, {
    cascade: true,
  })
  experiences: ResumeExperienceEntity[];

  @OneToMany(() => ResumePrizeEntity, (prize) => prize.resume, {
    cascade: true,
  })
  prizes: ResumePrizeEntity[];

  @OneToMany(() => ResumeTrainingEntity, (training) => training.resume, {
    cascade: true,
  })
  trainings: ResumeTrainingEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
