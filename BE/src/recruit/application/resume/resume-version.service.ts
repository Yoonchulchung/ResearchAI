import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResumeVersionEntity } from 'src/recruit/domain/resume/resume-version.entity';
import {
  ResumeTarget,
  ResumeVersionDetailResult,
  ResumeVersionListResult,
  ResumeVersionSummary,
} from './resume.types';
import { buildVersionSnapshot } from './resume.utils';
import { ResumeCrudService } from './resume-crud.service';

@Injectable()
export class ResumeVersionService {
  constructor(
    @InjectRepository(ResumeVersionEntity)
    private readonly versionRepo: Repository<ResumeVersionEntity>,
    private readonly crud: ResumeCrudService,
  ) {}

  async listVersions(resumeId: string): Promise<ResumeVersionListResult> {
    let rows = await this.versionRepo.find({
      where: { resumeId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    if (rows.length === 0) {
      const current = await this.crud.getResumeDetail([resumeId]);
      const target = current?.resume[0];
      if (target) {
        await this.crud.recordVersion(target);
        rows = await this.versionRepo.find({
          where: { resumeId },
          order: { createdAt: 'DESC' },
          take: 50,
        });
      }
    }

    return { items: rows.map((row) => this.toSummary(row)) };
  }

  async getVersion(
    resumeId: string,
    versionId: string,
  ): Promise<ResumeVersionDetailResult> {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, resumeId },
    });
    if (!version) throw new NotFoundException('버전 기록을 찾을 수 없습니다.');
    return {
      version: this.toSummary(version),
      target: this.parseSnapshot(version.snapshotJson),
    };
  }

  async getSnapshotAsTarget(resumeId: string, versionId: string): Promise<ResumeTarget> {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, resumeId },
    });
    if (!version) throw new NotFoundException('버전 기록을 찾을 수 없습니다.');
    return { ...this.parseSnapshot(version.snapshotJson), id: resumeId };
  }

  async deleteVersion(resumeId: string, versionId: string): Promise<void> {
    await this.versionRepo.delete({ id: versionId, resumeId });
  }

  toSummary(row: ResumeVersionEntity): ResumeVersionSummary {
    const snapshot = this.parseSnapshot(row.snapshotJson);
    return {
      id: row.id,
      resumeId: row.resumeId,
      title: row.title,
      companyName: snapshot.companyName ?? '',
      jobTitle: snapshot.jobTitle ?? '',
      appliedAt: snapshot.appliedAt ?? '',
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parseSnapshot(snapshotJson: string): ResumeTarget {
    try {
      return buildVersionSnapshot(JSON.parse(snapshotJson) as ResumeTarget);
    } catch {
      throw new BadRequestException('버전 스냅샷을 읽을 수 없습니다.');
    }
  }
}
