import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { CoverLetterEntity } from 'src/recruit/domain/cover-letter/entity/cover-letter.entity';

@Entity('recruit_cover_letters_questions')
@Index(['coverLetterId'])
@Index(['searchText'])
export class CoverLetterQuestionEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'cover_letter_id', type: 'text' })
  coverLetterId: string;

  @Column({ type: 'integer', default: 1 })
  number: number;

  @Column({ type: 'text', default: '' })
  question: string;

  @Column({ type: 'text', default: '' })
  answer: string;

  @Column({ type: 'text', default: '[]' })
  keywords: string;

  @Column({ type: 'text', default: '[]' })
  tags: string;

  @Column({ name: 'search_text', type: 'text', nullable: true })
  searchText: string | null;

  @ManyToOne(
    () => CoverLetterEntity,
    (coverLetter) => coverLetter.questionItems,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'cover_letter_id' })
  coverLetter: CoverLetterEntity;
}
