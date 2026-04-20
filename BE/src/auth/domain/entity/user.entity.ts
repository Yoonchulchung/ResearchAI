import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
