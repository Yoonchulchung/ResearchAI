import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  // ── AI 생성 분석 ───────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  swot: string | null;

  @Column({ type: 'text', nullable: true })
  competitors: string | null;

  @Column({ name: 'business_segments', type: 'text', nullable: true })
  businessSegments: string | null;

  @Column({ type: 'text', nullable: true })
  industry: string | null;

  @Column({ name: 'credit_rating', type: 'text', nullable: true })
  creditRating: string | null;

  // ── DART 기업 정보 ─────────────────────────────────────
  @Column({ name: 'corp_class', type: 'text', nullable: true })
  corpClass: string | null;

  @Column({ name: 'home_url', type: 'text', nullable: true })
  homeUrl: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'dart_url', type: 'text', nullable: true })
  dartUrl: string | null;

  @Column({ name: 'ceo_name', type: 'text', nullable: true })
  ceoName: string | null;

  @Column({ name: 'founded_date', type: 'text', nullable: true })
  foundedDate: string | null;

  @Column({ type: 'text', nullable: true })
  disclosures: string | null;

  @Column({ name: 'multi_year_financials', type: 'text', nullable: true })
  multiYearFinancials: string | null;

  @Column({ name: 'financial_summary', type: 'text', nullable: true })
  financialSummary: string | null;

  // ── 웹 수집 데이터 ─────────────────────────────────────
  @Column({ name: 'recent_news', type: 'text', nullable: true })
  recentNews: string | null;

  @Column({ name: 'job_postings', type: 'text', nullable: true })
  jobPostings: string | null;

  @Column({ name: 'jobplanet_summary', type: 'text', nullable: true })
  jobplanetSummary: string | null;

  // ── AI 생성 보고서 ─────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  report: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
