import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('recruit_company_news')
export class RecruitCompanyNewsEntity {
  @PrimaryColumn({ type: 'text' }) id: string;

  /** 연결된 resume target의 ID */
  @Column({ name: 'resume_id', type: 'text' }) resumeId: string;

  @Column({ name: 'company_name', type: 'text' }) companyName: string;

  /** 초기 light research searchId */
  @Column({ name: 'search_id', type: 'text', nullable: true }) searchId: string | null;

  /** 개별 task 식별자 (itemId 또는 index 기반) */
  @Column({ name: 'item_id', type: 'text' }) itemId: string;

  /** 뉴스 항목 제목 */
  @Column({ type: 'text' }) title: string;

  /** 세부 검색 쿼리 (webSearchPrompt) */
  @Column({ name: 'search_query', type: 'text' }) searchQuery: string;

  /** 세부 검색 결과 - sub-tasks JSON */
  @Column({ name: 'detail_json', type: 'text', nullable: true }) detailJson: string | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
