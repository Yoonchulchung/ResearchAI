import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SessionEntity } from '../../../sessions/domain/entity/session.entity';

@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'anthropic_api_key', type: 'text', nullable: true })
  anthropicApiKey: string | null;

  @Column({ name: 'openai_api_key', type: 'text', nullable: true })
  openaiApiKey: string | null;

  @Column({ name: 'google_api_key', type: 'text', nullable: true })
  googleApiKey: string | null;

  @Column({ name: 'tavily_api_key', type: 'text', nullable: true })
  tavilyApiKey: string | null;

  @Column({ name: 'serper_api_key', type: 'text', nullable: true })
  serperApiKey: string | null;

  @Column({ name: 'naver_client_id', type: 'text', nullable: true })
  naverClientId: string | null;

  @Column({ name: 'naver_client_secret', type: 'text', nullable: true })
  naverClientSecret: string | null;

  @Column({ name: 'brave_api_key', type: 'text', nullable: true })
  braveApiKey: string | null;

  @Column({ name: 'artificial_analysis_api_key', type: 'text', nullable: true })
  artificialAnalysisApiKey: string | null;

  @Column({ name: 'groq_api_key', type: 'text', nullable: true })
  groqApiKey: string | null;

  @Column({ name: 'dart_api_key', type: 'text', nullable: true })
  dartApiKey: string | null;

  @Column({ name: 'jobplanet_id', type: 'text', nullable: true })
  jobplanetId: string | null;

  @Column({ name: 'jobplanet_password', type: 'text', nullable: true })
  jobplanetPassword: string | null;

  @Column({ name: 'jobkorea_id', type: 'text', nullable: true })
  jobkoreaId: string | null;

  @Column({ name: 'jobkorea_password', type: 'text', nullable: true })
  jobkoreaPassword: string | null;

  @Column({ name: 'catch_id', type: 'text', nullable: true })
  catchId: string | null;

  @Column({ name: 'catch_password', type: 'text', nullable: true })
  catchPassword: string | null;

  @Column({ name: 'default_cloud_model', type: 'text', nullable: true })
  defaultCloudModel: string | null;

  @Column({ name: 'default_local_model', type: 'text', nullable: true })
  defaultLocalModel: string | null;

  @Column({ type: 'text', default: 'visitor' })
  role: 'visitor' | 'admin';

  @OneToMany(() => SessionEntity, (session) => session.user)
  sessions: SessionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
