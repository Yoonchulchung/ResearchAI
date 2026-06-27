import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from 'src/recruit/domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from 'src/recruit/domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from 'src/recruit/domain/resume/resume-training.entity';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';
import {
  ExperienceGroup,
  PrizeGroup,
  ResumeActivitiesResult,
  ResumeSearchItem,
  ResumeSearchResult,
} from './resume.types';
import { parseCategory } from './resume.utils';

@Injectable()
export class ResumeSearchService {
  constructor(
    @InjectRepository(ResumeEntity)
    private readonly resumeRepo: Repository<ResumeEntity>,
    @InjectRepository(ResumeCoverLetterEntity)
    private readonly coverLetterRepo: Repository<ResumeCoverLetterEntity>,
    @InjectRepository(ResumeExperienceEntity)
    private readonly experienceRepo: Repository<ResumeExperienceEntity>,
    @InjectRepository(ResumePrizeEntity)
    private readonly prizeRepo: Repository<ResumePrizeEntity>,
    @InjectRepository(ResumeTrainingEntity)
    private readonly trainingRepo: Repository<ResumeTrainingEntity>,
  ) {}

  async searchResume(
    q: string,
    excludeResumeId?: string,
  ): Promise<ResumeSearchResult> {
    const compactQuery = q.replace(/\s+/g, '');
    const pattern = Like(`%${q}%`);

    const coverLetterQuery = this.coverLetterRepo
      .createQueryBuilder('coverLetter')
      .where(
        `(
          coverLetter.title LIKE :pattern
          OR coverLetter.answer LIKE :pattern
          OR coverLetter.category LIKE :pattern
          OR coverLetter.refinedTitle LIKE :pattern
          OR REPLACE(coverLetter.title, ' ', '') LIKE :compactPattern
          OR REPLACE(coverLetter.category, ' ', '') LIKE :compactPattern
          OR REPLACE(coverLetter.refinedTitle, ' ', '') LIKE :compactPattern
        )`,
        { pattern: `%${q}%`, compactPattern: `%${compactQuery}%` },
      )
      .addSelect(
        `CASE
          WHEN REPLACE(coverLetter.title, ' ', '') LIKE :compactPattern THEN 0
          WHEN REPLACE(coverLetter.refinedTitle, ' ', '') LIKE :compactPattern THEN 1
          WHEN coverLetter.category LIKE :pattern
            OR REPLACE(coverLetter.category, ' ', '') LIKE :compactPattern THEN 2
          WHEN coverLetter.answer LIKE :pattern THEN 3
          ELSE 4
        END`,
        'matchRank',
      )
      .orderBy('matchRank', 'ASC')
      .addOrderBy('coverLetter.orderIndex', 'ASC')
      .take(30);
    if (excludeResumeId) {
      coverLetterQuery.andWhere('coverLetter.resumeId != :excludeResumeId', {
        excludeResumeId,
      });
    }

    const resumes = await this.resumeRepo.find({
      select: ['id', 'companyName', 'jobTitle'],
      where: { isDeleted: false },
    });
    const resumeMap = new Map(
      resumes
        .filter((r) => r.id !== excludeResumeId)
        .map((r) => [
          r.id,
          { companyName: r.companyName ?? '', jobTitle: r.jobTitle ?? '' },
        ]),
    );

    const [coverLetterRows, experiences, prizes, trainings] = await Promise.all(
      [
        coverLetterQuery.getMany(),
        this.experienceRepo.find({
          where: [
            { activityType: pattern },
            { organizationName: pattern },
            { description: pattern },
          ],
          order: { orderIndex: 'ASC' },
          take: 15,
        }),
        this.prizeRepo.find({
          where: [
            { title: pattern },
            { organization: pattern },
            { description: pattern },
          ],
          order: { orderIndex: 'ASC' },
          take: 15,
        }),
        this.trainingRepo.find({
          where: [
            { title: pattern },
            { institution: pattern },
            { description: pattern },
          ],
          order: { orderIndex: 'ASC' },
          take: 15,
        }),
      ],
    );

    const aliases = this.buildSearchAliases(q);
    const rankedCoverLetters = coverLetterRows
      .map((item) => ({ item, rank: this.coverLetterRank(item, q, aliases) }))
      .sort((a, b) => a.rank - b.rank);
    const coverLetters = rankedCoverLetters
      .filter(({ rank }) => aliases.length === 1 || rank <= 1)
      .map(({ item }) => item);

    const items: ResumeSearchItem[] = [
      ...coverLetters
        .filter((cl) => resumeMap.has(cl.resumeId))
        .map((cl) => ({
          type: 'coverLetter' as const,
          id: cl.id,
          resumeId: cl.resumeId,
          companyName: resumeMap.get(cl.resumeId)?.companyName ?? '',
          jobTitle: resumeMap.get(cl.resumeId)?.jobTitle ?? '',
          question: cl.title ?? '',
          answer: cl.answer ?? '',
          categories: parseCategory(cl.category),
          refinedTitle: cl.refinedTitle ?? null,
        })),
      ...experiences
        .filter((ex) => resumeMap.has(ex.resumeId))
        .map((ex) => ({
          type: 'experience' as const,
          id: ex.id,
          resumeId: ex.resumeId,
          companyName: resumeMap.get(ex.resumeId)?.companyName ?? '',
          jobTitle: resumeMap.get(ex.resumeId)?.jobTitle ?? '',
          activityType: ex.activityType ?? '',
          organizationName: ex.organizationName ?? '',
          startDate: ex.startDate ?? null,
          endDate: ex.endDate ?? null,
          role: ex.role ?? null,
          description: ex.description ?? null,
        })),
      ...prizes
        .filter((pr) => resumeMap.has(pr.resumeId))
        .map((pr) => ({
          type: 'prize' as const,
          id: pr.id,
          resumeId: pr.resumeId,
          companyName: resumeMap.get(pr.resumeId)?.companyName ?? '',
          jobTitle: resumeMap.get(pr.resumeId)?.jobTitle ?? '',
          title: pr.title ?? '',
          organization: pr.organization ?? '',
          issuedDate: pr.issuedDate ?? null,
          description: pr.description ?? null,
        })),
      ...trainings
        .filter((tr) => resumeMap.has(tr.resumeId))
        .map((tr) => ({
          type: 'training' as const,
          id: tr.id,
          resumeId: tr.resumeId,
          companyName: resumeMap.get(tr.resumeId)?.companyName ?? '',
          jobTitle: resumeMap.get(tr.resumeId)?.jobTitle ?? '',
          title: tr.title ?? '',
          institution: tr.institution ?? '',
          startDate: tr.startDate ?? null,
          endDate: tr.endDate ?? null,
          hours: tr.hours ?? null,
          description: tr.description ?? null,
        })),
    ];

    return { items };
  }

