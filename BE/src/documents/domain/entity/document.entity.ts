import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ExperienceEntity } from './experience.entity';

@Entity('document')
export class DocumentEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true, default: null })
  companyName: string | null;

  @Column({ type: 'text' })
  content: string;

  @OneToMany(() => ExperienceEntity, (experience) => experience.document, { cascade: true })
  experiences: ExperienceEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
