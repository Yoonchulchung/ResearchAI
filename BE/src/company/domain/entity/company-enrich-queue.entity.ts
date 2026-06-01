import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('company_enrich_queue')
export class CompanyEnrichQueueEntity {
  @PrimaryColumn({ name: 'normalized_name', type: 'text' })
  normalizedName!: string;

  @Column({ name: 'company_name', type: 'text' })
  companyName!: string;

  @Column({ name: 'known_type', type: 'text', nullable: true })
  knownType!: string | null;

  @Column({ name: 'known_employees', type: 'text', nullable: true })
  knownEmployees!: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'last_attempted_at', type: 'datetime', nullable: true })
  lastAttemptedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
