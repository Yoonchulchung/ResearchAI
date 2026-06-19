import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import type { JobPosting } from 'src/recruit/domain/job-posting.model';
import { RecruitJobPostingEntity } from 'src/recruit/domain/job-posting/entity/recruit-job-posting.entity';
import { RecruitDb } from 'src/recruit/infrastructure/database/recruit-db';
import {
  entityToJobPosting,
  inferCompanyTypeFromCompanyName,
  normalizeCompanyName,
  normalizeCompanyType,
  normalizePostingForStorage,
} from './job-posting.utils';

const DATA_DIR = path.resolve(__dirname, '../../../../data/job-postings');
const COMPANY_PROFILES_FILE = path.join(DATA_DIR, 'company-profiles.json');

type CompanyProfileSource = 'manual' | 'dart' | 'publicData' | 'jobSite' | 'search';

interface CompanyProfile {
  companyName: string;
  normalizedName: string;
  companyType: string;
  source: CompanyProfileSource;
  evidence?: string;
  updatedAt: string;
}

interface CompanyProfileFile {
  version: 1;
  updatedAt: string;
  profiles: Record<string, CompanyProfile>;
}

const SOURCE_PRIORITY: Record<CompanyProfileSource, number> = {
  manual: 100, dart: 80, publicData: 70, jobSite: 40, search: 30,
};

@Injectable()
export class JobPostingCompanyProfileService {
  private readonly logger = new Logger(JobPostingCompanyProfileService.name);
  private profiles = new Map<string, CompanyProfile>();

  constructor(
    private readonly recruitDb: RecruitDb,
    @InjectRepository(RecruitJobPostingEntity)
    private readonly postingRepo: Repository<RecruitJobPostingEntity>,
  ) {}

  async init(): Promise<void> {
    await this.migrateJsonToDb();
    await this.load();
    await this.bootstrapFromPostings();
  }

  resolveCompanyType(p: JobPosting): string | undefined {
    const profile = this.profiles.get(normalizeCompanyName(p.company));
    if (!profile) return undefined;
    const inferred = inferCompanyTypeFromCompanyName(p.company);
    if (profile.source === 'jobSite' && inferred) return inferred;
    return normalizeCompanyType(profile.companyType) ?? profile.companyType;
  }

  upsertFromPosting(p: JobPosting): boolean {
    const companyType =
      inferCompanyTypeFromCompanyName(p.company) ?? normalizeCompanyType(p.companyType);
    if (!companyType) return false;
    return this.upsertProfile({
      companyName: p.company,
      companyType,
      source: 'jobSite',
      evidence: p.companyType,
    });
  }

  upsertProfile(input: {
    companyName: string;
    companyType: string;
    source: CompanyProfileSource;
    evidence?: string;
  }): boolean {
    const normalizedName = normalizeCompanyName(input.companyName);
    if (!normalizedName || !input.companyType) return false;
    const existing = this.profiles.get(normalizedName);
    if (existing && SOURCE_PRIORITY[existing.source] > SOURCE_PRIORITY[input.source]) return false;
    const next: CompanyProfile = {
      companyName: existing?.companyName ?? input.companyName,
      normalizedName,
      companyType: input.companyType,
      source: input.source,
      evidence: input.evidence,
      updatedAt: new Date().toISOString(),
    };
    if (
      existing &&
      existing.companyType === next.companyType &&
      existing.source === next.source &&
      existing.evidence === next.evidence
    ) {
      return false;
    }
    this.profiles.set(normalizedName, next);
    return true;
  }

  save(): void {
    const sorted = [...this.profiles.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'));
    const db = this.recruitDb.get();
    const transaction = db.transaction((profiles: CompanyProfile[]) => {
      db.prepare(`DELETE FROM company_profiles`).run();
      const stmt = db.prepare(`
        INSERT INTO company_profiles
          (normalized_name, company_name, company_type, source, evidence, updated_at)
        VALUES
          (@normalizedName, @companyName, @companyType, @source, @evidence, @updatedAt)
      `);
      for (const profile of profiles) stmt.run({ ...profile, evidence: profile.evidence ?? null });
    });
    transaction(sorted.map(([, profile]) => profile));
  }

  private async load(): Promise<void> {
    const rows = this.recruitDb
      .get()
      .prepare(`SELECT normalized_name, company_name, company_type, source, evidence, updated_at FROM company_profiles`)
      .all() as Array<{
        normalized_name: string;
        company_name: string;
        company_type: string;
        source: CompanyProfileSource;
        evidence: string | null;
        updated_at: string;
      }>;

    this.profiles = new Map(
      rows.map((row) => [
        row.normalized_name,
        {
          normalizedName: row.normalized_name,
          companyName: row.company_name,
          companyType: row.company_type,
          source: row.source,
          evidence: row.evidence ?? undefined,
          updatedAt: row.updated_at,
        },
      ]),
    );
    this.logger.log(`기업 프로필 DB ${this.profiles.size}개 로드`);
  }

  private async bootstrapFromPostings(): Promise<void> {
    const rows = await this.postingRepo.find({ order: { collectedAt: 'DESC' } });
    const postings = rows.map((e) => entityToJobPosting(e));
    let changed = false;
    for (const posting of postings) {
      changed = this.upsertFromPosting(posting) || changed;
    }
    if (changed) this.save();
  }

  private async migrateJsonToDb(): Promise<void> {
    const existing = this.recruitDb
      .get()
      .prepare(`SELECT COUNT(*) as count FROM company_profiles`)
      .get() as { count: number };
    if (existing.count > 0 || !fs.existsSync(COMPANY_PROFILES_FILE)) return;

    try {
      const file = JSON.parse(fs.readFileSync(COMPANY_PROFILES_FILE, 'utf-8')) as Partial<CompanyProfileFile>;
      const profiles = Object.values(file.profiles ?? {});
      if (profiles.length === 0) return;

      const stmt = this.recruitDb.get().prepare(`
        INSERT OR REPLACE INTO company_profiles
          (normalized_name, company_name, company_type, source, evidence, updated_at)
        VALUES
          (@normalizedName, @companyName, @companyType, @source, @evidence, @updatedAt)
      `);
      const transaction = this.recruitDb.get().transaction((rows: CompanyProfile[]) => {
        for (const profile of rows) stmt.run({ ...profile, evidence: profile.evidence ?? null });
      });
      transaction(profiles);
      this.logger.log(`기업 프로필 JSON ${profiles.length}건을 DB로 마이그레이션 완료`);
    } catch {
      this.logger.warn('company-profiles.json 마이그레이션 실패 — 건너뜀');
    }
  }
}
