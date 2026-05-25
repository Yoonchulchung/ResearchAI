import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiLeaderboardEntryEntity } from '../domain/entity/ai-leaderboard-entry.entity';
import { UserEntity } from '../../../auth/domain/entity/user.entity';
import { requestContext } from '../../../shared/request-context';

export interface AiModelEntry {
  id: string;
  fullname: string;
  org: string;
  modelName: string;
  rank: number;
  category: string;
  average: number | null;
  ifeval: number | null;
  bbh: number | null;
  mathLvl5: number | null;
  gpqa: number | null;
  musr: number | null;
  mmluPro: number | null;
  params: number | null;
  architecture: string | null;
  modelType: string | null;
  license: string | null;
  likes: number | null;
  fetchedAt: string | null;
  benchmarks: Record<string, number | null>;
  sourceScores: Record<string, number | null>;
  sourceCount: number;
}

export interface LeaderboardResult {
  entries: AiModelEntry[];
  total: number;
  fetchedAt: string | null;
  category: string;
}

export type LeaderboardSortDir = 'asc' | 'desc';

export const CATEGORY_LABELS: Record<string, string> = {
  llm: 'LLM',
  vlm: 'Vision-Language',
  asr: 'Speech (ASR)',
  tts: 'Speech (TTS)',
  code: 'Code',
  'text-to-image': 'Text-to-Image',
  'image-editing': 'Image Editing',
  'text-to-video': 'Text-to-Video',
  'image-to-video': 'Image-to-Video',
};

export const CATEGORY_SCORE_LABEL: Record<string, string> = {
  llm: '평균 점수',
  vlm: '평균 점수',
  asr: '정확도 (100-WER)',
  tts: '품질 점수',
  code: 'Pass@1',
  'text-to-image': '품질 점수',
  'image-editing': '품질 점수',
  'text-to-video': '품질 점수',
  'image-to-video': '품질 점수',
};

export const CATEGORY_BENCHMARK_DEFS: Record<string, Record<string, string>> = {
  llm:    { ifeval: 'IFEval', bbh: 'BBH', mathLvl5: 'MATH Lvl 5', gpqa: 'GPQA', musr: 'MUSR', mmluPro: 'MMLU-PRO' },
  vlm:    { mmbench: 'MMBench', mmstar: 'MMStar', mmmu: 'MMMU', mathvista: 'MathVista', ai2d: 'AI2D', hallusionbench: 'HallusionBench', ocrbench: 'OCRBench' },
  asr:    { libriSpeechClean: 'LibriSpeech (clean)', libriSpeechOther: 'LibriSpeech (other)', commonVoice: 'Common Voice', voxpopuli: 'VoxPopuli', earnings22: 'Earnings22' },
  tts:    { elo: 'AA Elo', appearances: 'Samples', categoryBestElo: 'Best Category Elo', categoryCount: 'Categories' },
  code:   { humanEval: 'HumanEval', mbpp: 'MBPP', humanEvalPlus: 'HumanEval+', mbppPlus: 'MBPP+', ds1000: 'DS-1000' },
  'text-to-image': { elo: 'AA Elo', appearances: 'Samples', categoryBestElo: 'Best Category Elo', categoryCount: 'Categories' },
  'image-editing': { elo: 'AA Elo', appearances: 'Samples', aaRank: 'AA Rank', hfLikes: 'HF 좋아요' },
  'text-to-video': { elo: 'AA Elo', appearances: 'Samples', categoryBestElo: 'Best Category Elo', categoryCount: 'Categories' },
  'image-to-video': { elo: 'AA Elo', appearances: 'Samples', categoryBestElo: 'Best Category Elo', categoryCount: 'Categories' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

interface NormalizedEntry {
  id: string;
  fullname: string;
  org: string;
  modelName: string;
  average: number | null;
  params: number | null;
  modelType: string | null;
  license: string | null;
  likes: number | null;
  architecture: string | null;
  benchmarks: Record<string, number | null>;
  sourceScores?: Record<string, number | null>;
}

const LLM_DATASET_BASE = 'https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train&length=100';
const ARTIFICIAL_ANALYSIS_LLM_MODELS_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';
const ARTIFICIAL_ANALYSIS_MEDIA_ENDPOINTS: Record<string, string> = {
  tts: 'https://artificialanalysis.ai/api/v2/data/media/text-to-speech',
  'text-to-image': 'https://artificialanalysis.ai/api/v2/data/media/text-to-image?include_categories=true',
  'image-editing': 'https://artificialanalysis.ai/api/v2/data/media/image-editing',
  'text-to-video': 'https://artificialanalysis.ai/api/v2/data/media/text-to-video?include_categories=true',
  'image-to-video': 'https://artificialanalysis.ai/api/v2/data/media/image-to-video?include_categories=true',
};
const OPEN_VLM_RESULTS_URL = 'http://opencompass.openxlab.space/assets/OpenVLM.json';
const FETCH_TIMEOUT_MS = 20_000;
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 2 * 60 * 60 * 1000;

const TYPE_MAP: Record<string, string> = {
  '🟢': 'pretrained', '🔶': 'fine-tuned', '💬': 'chat', '🤝': 'merge', '🏳': 'other',
};

function cleanType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [emoji, label] of Object.entries(TYPE_MAP)) {
    if (raw.startsWith(emoji)) return label;
  }
  return raw.replace(/[^\w\s-]/g, '').trim() || null;
}

