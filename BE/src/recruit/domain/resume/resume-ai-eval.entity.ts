import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('recruit_resume_ai_evals')
export class ResumeAiEvalEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  /** resume.id — which target this eval belongs to */
  @Column({ name: 'resume_id', type: 'text' })
  resumeId: string;

  /** 'evaluate' | 'spellcheck' | 'jd_evaluate' */
  @Column({ type: 'text' })
  type: string;

  /**
   * Subject key within the resume:
   *   - for cover-letter eval: the cover_letter id
   *   - for jd_evaluate: 'jd'
   */
  @Column({ name: 'subject_key', type: 'text' })
  subjectKey: string;

  @Column({ type: 'text', default: '' })
  result: string;

  @Column({ type: 'text', nullable: true, default: null })
  model: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
