import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CompanyEntity } from 'src/company/domain/entity/company.entity';
import { isAsciiCompanyName } from 'src/company/application/info/company-name-search.util';

export interface MergeCandidate {
  keepId: string;
  keepName: string;
  removeId: string;
  removeName: string;
  reason: string;
}

export interface MergeResult {
  kept: string;
  removed: string;
  movedRecords: Record<string, number>;
}

@Injectable()
export class CompanyMergeImplService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly repo: Repository<CompanyEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * 잠재적 중복 기업 쌍을 찾는다.
   * - 한쪽 name이 영문이고 다른쪽 englishName과 일치
   * - 같은 homeUrl 보유
   * - 같은 corpCode 보유
   */
  async findDuplicateCandidates(): Promise<MergeCandidate[]> {
    const all = await this.repo.find({
      select: [
        'id',
        'name',
        'normalizedName',
        'englishName',
        'homeUrl',
        'corpCode',
      ],
    });

    const candidates: MergeCandidate[] = [];
    const seen = new Set<string>();

    const key = (a: string, b: string) => [a, b].sort().join('::');

    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        const pairKey = key(a.id, b.id);
        if (seen.has(pairKey)) continue;

        // 1. englishName ↔ name 매칭
        const aMatchesB =
          a.englishName && b.name.toLowerCase() === a.englishName.toLowerCase();
        const bMatchesA =
          b.englishName && a.name.toLowerCase() === b.englishName.toLowerCase();

        // 2. 한쪽이 ASCII 이름이고 다른쪽 normalizedName이 포함
        const aNormEqualsB =
          isAsciiCompanyName(a.name) && b.normalizedName === a.normalizedName;
        const bNormEqualsA =
          isAsciiCompanyName(b.name) && a.normalizedName === b.normalizedName;

        // 3. 동일 homeUrl (null 제외)
        const sameHomeUrl =
          a.homeUrl &&
          b.homeUrl &&
          a.homeUrl.replace(/\/$/, '') === b.homeUrl.replace(/\/$/, '');

        // 4. 동일 corpCode
        const sameCorpCode =
          a.corpCode && b.corpCode && a.corpCode === b.corpCode;

        let reason: string | null = null;
        if (aMatchesB || bMatchesA) reason = 'englishName 매칭';
        else if (aNormEqualsB || bNormEqualsA)
          reason = 'normalizedName 일치 (영문/한글 중복)';
        else if (sameCorpCode) reason = `동일 corpCode (${a.corpCode})`;
        else if (sameHomeUrl) reason = `동일 homeUrl (${a.homeUrl})`;

        if (!reason) continue;

        seen.add(pairKey);

        // 한국어 이름을 가진 쪽을 keep으로 선택
        const keepIsA = !isAsciiCompanyName(a.name);
        candidates.push({
          keepId: keepIsA ? a.id : b.id,
          keepName: keepIsA ? a.name : b.name,
          removeId: keepIsA ? b.id : a.id,
          removeName: keepIsA ? b.name : a.name,
          reason,
        });
      }
    }

    return candidates;
  }

  /**
   * keepId 기업에 removeId 기업의 모든 데이터를 병합하고 removeId를 삭제한다.
   */
  async merge(keepId: string, removeId: string): Promise<MergeResult> {
    const [keep, remove] = await Promise.all([
      this.repo.findOne({ where: { id: keepId } }),
      this.repo.findOne({ where: { id: removeId } }),
    ]);

    if (!keep)
      throw new NotFoundException(`기업을 찾을 수 없습니다: ${keepId}`);
    if (!remove)
      throw new NotFoundException(`기업을 찾을 수 없습니다: ${removeId}`);

    const moved: Record<string, number> = {};

    await this.dataSource.transaction(async (em) => {
      // 1. keep 엔티티 필드 보완 (remove 에서 null이 아닌 값 복사)
      let changed = false;
      const fillIfMissing = <K extends keyof CompanyEntity>(field: K) => {
        if (!keep[field] && remove[field]) {
          (keep as any)[field] = remove[field];
          changed = true;
        }
      };
      fillIfMissing('companyType');
      fillIfMissing('employees');
      fillIfMissing('homeUrl');
      fillIfMissing('address');
      fillIfMissing('ceoName');
      fillIfMissing('foundedDate');
      fillIfMissing('industry');
      fillIfMissing('corpCode');
      fillIfMissing('dartUrl');
      fillIfMissing('englishName');

      // 영문명 이름을 가진 쪽을 영문명으로 보존
      if (!keep.englishName && isAsciiCompanyName(remove.name)) {
        keep.englishName = remove.name;
        changed = true;
      }

      // sources 병합
      const keepSources: string[] = keep.sources
        ? JSON.parse(keep.sources)
        : [];
      const removeSources: string[] = remove.sources
        ? JSON.parse(remove.sources)
        : [];
      const merged = [...new Set([...keepSources, ...removeSources])];
      if (merged.length > keepSources.length) {
        keep.sources = JSON.stringify(merged);
        changed = true;
      }

      if (changed) await em.save(CompanyEntity, keep);

      // 2. 단순 다대일 테이블들: company_id UPDATE
      const simpleUpdates: { table: string; col: string }[] = [
        { table: 'company_news', col: 'company_id' },
        { table: 'company_news_keyword', col: 'company_id' },
        { table: 'company_news_timeline', col: 'company_id' },
        { table: 'company_financial_ai_analysis', col: 'company_id' },
        { table: 'resumes', col: 'company_id' },
      ];

      for (const { table, col } of simpleUpdates) {
        try {
          const result = await em.query(
            `UPDATE "${table}" SET "${col}" = ? WHERE "${col}" = ?`,
            [keepId, removeId],
          );
          moved[table] = result?.changes ?? 0;
        } catch {
          // 테이블 미존재 또는 unique conflict → 삭제 후 진행
          await em.query(`DELETE FROM "${table}" WHERE "${col}" = ?`, [
            removeId,
          ]);
          moved[table] = 0;
        }
      }

      // 3. OneToOne (unique) 테이블들: keep에 없을 때만 이전, 있으면 remove 삭제
      const oneToOnes: { table: string; col: string }[] = [
        { table: 'company_analysis', col: 'company_id' },
        { table: 'company_financials', col: 'company_id' },
        { table: 'company_investor_trading', col: 'company_id' },
        { table: 'company_short_selling', col: 'company_id' },
      ];

      for (const { table, col } of oneToOnes) {
        try {
          const [hasKeep] = await em.query(
            `SELECT 1 FROM "${table}" WHERE "${col}" = ? LIMIT 1`,
            [keepId],
          );
          if (hasKeep) {
            await em.query(`DELETE FROM "${table}" WHERE "${col}" = ?`, [
              removeId,
            ]);
            moved[table] = 0;
          } else {
            await em.query(
              `UPDATE "${table}" SET "${col}" = ? WHERE "${col}" = ?`,
              [keepId, removeId],
            );
            moved[table] = 1;
          }
        } catch {
          // 테이블 미존재 시 무시
        }
      }

      // 4. company_news URL unique 충돌 처리: 이미 keep에 있는 URL은 삭제
      await em.query(
        `DELETE FROM "company_news"
         WHERE "company_id" = ?
           AND "url" IN (
             SELECT "url" FROM "company_news" WHERE "company_id" = ?
           )`,
        [removeId, keepId],
      );

      // 5. remove 엔티티 삭제
      await em.query(`DELETE FROM "companies" WHERE "id" = ?`, [removeId]);
    });

    return { kept: keep.name, removed: remove.name, movedRecords: moved };
  }
}
