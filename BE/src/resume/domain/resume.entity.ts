import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('resume')
export class ResumeEntity {
  @PrimaryColumn()
  id: string;

  @Column({ type: 'text', nullable: true, default: null })
  profileJson: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
