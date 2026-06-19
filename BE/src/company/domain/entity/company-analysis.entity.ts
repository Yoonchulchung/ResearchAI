import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';

export interface CompetencyScores {
  성취지향: number;
  도전정신: number;
  주도성: number;
  문제해결: number;
  의사소통: number;
  대인관계: number;
  열정: number;
  주인의식: number;
  팀워크: number;
  자원계획관리: number;
  치밀성: number;
  분석적사고: number;
  전문성: number;
}

@Entity('company_analyses')
export class CompanyAnalysisEntity {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'company_key', type: 'text', unique: true })
  companyKey: string;

  @Column({ name: 'company_name', type: 'text' })
  companyName: string;

  @Column({ type: 'text' })
  scores: string;

  @Column({ type: 'text', nullable: true })
  reasons: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  evidence: string | null;

  @Column({ name: 'ai_model', type: 'text', nullable: true })
  aiModel: string | null;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'estimated_fees', type: 'real', nullable: true })
  estimatedFees: number | null;

  // ── AI 생성 분석 ───────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  swot: string | null;

  @Column({ type: 'text', nullable: true })
  competitors: string | null;

  @Column({ name: 'competitor_sources', type: 'text', nullable: true })
  competitorSources: string | null;

  @Column({ name: 'business_segments', type: 'text', nullable: true })
  businessSegments: string | null;

  @Column({ name: 'segment_sources', type: 'text', nullable: true })
  segmentSources: string | null;

  @Column({ name: 'credit_rating', type: 'text', nullable: true })
  creditRating: string | null;

  // ── 웹 수집 데이터 ─────────────────────────────────────
  @Column({ name: 'recent_news', type: 'text', nullable: true })
  recentNews: string | null;

  @Column({ name: 'job_postings', type: 'text', nullable: true })
  jobPostings: string | null;

  @Column({ name: 'hr_tech_sources', type: 'text', nullable: true })
  hrTechSources: string | null;

  // ── AI 생성 보고서 ─────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  report: string | null;

  @Column({ name: 'mission_vision', type: 'text', nullable: true })
  missionVision: string | null;

  @Column({ name: 'company_profile', type: 'text', nullable: true })
  companyProfile: string | null;

  @Column({ name: 'hr_analysis', type: 'text', nullable: true })
  hrAnalysis: string | null;

  @Column({ name: 'apartment_prices', type: 'text', nullable: true })
  apartmentPrices: string | null;

  @Column({ name: 'source_context', type: 'text', nullable: true })
  sourceContext: string | null;

  @Column({ name: 'company_id', type: 'text', nullable: true })
  companyId: string | null;

  @ManyToOne(() => CompanyEntity, (c) => c.analysis, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'company_id' })
  company?: CompanyEntity;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
