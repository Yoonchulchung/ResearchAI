import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('company_news_timeline')
@Index(['companyId', 'yearMonth'])
export class CompanyNewsTimelineEntity {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  /** "2024-11" 형식 */
  @Column({ name: 'year_month', type: 'text' })
  yearMonth!: string;

  /** AI가 자동 분류한 사업 카테고리 */
  @Column({ type: 'text' })
  category!: string;

  /** 1~2줄 이벤트 요약 */
  @Column({ type: 'text' })
  summary!: string;

  /** product | contract | partner | invest | hr | risk | other */
  @Column({ type: 'text', nullable: true })
  type!: string | null;

  /** high | medium | low */
  @Column({ type: 'text', nullable: true })
  importance!: string | null;

  /** 이벤트를 대표하는 원본 뉴스 */
  @Column({ name: 'source_news_id', type: 'text', nullable: true })
  sourceNewsId!: string | null;

  @Column({ name: 'source_title', type: 'text', nullable: true })
  sourceTitle!: string | null;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl!: string | null;

  /** 타임라인을 생성한 AI 호출의 사용량과 예상 비용 */
  @Column({ name: 'ai_input_tokens', type: 'integer', nullable: true })
  aiInputTokens!: number | null;

  @Column({ name: 'ai_output_tokens', type: 'integer', nullable: true })
  aiOutputTokens!: number | null;

  @Column({ name: 'ai_estimated_fees', type: 'float', nullable: true })
  aiEstimatedFees!: number | null;

  @Column({ type: 'text' })
  model!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