  async getAllActivities(
    excludeResumeId?: string,
  ): Promise<ResumeActivitiesResult> {
    const resumes = await this.resumeRepo.find({
      select: ['id', 'companyName', 'jobTitle'],
      where: { isDeleted: false },
    });
    const resumeMap = new Map(
      resumes
        .filter((r) => r.id !== excludeResumeId)
        .map((r) => [
          r.id,
          { companyName: r.companyName ?? '', jobTitle: r.jobTitle ?? '' },
        ]),
    );
    const validResumeIds = [...resumeMap.keys()];
    if (!validResumeIds.length)
      return { experienceGroups: [], prizeGroups: [] };

    const [allExperiences, allPrizes] = await Promise.all([
      this.experienceRepo.find({
        where: { resumeId: In(validResumeIds) },
        order: { organizationName: 'ASC', orderIndex: 'ASC' },
      }),
      this.prizeRepo.find({
        where: { resumeId: In(validResumeIds) },
        order: { title: 'ASC', orderIndex: 'ASC' },
      }),
    ]);

    const normalize = (s?: string | null) =>
      (s ?? '').replace(/\s+/g, '').toLowerCase();

    // 경험: organizationName 정규화 기준으로 그룹핑
    const expMap = new Map<string, ExperienceGroup>();
    for (const ex of allExperiences) {
      const item = {
        type: 'experience' as const,
        id: ex.id,
        resumeId: ex.resumeId,
        companyName: resumeMap.get(ex.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(ex.resumeId)?.jobTitle ?? '',
        activityType: ex.activityType ?? '',
        organizationName: ex.organizationName ?? '',
        startDate: ex.startDate ?? null,
        endDate: ex.endDate ?? null,
        role: ex.role ?? null,
        description: ex.description ?? null,
      };
      const key = normalize(ex.organizationName) || ex.id;
      const group = expMap.get(key);
      if (group) {
        group.items.push(item);
      } else {
        expMap.set(key, { key: ex.organizationName ?? '', items: [item] });
      }
    }

    // 수상: title + organization 조합으로 그룹핑
    const prizeMap = new Map<string, PrizeGroup>();
    for (const pr of allPrizes) {
      const item = {
        type: 'prize' as const,
        id: pr.id,
        resumeId: pr.resumeId,
        companyName: resumeMap.get(pr.resumeId)?.companyName ?? '',
        jobTitle: resumeMap.get(pr.resumeId)?.jobTitle ?? '',
        title: pr.title ?? '',
        organization: pr.organization ?? '',
        issuedDate: pr.issuedDate ?? null,
        description: pr.description ?? null,
      };
      const key = `${normalize(pr.title)}||${normalize(pr.organization)}`;
      const group = prizeMap.get(key);
      if (group) {
        group.items.push(item);
      } else {
        prizeMap.set(key, { key: pr.title ?? '', items: [item] });
      }
    }

    return {
      experienceGroups: [...expMap.values()],
      prizeGroups: [...prizeMap.values()],
    };
  }

  private buildSearchAliases(query: string): string[] {
    const compact = query.replace(/\s+/g, '').toLowerCase();
    if (
      compact.includes('지원동기') ||
      compact.includes('입사동기') ||
      compact.includes('기업선택')
    ) {
      return [
        '지원동기',
        '지원한동기',
        '입사동기',
        '입사희망',
        '입사를희망',
        '기업선택',
        '회사선택',
        '직무선택',
        '지원분야선택',
        '선택한이유',
        '이어진이유',
      ];
    }
    return [compact];
  }

  private coverLetterRank(
    item: ResumeCoverLetterEntity,
    query: string,
    aliases: string[],
  ): number {
    const compact = (value?: string | null) =>
      String(value ?? '')
        .replace(/\s+/g, '')
        .toLowerCase();
    const title = compact(item.title);
    const refinedTitle = compact(item.refinedTitle);
    const answer = compact(item.answer);
    const category = compact(item.category);
    const exact = compact(query);
    if (
      title.includes(exact) ||
      refinedTitle.includes(exact) ||
      aliases.some(
        (alias) => title.includes(alias) || refinedTitle.includes(alias),
      )
    )
      return 0;
    if (answer.includes(exact)) return 1;
    if (category.includes(exact)) return 2;
    return 3;
  }
}
