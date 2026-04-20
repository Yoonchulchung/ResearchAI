import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gmail_token')
@Index(['userId'], { unique: true })
export class GmailTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column()
  email: string;

  @Column()
  refreshToken: string;

  @Column({ nullable: true, type: 'text' })
  accessToken: string | null;

  @Column({ nullable: true, type: 'integer' })
  accessTokenExpiresAt: number | null; // Unix timestamp (ms)

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
