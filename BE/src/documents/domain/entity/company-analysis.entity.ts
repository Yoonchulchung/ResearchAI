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

  /** 기업명 — 정규화된 형태 (소문자·공백 제거된 키) */
  @Column({ name: 'company_key', type: 'text', unique: true })
  companyKey: string;

  /** 표시용 기업명 (사용자가 입력한 원본) */
  @Column({ name: 'company_name', type: 'text' })
  companyName: string;

  /** 13개 핵심 역량 점수 (0~100) — JSON */
  @Column({ type: 'text' })
  scores: string;

  /** 인재상 요약 — AI Agent 가 생성한 분석 텍스트 */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** 분석 근거 — 검색·인용 출처들 (JSON 배열) */
  @Column({ type: 'text', nullable: true })
  evidence: string | null;

  /** 분석에 사용된 AI 모델 */
  @Column({ name: 'ai_model', type: 'text', nullable: true })
  aiModel: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
