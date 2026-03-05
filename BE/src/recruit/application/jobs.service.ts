import { Injectable, NotFoundException } from '@nestjs/common';
import { JobRepository, JobFilter } from '../infrastructure/repository/job-repository';

@Injectable()
export class JobsService {
  constructor(private readonly jobRepository: JobRepository) {}

  findAll(filter: JobFilter) {
    return this.jobRepository.findAll(filter);
  }

  findOne(id: string) {
    const job = this.jobRepository.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  remove(id: string) {
    const deleted = this.jobRepository.delete(id);
    if (!deleted) throw new NotFoundException('Job not found');
    return { ok: true };
  }

  clear() {
    const count = this.jobRepository.deleteAll();
    return { ok: true, deleted: count };
  }

  stats() {
    return this.jobRepository.stats();
  }
}
