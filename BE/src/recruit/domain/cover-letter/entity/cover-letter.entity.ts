import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CoverLetterQuestionEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter-question.entity';

@Entity('recruit_cover_letters')
@Index(['source'])
@Index(['companyType'])
@Index(['jobCategory'])
@Index(['company'])
@Index(['position'])
@Index(['collectedAt'])
@Index(['isHidden'])
export class CoverLetterEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text', nullable: true })
  source: string | null;

  @Column({ name: 'company_type', type: 'text', nullable: true })
  companyType: string | null;

  @Column({ name: 'job_category', type: 'text', nullable: true })
  jobCategory: string | null;

  @Column({ type: 'text' })
  company: string;

  @Column({ type: 'text' })
  position: string;

  @Column({ type: 'text' })
  season: string;

  @Column({ type: 'text' })
  spec: string;

  @Column({ name: 'view_count', type: 'integer', nullable: true })
  viewCount: number | null;

  @Column({ type: 'text' })
  questions: string;

  @Column({ name: 'search_text', type: 'text', nullable: true })
  searchText: string | null;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  @OneToMany(
    () => CoverLetterQuestionEntity,
    (question) => question.coverLetter,
    {
      cascade: true,
    },
  )
  questionItems?: CoverLetterQuestionEntity[];

  @Column({ name: 'collected_at', type: 'datetime' })
  collectedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
