import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum QueueJobDbStatus {
  INIT = 'init',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
  STOPPED = 'stopped',
}

@Entity('queue_job')
export class QueueJobEntity {
  @PrimaryColumn()
  jobId: string;

  @Column()
  sessionId: string;

  @Column({ nullable: true })
  itemId: string;

  @Column({ type: 'text', nullable: true })
  itemContent: string;

  @Column({ name: 'task_type' })
  taskType: string;

  @Column({ name: 'local_ai_model', nullable: true })
  localAIModel: string;

  @Column({ name: 'cloud_ai_model', nullable: true })
  cloudAIModel: string;

  @Column({ nullable: true })
  webModel: string;

  @Column({ nullable: true })
  searchMode: string;

  @Column({ name: 'filter_model', nullable: true })
  filterModel: string;

  @Column({
    name: 'job_status',
    type: 'simple-enum',
    enum: QueueJobDbStatus,
    default: QueueJobDbStatus.INIT,
  })
  jobStatus: QueueJobDbStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
