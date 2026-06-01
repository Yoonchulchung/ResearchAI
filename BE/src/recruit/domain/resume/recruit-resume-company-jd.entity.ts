import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('recruit_resume_company_jd')
export class RecruitResumeCompanyJdEntity {
  @PrimaryColumn({ type: 'text' }) id: string;
  @Column({ name: 'resume_id', type: 'text' }) resumeId: string;
  @Column({ name: 'company_name', type: 'text', default: '' }) companyName: string;
  @Column({ name: 'jd_text', type: 'text', default: '' }) jdText: string;
  @Column({ type: 'text', default: '' }) result: string;
  @Column({ type: 'text', nullable: true }) model: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