function n(val: unknown): number | null {
  const v = Number(val);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function nAny(val: unknown): number | null {
  const v = Number(val);
  return Number.isFinite(v) ? v : null;
}

function parseId(fullname: string): { org: string; modelName: string } {
  const parts = fullname.split('/');
  return parts.length > 1
    ? { org: parts[0], modelName: parts.slice(1).join('/') }
    : { org: '', modelName: fullname };
}

@Injectable()
export class AiLeaderboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiLeaderboardService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private lastFetchedAt: string | null = null;

  constructor(
    @InjectRepository(AiLeaderboardEntryEntity)
    private readonly repo: Repository<AiLeaderboardEntryEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  onModuleInit() {
    setTimeout(() => this.refreshIfStale(), 12_000);
    this.refreshTimer = setInterval(() => this.refreshIfStale(), REFRESH_CHECK_MS);
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async getLeaderboard(options: {
    limit?: number;
    offset?: number;
    category?: string;
    type?: string;
    maxParams?: number;
    minParams?: number;
    refresh?: boolean;
    sortBy?: string;
    sortDir?: LeaderboardSortDir;
  } = {}): Promise<LeaderboardResult> {
    const category = options.category ?? 'llm';
    const count = await this.repo.count({ where: { category } });
    if (options.refresh || count === 0) {
      await this.doRefresh();
    } else {
      this.refreshIfStale();
    }

    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    let qb = this.repo.createQueryBuilder('e')
      .where('e.category = :category', { category });
    if (options.type) qb = qb.andWhere('e.modelType = :type', { type: options.type });
    if (options.maxParams != null) qb = qb.andWhere('e.params <= :maxP', { maxP: options.maxParams });
    if (options.minParams != null) qb = qb.andWhere('e.params >= :minP', { minP: options.minParams });

    const total = await qb.clone().getCount();
    const entities = await qb.getMany();
    const sorted = entities
      .map((e) => this.toEntry(e))
      .sort((a, b) => this.compareEntries(a, b, options.sortBy ?? 'rank', options.sortDir ?? 'asc'))
      .slice(offset, offset + limit);

    return {
      entries: sorted,
      total,
      fetchedAt: this.lastFetchedAt ?? entities[0]?.fetchedAt ?? null,
      category,
    };
  }

  private compareEntries(a: AiModelEntry, b: AiModelEntry, sortBy: string, sortDir: LeaderboardSortDir): number {
    const dir = sortDir === 'desc' ? -1 : 1;
    const valueOf = (entry: AiModelEntry): string | number | null => {
      switch (sortBy) {
        case 'rank': return entry.rank;
        case 'model':
        case 'modelName': return entry.modelName || entry.fullname;
        case 'org': return entry.org;
        case 'average': return entry.average;
        case 'params': return entry.params;
        case 'likes': return entry.likes;
        case 'sourceCount': return entry.sourceCount;
        case 'type':
        case 'modelType': return entry.modelType;
        default:
          if (sortBy in entry) {
            const value = (entry as unknown as Record<string, unknown>)[sortBy];
            return typeof value === 'number' || typeof value === 'string' ? value : null;
          }
          return entry.benchmarks?.[sortBy] ?? null;
      }
    };

    const av = valueOf(a);
    const bv = valueOf(b);
    if (av == null && bv == null) return a.rank - b.rank;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      const result = String(av).localeCompare(String(bv), 'ko');
      return result === 0 ? a.rank - b.rank : result * dir;
    }
    const result = av === bv ? 0 : av > bv ? 1 : -1;
    return result === 0 ? a.rank - b.rank : result * dir;
  }

  async getTopN(n = 5, category = 'llm'): Promise<AiModelEntry[]> {
    const count = await this.repo.count({ where: { category } });
    if (count === 0) await this.doRefresh();
    const entities = await this.repo.find({ where: { category }, order: { rank: 'ASC' }, take: n });
    return entities.map((e) => this.toEntry(e));
  }

  async getTopPerCategory(nPerCat = 1): Promise<{ category: string; label: string; entries: AiModelEntry[] }[]> {
    const results = await Promise.all(
      ALL_CATEGORIES.map(async (cat) => {
        const entities = await this.repo.find({ where: { category: cat }, order: { rank: 'ASC' }, take: nPerCat });
        return { category: cat, label: CATEGORY_LABELS[cat] ?? cat, entries: entities.map((e) => this.toEntry(e)) };
      }),
    );
    return results.filter((r) => r.entries.length > 0);
  }

  async getById(id: string): Promise<AiModelEntry | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? this.toEntry(entity) : null;
  }

  private async refreshIfStale(): Promise<void> {
    const counts = await Promise.all(ALL_CATEGORIES.map((cat) => this.repo.count({ where: { category: cat } })));
    if (counts.some((c) => c === 0)) { await this.doRefresh(); return; }

    const [newest] = await this.repo.find({ order: { updatedAt: 'DESC' }, take: 1 });
    if (!newest) { await this.doRefresh(); return; }

    const age = Date.now() - new Date(newest.updatedAt).getTime();
    if (age >= DAILY_REFRESH_MS) {
      this.doRefresh().catch((e) => this.logger.warn(`Background refresh failed: ${e instanceof Error ? e.message : e}`));
    }
  }

  private async doRefresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchAndStoreAll().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }

  // ─── Orchestrator ────────────────────────────────────────────────────────────

  private async fetchAndStoreAll(): Promise<void> {
    this.logger.log('Refreshing all AI leaderboard categories...');
    await Promise.allSettled([
      this.fetchAndStoreLlm(),
      this.fetchAndStoreVlm(),
      this.fetchAndStoreAsr(),
      this.fetchAndStoreTts(),
      this.fetchAndStoreCode(),
      this.fetchAndStoreTextToImage(),
      this.fetchAndStoreImageEditing(),
      this.fetchAndStoreTextToVideo(),
      this.fetchAndStoreImageToVideo(),
    ]);
    this.lastFetchedAt = new Date().toISOString();
    this.logger.log('AI leaderboard refresh complete');
  }

  // ─── LLM ─────────────────────────────────────────────────────────────────────

  private async fetchAndStoreLlm(): Promise<void> {
    this.logger.log('Fetching LLM leaderboard (HF Open LLM v2)...');
    const offsets: number[] = [];
    for (let i = 0; i < 5000; i += 100) offsets.push(i);

    const fetchPage = async (offset: number): Promise<unknown[]> => {
      try {
        const res = await this.hfFetch(`${LLM_DATASET_BASE}&offset=${offset}`);
        const data = res as { rows?: { row: unknown }[] };
        return (data.rows ?? []).map((r) => r.row);
      } catch { return []; }
    };

    const CONCURRENCY = 15;
    const allRows: unknown[] = [];
    for (let i = 0; i < offsets.length; i += CONCURRENCY) {
      const results = await Promise.all(offsets.slice(i, i + CONCURRENCY).map(fetchPage));
      results.forEach((rows) => allRows.push(...rows));
    }

    type RawRow = Record<string, unknown>;
    const clean = (allRows as RawRow[])
      .filter((r) => r['Average ⬆️'] && !r['Flagged'] && !r['Merged'] && r['#Params (B)'])
      .sort((a, b) => (Number(b['Average ⬆️']) || 0) - (Number(a['Average ⬆️']) || 0));

    const benchmarkEntries: NormalizedEntry[] = clean.map((r) => {
      const fullname = String(r['fullname'] ?? r['Model'] ?? '');
      const { org, modelName } = parseId(fullname);
      return {
        id: fullname,
        fullname, org, modelName,
        average: n(r['Average ⬆️']),
        params: n(r['#Params (B)']),
        architecture: (r['Architecture'] as string) ?? null,
        modelType: cleanType(r['Type'] as string),
        license: (r['Hub License'] as string) ?? null,
        likes: typeof r['Hub ❤️'] === 'number' ? (r['Hub ❤️'] as number) : null,
        benchmarks: {
          ifeval: n(r['IFEval']),
          bbh: n(r['BBH']),
          mathLvl5: n(r['MATH Lvl 5']),
          gpqa: n(r['GPQA']),
          musr: n(r['MUSR']),
          mmluPro: n(r['MMLU-PRO']),
        },
      };
    });

    const sourceGroups: NormalizedEntry[][] = [
      this.withSourceScores(benchmarkEntries, 'HF Open LLM Leaderboard v2'),
    ];

    try {
      const artificialAnalysisEntries = await this.fetchArtificialAnalysisLlmEntries();
      if (artificialAnalysisEntries.length > 0) sourceGroups.push(artificialAnalysisEntries);
    } catch (e) {
      this.logger.warn(`Artificial Analysis LLM API failed: ${e instanceof Error ? e.message : e}`);
    }

    const mergedBenchmarkEntries = this.mergeEntriesByModel('llm', sourceGroups);
    const entries = await this.addHfPopularityEvidence(
      'llm',
      mergedBenchmarkEntries,
      'text-generation',
      300,
    );
    await this.storeEntries(entries, 'llm');
    this.logger.log(`Stored ${entries.length} LLM entries`);
  }

  private async fetchArtificialAnalysisLlmEntries(): Promise<NormalizedEntry[]> {
    const apiKey = await this.getArtificialAnalysisApiKey();
    if (!apiKey) {
      this.logger.warn('Artificial Analysis API key is not configured; skipping source.');
      return [];
    }

    const response = await this.fetchJson(ARTIFICIAL_ANALYSIS_LLM_MODELS_URL, {
      'x-api-key': apiKey,
      Accept: 'application/json',
    }) as { data?: unknown[] };

    type ArtificialModel = {
      id?: string;
      name?: string;
      slug?: string;
      model_creator?: { name?: string; slug?: string };
      evaluations?: Record<string, unknown>;
      pricing?: Record<string, unknown>;
      median_output_tokens_per_second?: unknown;
      median_time_to_first_token_seconds?: unknown;
    };

    return (Array.isArray(response.data) ? response.data : [])
      .map((item): NormalizedEntry | null => {
        const row = item as ArtificialModel;
        const fullname = String(row.name ?? row.slug ?? row.id ?? '').trim();
        if (!fullname) return null;
        const creator = row.model_creator ?? {};
        const org = String(creator.name ?? creator.slug ?? '').trim();
        const evaluations = row.evaluations ?? {};
        const intelligenceIndex = nAny(evaluations.artificial_analysis_intelligence_index);
        const codingIndex = nAny(evaluations.artificial_analysis_coding_index);
        const mathIndex = nAny(evaluations.artificial_analysis_math_index);

        const benchmarks = {
          ifeval: this.percentScore(evaluations.ifbench),
          bbh: null,
          mathLvl5: this.percentScore(evaluations.math_500 ?? evaluations.aime_25 ?? evaluations.aime),
          gpqa: this.percentScore(evaluations.gpqa),
          musr: null,
          mmluPro: this.percentScore(evaluations.mmlu_pro),
          hle: this.percentScore(evaluations.hle),
          livecodebench: this.percentScore(evaluations.livecodebench),
          scicode: this.percentScore(evaluations.scicode),
          artificialAnalysisCoding: codingIndex,
          artificialAnalysisMath: mathIndex,
          outputTokensPerSecond: nAny(row.median_output_tokens_per_second),
          timeToFirstTokenSeconds: nAny(row.median_time_to_first_token_seconds),
          priceInput1M: nAny(row.pricing?.price_1m_input_tokens),
          priceOutput1M: nAny(row.pricing?.price_1m_output_tokens),
        };

        return {
          id: this.entryId('llm', fullname),
          fullname,
          org,
          modelName: fullname,
          average: intelligenceIndex,
          params: null,
          modelType: null,
          license: null,
          architecture: null,
          likes: null,
          benchmarks,
          sourceScores: {
            'Artificial Analysis Intelligence Index': intelligenceIndex,
          },
        };
      })
      .filter(Boolean) as NormalizedEntry[];
  }

  // ─── VLM ─────────────────────────────────────────────────────────────────────

  private async fetchAndStoreVlm(): Promise<void> {
    this.logger.log('Fetching VLM leaderboard...');
    let entries: NormalizedEntry[] = [];

    // Primary: OpenVLM Leaderboard dataset
    try {
      entries = await this.fetchVlmFromDataset();
    } catch (e) {
      this.logger.warn(`VLM dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`);
    }

    entries = await this.addHfPopularityEvidence(
      'vlm',
      this.withSourceScores(entries, 'OpenVLM Leaderboard'),
      'image-text-to-text',
      120,
    );

    await this.storeEntries(entries, 'vlm');
    this.logger.log(`Stored ${entries.length} VLM entries`);
  }

  private async fetchVlmFromDataset(): Promise<NormalizedEntry[]> {
    try {
      const entries = await this.fetchVlmFromOpenCompassJson();
      if (entries.length > 0) return entries;
    } catch (e) {
      this.logger.warn(`OpenVLM JSON fetch failed: ${e instanceof Error ? e.message : e}`);
    }

    const splits = ['leaderboard', 'train', 'test'];
    for (const split of splits) {
      try {
        const rows = await this.fetchHfDatasetPage('opencompass/open_vlm_leaderboard', 'default', split, 0, 500);
        if (rows.length > 0) return this.parseVlmRows(rows);
      } catch { /* try next */ }
    }
    throw new Error('No data from any VLM dataset split');
  }

  private async fetchVlmFromOpenCompassJson(): Promise<NormalizedEntry[]> {
    const data = await this.hfFetch(OPEN_VLM_RESULTS_URL) as {
      results?: Record<string, Record<string, unknown>>;
    };
    const results = data?.results ?? {};

    return Object.entries(results).map(([fallbackName, item]): NormalizedEntry | null => {
      const meta = (item.META ?? {}) as Record<string, unknown>;
      const method = Array.isArray(meta.Method) ? meta.Method[0] : meta.Method;
      const fullname = String(method ?? fallbackName).trim();
      if (!fullname) return null;
      const org = String(meta.Org ?? '').trim();
      const parsed = parseId(fullname);
      const benchmarks = {
        mmbench: this.openVlmOverall(item, 'MMBench_TEST_EN_V11') ?? this.openVlmOverall(item, 'MMBench_TEST_EN'),
        mmstar: this.openVlmOverall(item, 'MMStar'),
        mmmu: this.openVlmOverall(item, 'MMMU_VAL'),
        mathvista: this.openVlmOverall(item, 'MathVista'),
        ai2d: this.openVlmOverall(item, 'AI2D'),
        hallusionbench: this.openVlmOverall(item, 'HallusionBench'),
        ocrbench: this.openVlmOcrScore(item),
      };
      const average = this.averageNumbers(Object.values(benchmarks));

      return {
        id: this.entryId('vlm', fullname),
        fullname,
        org: org || parsed.org,
        modelName: parsed.modelName || fullname,
        average,
        params: this.parseParamB(meta.Parameters),
        modelType: meta.OpenSource === 'Yes' ? 'open-source' : meta.OpenSource === 'No' ? 'api' : null,
        license: null,
        architecture: String(meta['Language Model'] ?? meta['Vision Model'] ?? '').trim() || null,
        likes: null,
        benchmarks,
      };
    }).filter(Boolean) as NormalizedEntry[];
  }

  private parseVlmRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[]).map((r): NormalizedEntry | null => {
      const fullname = String(r['Method'] ?? r['Model'] ?? r['model'] ?? r['model_name'] ?? '').trim();
      if (!fullname) return null;
      const { org, modelName } = parseId(fullname);
      const avg = nAny(r['Average'] ?? r['Overall'] ?? r['average'] ?? r['score']);
      const benchmarks = {
        mmbench: nAny(r['MMBench-v1.1-en'] ?? r['MMBench_V11'] ?? r['MMBench'] ?? r['mmbench']),
        mmstar: nAny(r['MMStar'] ?? r['mmstar']),
        mmmu: nAny(r['MMMU_Val'] ?? r['MMMU_VAL'] ?? r['MMMU'] ?? r['mmmu']),
        mathvista: nAny(r['MathVista_MINI'] ?? r['MathVista'] ?? r['mathvista']),
        ai2d: nAny(r['AI2D_TEST'] ?? r['AI2D'] ?? r['ai2d']),
        hallusionbench: nAny(r['HallusionBench'] ?? r['hallusionbench']),
        ocrbench: nAny(r['OCRBench'] ?? r['ocrbench']),
      };
      return {
        id: `vlm:${fullname}`,
        fullname, org, modelName,
        average: avg ?? this.averageNumbers(Object.values(benchmarks)),
        params: n(r['Params (B)'] ?? r['#Params (B)'] ?? r['params']),
        modelType: null, license: null, architecture: null,
        likes: n(r['Hub ❤️'] ?? r['likes']),
        benchmarks,
      };
    }).filter(Boolean) as NormalizedEntry[];
  }

  // ─── ASR ─────────────────────────────────────────────────────────────────────

  private async fetchAndStoreAsr(): Promise<void> {
    this.logger.log('Fetching ASR leaderboard...');
    let entries: NormalizedEntry[] = [];

    try {
      entries = await this.fetchAsrFromDataset();
    } catch (e) {
      this.logger.warn(`ASR dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`);
    }

    entries = await this.addHfPopularityEvidence(
      'asr',
      this.withSourceScores(entries, 'Open ASR Leaderboard'),
      'automatic-speech-recognition',
      120,
    );

    await this.storeEntries(entries, 'asr');
    this.logger.log(`Stored ${entries.length} ASR entries`);
  }

  private async fetchAsrFromDataset(): Promise<NormalizedEntry[]> {
    const splits = ['train', 'test', 'results'];
    for (const split of splits) {
      try {
        const rows = await this.fetchHfDatasetPage('hf-audio/open_asr_leaderboard', 'default', split, 0, 300);
        if (rows.length > 0) return this.parseAsrRows(rows);
      } catch { /* try next */ }
    }
    throw new Error('No ASR data found');
  }

  private parseAsrRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[]).map((r): NormalizedEntry | null => {
      const fullname = String(r['model'] ?? r['model_id'] ?? r['Model'] ?? '').trim();
      if (!fullname) return null;
      const { org, modelName } = parseId(fullname);

      // WER: lower is better → convert to accuracy (100 - WER)
      const wer = (key: string) => {
        const v = nAny(r[key]);
        return v != null ? Math.max(0, 100 - v) : null;
      };
      const avgWer = nAny(r['average'] ?? r['Average'] ?? r['avg_wer']);
      const average = avgWer != null ? Math.max(0, 100 - avgWer) : null;

      return {
        id: `asr:${fullname}`,
        fullname, org, modelName,
        average,
        params: n(r['params'] ?? r['Params'] ?? r['#Params (B)']),
        modelType: (r['type'] ?? r['Type'] as string | undefined) ? String(r['type'] ?? r['Type']) : null,
        license: null, architecture: null, likes: null,
        benchmarks: {
          libriSpeechClean: wer('librispeech.clean') ?? wer('librispeech_clean') ?? wer('LibriSpeech clean') ?? wer('AMI'),
          libriSpeechOther: wer('librispeech.other') ?? wer('librispeech_other') ?? wer('LibriSpeech other'),
          commonVoice: wer('common_voice') ?? wer('Common Voice') ?? wer('cv'),
          voxpopuli: wer('voxpopuli') ?? wer('VoxPopuli'),
          earnings22: wer('earnings22') ?? wer('Earnings22'),
        },
      };
    }).filter(Boolean) as NormalizedEntry[];
  }

  // ─── Code ────────────────────────────────────────────────────────────────────

  private async fetchAndStoreCode(): Promise<void> {
    this.logger.log('Fetching Code leaderboard...');
    let entries: NormalizedEntry[] = [];

    try {
      entries = await this.fetchCodeFromDataset();
    } catch (e) {
      this.logger.warn(`Code dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`);
    }

    if (entries.length === 0) {
      const raw = await this.fetchHfPopularityEntries('text-generation', 'code', 150, 'code');
      // Filter: keep models whose name contains coding keywords
      const CODE_KEYWORDS = ['code', 'coder', 'coding', 'starcoder', 'deepseek-coder', 'codellama', 'codegen', 'wizard-coder', 'phind', 'replit'];
      entries = raw.filter((e) => CODE_KEYWORDS.some((k) => e.fullname.toLowerCase().includes(k)));
    }

    entries = await this.addHfPopularityEvidence(
      'code',
      this.withSourceScores(entries, 'Code Benchmark Leaderboards'),
      'text-generation',
      180,
      'code',
    );
    await this.storeEntries(entries, 'code');
    this.logger.log(`Stored ${entries.length} Code entries`);
  }

  private async fetchCodeFromDataset(): Promise<NormalizedEntry[]> {
    // Try BigCode leaderboard
    const datasets = [
      { dataset: 'bigcode/bigcode-models-leaderboard', config: 'default', split: 'train', source: 'BigCode Models Leaderboard' },
      { dataset: 'EvalPlus-Org/evalplus-leaderboard', config: 'default', split: 'train', source: 'EvalPlus Leaderboard' },
    ];
    const sourceEntries: NormalizedEntry[][] = [];

    for (const { dataset, config, split, source } of datasets) {
      try {
        const rows = await this.fetchHfDatasetPage(dataset, config, split, 0, 300);
        const entries = this.withSourceScores(this.parseCodeRows(rows), source);
        if (entries.length > 0) sourceEntries.push(entries);
      } catch (e) {
        this.logger.warn(`Code source ${source} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (sourceEntries.length > 0) return this.mergeEntriesByModel('code', sourceEntries);
    throw new Error('No Code data found');
  }

  private parseCodeRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[]).map((r): NormalizedEntry | null => {
      const fullname = String(r['model_name'] ?? r['Model'] ?? r['model'] ?? '').trim();
      if (!fullname) return null;
      const { org, modelName } = parseId(fullname);
      const avg = nAny(r['average_pass@1'] ?? r['average'] ?? r['Average'] ?? r['pass@1']);
      return {
        id: `code:${fullname}`,
        fullname, org, modelName,
        average: avg,
        params: n(r['params'] ?? r['#Params (B)'] ?? r['Params (B)']),
        modelType: null, license: null, architecture: null, likes: null,
        benchmarks: {
          humanEval: nAny(r['humaneval_pass@1'] ?? r['HumanEval'] ?? r['humaneval']),
          mbpp: nAny(r['mbpp_pass@1'] ?? r['MBPP'] ?? r['mbpp']),
          humanEvalPlus: nAny(r['humaneval+_pass@1'] ?? r['HumanEval+'] ?? r['humaneval_plus']),
          mbppPlus: nAny(r['mbpp+_pass@1'] ?? r['MBPP+'] ?? r['mbpp_plus']),
          ds1000: nAny(r['ds1000'] ?? r['DS-1000']),
        },
      };
    }).filter(Boolean) as NormalizedEntry[];
  }

  // ─── Text-to-Image ───────────────────────────────────────────────────────────

  private async fetchAndStoreTextToImage(): Promise<void> {
    this.logger.log('Fetching Text-to-Image models...');
    const artificialAnalysisEntries = await this.fetchArtificialAnalysisMediaEntries('text-to-image');
    const hfEntries = await this.fetchHfPopularityEntries('text-to-image', 'text-to-image', 120);
    const entries = artificialAnalysisEntries.length > 0
      ? this.mergeEntriesByModel('text-to-image', [artificialAnalysisEntries, hfEntries])
      : hfEntries;
    await this.storeEntries(entries, 'text-to-image');
    this.logger.log(`Stored ${entries.length} Text-to-Image entries`);
  }

  // ─── Artificial Analysis Media Categories ───────────────────────────────────

  private async fetchAndStoreTts(): Promise<void> {
    this.logger.log('Fetching Text-to-Speech models...');
    const entries = await this.fetchArtificialAnalysisMediaEntries('tts');
    await this.storeEntries(entries, 'tts');
    this.logger.log(`Stored ${entries.length} Text-to-Speech entries`);
  }

  private async fetchAndStoreImageEditing(): Promise<void> {
    this.logger.log('Fetching Image Editing models...');
    const entries = await this.fetchArtificialAnalysisMediaEntries('image-editing');
    await this.storeEntries(entries, 'image-editing');
    this.logger.log(`Stored ${entries.length} Image Editing entries`);
  }

  private async fetchAndStoreTextToVideo(): Promise<void> {
    this.logger.log('Fetching Text-to-Video models...');
    const entries = await this.fetchArtificialAnalysisMediaEntries('text-to-video');
    await this.storeEntries(entries, 'text-to-video');
    this.logger.log(`Stored ${entries.length} Text-to-Video entries`);
  }

  private async fetchAndStoreImageToVideo(): Promise<void> {
    this.logger.log('Fetching Image-to-Video models...');
    const entries = await this.fetchArtificialAnalysisMediaEntries('image-to-video');
    await this.storeEntries(entries, 'image-to-video');
    this.logger.log(`Stored ${entries.length} Image-to-Video entries`);
  }

  private async fetchArtificialAnalysisMediaEntries(category: string): Promise<NormalizedEntry[]> {
    const endpoint = ARTIFICIAL_ANALYSIS_MEDIA_ENDPOINTS[category];
    if (!endpoint) return [];

    const apiKey = await this.getArtificialAnalysisApiKey();
    if (!apiKey) {
      this.logger.warn(`Artificial Analysis API key is not configured; skipping ${category}.`);
      return [];
    }

    const response = await this.fetchJson(endpoint, {
      'x-api-key': apiKey,
      Accept: 'application/json',
    }) as { data?: unknown[] };

    type ArtificialMediaModel = {
      id?: string;
      name?: string;
      slug?: string;
      model_creator?: { name?: string; slug?: string };
      elo?: unknown;
      rank?: unknown;
      ci95?: string;
      appearances?: unknown;
      release_date?: string;
      categories?: Array<Record<string, unknown>>;
    };

    const rows = (Array.isArray(response.data) ? response.data : []) as ArtificialMediaModel[];
    const eloValues = rows.map((row) => nAny(row.elo)).filter((value): value is number => value != null);
    const minElo = Math.min(...eloValues);
    const maxElo = Math.max(...eloValues);

    return rows.map((row): NormalizedEntry | null => {
      const fullname = String(row.name ?? row.slug ?? row.id ?? '').trim();
      if (!fullname) return null;
      const creator = row.model_creator ?? {};
      const org = String(creator.name ?? creator.slug ?? '').trim();
      const elo = nAny(row.elo);
      const qualityScore = this.normalizeRangeScore(elo, minElo, maxElo);
      const categoryElos = (row.categories ?? [])
        .map((item) => nAny(item.elo))
        .filter((value): value is number => value != null);
      const categoryBestElo = categoryElos.length > 0 ? Math.max(...categoryElos) : null;
      const appearances = nAny(row.appearances);

      return {
        id: this.entryId(category, fullname),
        fullname,
        org,
        modelName: fullname,
        average: qualityScore,
        params: null,
        modelType: null,
        license: null,
        architecture: row.release_date ?? null,
        likes: null,
        benchmarks: {
          elo,
          aaRank: nAny(row.rank),
          appearances,
          categoryBestElo,
          categoryCount: categoryElos.length || null,
        },
        sourceScores: {
          'Artificial Analysis Elo': qualityScore,
        },
      };
    }).filter(Boolean) as NormalizedEntry[];
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private async fetchHfDatasetPage(
    dataset: string,
    config: string,
    split: string,
    offset: number,
    length: number,
  ): Promise<unknown[]> {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${config}&split=${split}&length=${length}&offset=${offset}`;
    const data = await this.hfFetch(url) as { rows?: { row: unknown }[] };
    return (data.rows ?? []).map((r) => r.row);
  }

  private async fetchHfPopularityEntries(
    pipelineTag: string,
    category: string,
    limit: number,
    tagFilter?: string,
  ): Promise<NormalizedEntry[]> {
    let url = `https://huggingface.co/api/models?pipeline_tag=${encodeURIComponent(pipelineTag)}&sort=likes&limit=${limit}&full=false`;
    if (tagFilter) url += `&filter=${encodeURIComponent(tagFilter)}`;
    try {
      const models = await this.hfFetch(url) as Array<{ id: string; likes?: number; downloads?: number; author?: string; tags?: string[] }>;
      const rows = Array.isArray(models) ? models : [];
      const likeValues = rows.map((model) => model.likes ?? 0);
      const downloadValues = rows.map((model) => model.downloads ?? 0);
      const maxLikeScore = Math.max(...likeValues.map((value) => Math.log1p(value)), 1);
      const maxDownloadScore = Math.max(...downloadValues.map((value) => Math.log1p(value)), 1);

      return rows.map((m): NormalizedEntry => {
        const fullname = m.id;
        const { org, modelName } = parseId(fullname);
        const likes = typeof m.likes === 'number' ? m.likes : null;
        const downloads = typeof m.downloads === 'number' ? m.downloads : null;
        const likeScore = likes != null ? Math.round((Math.log1p(likes) / maxLikeScore) * 1000) / 10 : null;
        const downloadScore = downloads != null ? Math.round((Math.log1p(downloads) / maxDownloadScore) * 1000) / 10 : null;
        const average = this.averageNumbers([likeScore, downloadScore]);
        return {
          id: this.entryId(category, fullname),
          fullname, org, modelName,
          average,
          params: null, modelType: null, license: null, architecture: null,
          likes,
          benchmarks: {
            hfLikes: likes,
            hfDownloads: downloads != null ? Math.round(downloads / 1000) : null,
          },
          sourceScores: {
            'HuggingFace Likes': likeScore,
            'HuggingFace Downloads': downloadScore,
          },
        };
      });
    } catch (e) {
      this.logger.warn(`HF models API failed for ${pipelineTag}: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  private async addHfPopularityEvidence(
    category: string,
    benchmarkEntries: NormalizedEntry[],
    pipelineTag: string,
    limit: number,
    tagFilter?: string,
  ): Promise<NormalizedEntry[]> {
    const popularityEntries = await this.fetchHfPopularityEntries(pipelineTag, category, limit, tagFilter);
    if (benchmarkEntries.length === 0) return this.rankEntries(popularityEntries);
    const benchmarkKeys = new Set(benchmarkEntries.map((entry) => this.modelKey(entry.fullname)));
    return this.mergeEntriesByModel(category, [benchmarkEntries, popularityEntries])
      .filter((entry) => benchmarkKeys.has(this.modelKey(entry.fullname)));
  }

  private openVlmOverall(item: Record<string, unknown>, benchmark: string): number | null {
    const value = item[benchmark];
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    return nAny(row.Overall ?? row.overall ?? row.Score ?? row.score ?? row.Acc ?? row.acc);
  }

  private openVlmOcrScore(item: Record<string, unknown>): number | null {
    const value = item.OCRBench;
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const finalScore = nAny(row['Final Score'] ?? row.Overall ?? row.overall);
    if (finalScore == null) return null;
    // OpenVLM OCRBench is a 0-1000 style score. Normalize for table/radar consistency.
    return finalScore > 100 ? Math.round((finalScore / 10) * 10) / 10 : finalScore;
  }

  private parseParamB(value: unknown): number | null {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    const numeric = Number(text.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (/m\b/i.test(text) && !/b\b/i.test(text)) return Math.round((numeric / 1000) * 1000) / 1000;
    return numeric;
  }

  private withSourceScores(entries: NormalizedEntry[], sourceName: string): NormalizedEntry[] {
    return entries.map((entry) => {
      const sourceScores = { ...(entry.sourceScores ?? {}) };
      if (entry.average != null && Object.keys(sourceScores).length === 0) {
        sourceScores[sourceName] = entry.average;
      }
      return {
        ...entry,
        sourceScores,
      };
    });
  }

  private mergeEntriesByModel(category: string, sourceEntryGroups: NormalizedEntry[][]): NormalizedEntry[] {
    const byModel = new Map<string, NormalizedEntry>();

    for (const entries of sourceEntryGroups) {
      for (const entry of entries) {
        const key = this.modelKey(entry.fullname);
        const current = byModel.get(key);
        if (!current) {
          byModel.set(key, {
            ...entry,
            id: this.entryId(category, entry.fullname),
            benchmarks: { ...(entry.benchmarks ?? {}) },
            sourceScores: { ...(entry.sourceScores ?? {}) },
          });
          continue;
        }

        const mergedSourceScores = {
          ...(current.sourceScores ?? {}),
          ...(entry.sourceScores ?? {}),
        };
        const mergedBenchmarks = { ...(current.benchmarks ?? {}) };
        for (const [benchmark, value] of Object.entries(entry.benchmarks ?? {})) {
          if (mergedBenchmarks[benchmark] == null && value != null) mergedBenchmarks[benchmark] = value;
        }

        byModel.set(key, {
          ...current,
          org: current.org || entry.org,
          modelName: current.modelName || entry.modelName,
          params: current.params ?? entry.params,
          architecture: current.architecture ?? entry.architecture,
          modelType: current.modelType ?? entry.modelType,
          license: current.license ?? entry.license,
          likes: current.likes ?? entry.likes,
          benchmarks: mergedBenchmarks,
          sourceScores: mergedSourceScores,
          average: this.averageNumbers(Object.values(mergedSourceScores)),
        });
      }
    }

    return this.rankEntries(Array.from(byModel.values()));
  }

  private rankEntries(entries: NormalizedEntry[]): NormalizedEntry[] {
    return [...entries].sort((a, b) => {
      const scoreDelta = (b.average ?? -Infinity) - (a.average ?? -Infinity);
      if (scoreDelta !== 0) return scoreDelta;
      return this.sourceCount(b) - this.sourceCount(a);
    });
  }

  private sourceCount(entry: NormalizedEntry): number {
    return Object.values(entry.sourceScores ?? {}).filter((value) => value != null).length;
  }

  private entryId(category: string, fullname: string): string {
    return category === 'llm' ? fullname : `${category}:${fullname}`;
  }

  private modelKey(fullname: string): string {
    return fullname.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private averageNumbers(values: Array<number | null | undefined>): number | null {
    const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
  }

  private normalizeRangeScore(value: number | null, min: number, max: number): number | null {
    if (value == null || !Number.isFinite(min) || !Number.isFinite(max)) return value;
    if (max <= min) return 100;
    return Math.round(((value - min) / (max - min)) * 1000) / 10;
  }

  private percentScore(value: unknown): number | null {
    const numeric = nAny(value);
    if (numeric == null) return null;
    return numeric <= 1 ? Math.round(numeric * 1000) / 10 : numeric;
  }

  private async getArtificialAnalysisApiKey(): Promise<string | null> {
    const contextKey = requestContext.getStore()?.apiKeys.artificialAnalysisApiKey?.trim();
    if (contextKey) return contextKey;

    const envKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY?.trim();
    if (envKey) return envKey;

    const user = await this.userRepo
      .createQueryBuilder('user')
      .where('user.artificialAnalysisApiKey IS NOT NULL')
      .andWhere("user.artificialAnalysisApiKey != ''")
      .orderBy('user.updatedAt', 'DESC')
      .getOne();
    return user?.artificialAnalysisApiKey?.trim() || null;
  }

  private async fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async hfFetch(url: string): Promise<unknown> {
    return this.fetchJson(url, { Accept: 'application/json' });
  }

  private async storeEntries(entries: NormalizedEntry[], category: string): Promise<void> {
    if (entries.length === 0) return;
    const fetchedAt = new Date().toISOString();
    const CHUNK = 200;
    const rankedEntries = this.rankEntries(entries);
    for (let i = 0; i < rankedEntries.length; i += CHUNK) {
      const chunk = rankedEntries.slice(i, i + CHUNK);
      const entities = chunk.map((entry, idx) => {
        const b = entry.benchmarks;
        const sourceScores = entry.sourceScores ?? {};
        return this.repo.create({
          id: entry.id,
          fullname: entry.fullname,
          org: entry.org,
          modelName: entry.modelName,
          category,
          rank: i + idx + 1,
          average: entry.average,
          // LLM-specific columns (populated only for LLM category)
          ifeval: category === 'llm' ? (b.ifeval ?? null) : null,
          bbh: category === 'llm' ? (b.bbh ?? null) : null,
          mathLvl5: category === 'llm' ? (b.mathLvl5 ?? null) : null,
          gpqa: category === 'llm' ? (b.gpqa ?? null) : null,
          musr: category === 'llm' ? (b.musr ?? null) : null,
          mmluPro: category === 'llm' ? (b.mmluPro ?? null) : null,
          benchmarksJson: JSON.stringify(b),
          sourceScoresJson: JSON.stringify(sourceScores),
          sourceCount: Object.values(sourceScores).filter((value) => value != null).length,
          params: entry.params,
          architecture: entry.architecture,
          modelType: entry.modelType,
          license: entry.license,
          likes: entry.likes,
          fetchedAt,
        });
      });
      await this.repo.upsert(entities, ['id']);
    }
  }

  private toEntry(e: AiLeaderboardEntryEntity): AiModelEntry {
    let benchmarks: Record<string, number | null> = {};
    let sourceScores: Record<string, number | null> = {};
    try { benchmarks = JSON.parse(e.benchmarksJson || '{}'); } catch { /* noop */ }
    try { sourceScores = JSON.parse(e.sourceScoresJson || '{}'); } catch { /* noop */ }

    return {
      id: e.id,
      fullname: e.fullname,
      org: e.org,
      modelName: e.modelName,
      rank: e.rank,
      category: e.category ?? 'llm',
      average: e.average,
      ifeval: e.ifeval,
      bbh: e.bbh,
      mathLvl5: e.mathLvl5,
      gpqa: e.gpqa,
      musr: e.musr,
      mmluPro: e.mmluPro,
      params: e.params,
      architecture: e.architecture,
      modelType: e.modelType,
      license: e.license,
      likes: e.likes,
      fetchedAt: e.fetchedAt,
      benchmarks,
      sourceScores,
      sourceCount: e.sourceCount ?? Object.values(sourceScores).filter((value) => value != null).length,
    };
  }
}
