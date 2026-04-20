import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentEntity } from './document.entity';

@Entity('experience')
export class ExperienceEntity {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId: string | null;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  category: string;

  @Column({ type: 'text', nullable: true, default: null })
  sourceDocId: string | null;

  @ManyToOne(() => DocumentEntity, (document) => document.experiences, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sourceDocId' })
  document: DocumentEntity | null;

  @Column({ type: 'simple-json', nullable: true })
  aiCategories: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
