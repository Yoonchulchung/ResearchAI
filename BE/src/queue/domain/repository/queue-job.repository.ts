import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueJobEntity, QueueJobDbStatus } from 'src/queue/domain/entity/queue-job.entity';

@Injectable()
export class QueueJobRepository {
  constructor(
    @InjectRepository(QueueJobEntity)
    private readonly repo: Repository<QueueJobEntity>,
  ) {}

  async save(entity: Partial<QueueJobEntity>): Promise<void> {
    await this.repo.save(entity);
  }

  async updateStatus(jobId: string, status: QueueJobDbStatus): Promise<void> {
    await this.repo.update(jobId, { jobStatus: status });
  }

  async findByStatuses(
    statuses: QueueJobDbStatus[],
  ): Promise<QueueJobEntity[]> {
    return this.repo
      .createQueryBuilder('j')
      .where('j.job_status IN (:...statuses)', { statuses })
      .orderBy('j.created_at', 'ASC')
      .getMany();
  }

  async deleteByJobId(jobId: string): Promise<void> {
    await this.repo.delete(jobId);
  }
}
