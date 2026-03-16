import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_config')
export class AppConfigEntity {
  @PrimaryColumn()
  key: string;

  @Column({ default: '' })
  value: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
