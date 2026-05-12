import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('content_refresh_state')
export class ContentRefreshStateEntity {
  @PrimaryColumn()
  key: string;

  @Column({ name: 'refreshed_at', type: 'text' })
  refreshedAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
