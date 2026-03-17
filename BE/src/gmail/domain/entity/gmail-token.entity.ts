import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gmail_token')
export class GmailTokenEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
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
