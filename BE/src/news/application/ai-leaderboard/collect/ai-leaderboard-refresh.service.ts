import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NormalizedLeaderboardEntry as NormalizedEntry } from 'src/news/application/ai-leaderboard/ai-leaderboard.types';
import { AiLeaderboardSourceService } from 'src/news/application/ai-leaderboard/collect/ai-leaderboard-source.service';
import { AiLeaderboardScoreService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-score.service';
import { AiLeaderboardStoreService } from 'src/news/application/ai-leaderboard/store/ai-leaderboard-store.service';
import { AiLeaderboardPopularityService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-popularity.service';
import { AiLeaderboardMediaService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-media.service';

const LLM_DATASET_BASE =
  'https://datasets-server.huggingface.co/rows?dataset=open-llm-leaderboard%2Fcontents&config=default&split=train&length=100';
const ARTIFICIAL_ANALYSIS_LLM_MODELS_URL =
  'https://artificialanalysis.ai/api/v2/data/llms/models';
const OPEN_VLM_RESULTS_URL =
  'http://opencompass.openxlab.space/assets/OpenVLM.json';
const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const REFRESH_CHECK_MS = 2 * 60 * 60 * 1000;

const TYPE_MAP: Record<string, string> = {
  '🟢': 'pretrained',
  '🔶': 'fine-tuned',
  '💬': 'chat',
  '🤝': 'merge',
  '🏳': 'other',
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

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function parseId(fullname: string): { org: string; modelName: string } {
  const parts = fullname.split('/');
  return parts.length > 1
    ? { org: parts[0], modelName: parts.slice(1).join('/') }
    : { org: '', modelName: fullname };
}

@Injectable()
export class AiLeaderboardRefreshService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AiLeaderboardRefreshService.name);
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly source: AiLeaderboardSourceService,
    private readonly scores: AiLeaderboardScoreService,
    private readonly store: AiLeaderboardStoreService,
    private readonly popularity: AiLeaderboardPopularityService,
    private readonly media: AiLeaderboardMediaService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.refreshIfStale(), 12_000);
    this.refreshTimer = setInterval(
      () => void this.refreshIfStale(),
      REFRESH_CHECK_MS,
    );
    this.refreshTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async refreshIfStale(): Promise<void> {
    if (await this.store.needsRefresh(DAILY_REFRESH_MS)) {
      this.refresh().catch((e) =>
        this.logger.warn(
          `Background refresh failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchAndStoreAll().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  // ─── Orchestrator ────────────────────────────────────────────────────────────

  private async fetchAndStoreAll(): Promise<void> {
    this.logger.log('Refreshing all AI leaderboard categories...');
    await Promise.allSettled([
      this.fetchAndStoreLlm(),
      this.fetchAndStoreVlm(),
      this.fetchAndStoreAsr(),
      this.media.refresh('tts'),
      this.fetchAndStoreCode(),
      this.media.refresh('text-to-image'),
      this.media.refresh('image-editing'),
      this.media.refresh('text-to-video'),
      this.media.refresh('image-to-video'),
    ]);
    this.logger.log('AI leaderboard refresh complete');
  }

  // ─── LLM ─────────────────────────────────────────────────────────────────────

  private async fetchAndStoreLlm(): Promise<void> {
    this.logger.log('Fetching LLM leaderboard (HF Open LLM v2)...');
    const offsets: number[] = [];
    for (let i = 0; i < 5000; i += 100) offsets.push(i);

    const fetchPage = async (offset: number): Promise<unknown[]> => {
      try {
        const res = await this.source.fetchHuggingFaceJson(
          `${LLM_DATASET_BASE}&offset=${offset}`,
        );
        const data = res as { rows?: { row: unknown }[] };
        return (data.rows ?? []).map((r) => r.row);
      } catch {
        return [];
      }
    };

    const CONCURRENCY = 15;
    const allRows: unknown[] = [];
    for (let i = 0; i < offsets.length; i += CONCURRENCY) {
      const results = await Promise.all(
        offsets.slice(i, i + CONCURRENCY).map(fetchPage),
      );
      results.forEach((rows) => allRows.push(...rows));
    }

    type RawRow = Record<string, unknown>;
    const clean = (allRows as RawRow[])
      .filter(
        (r) =>
          r['Average ⬆️'] && !r['Flagged'] && !r['Merged'] && r['#Params (B)'],
      )
      .sort(
        (a, b) =>
          (Number(b['Average ⬆️']) || 0) - (Number(a['Average ⬆️']) || 0),
      );

    const benchmarkEntries: NormalizedEntry[] = clean.map((r) => {
      const fullname = text(r['fullname'] ?? r['Model']);
      const { org, modelName } = parseId(fullname);
      return {
        id: fullname,
        fullname,
        org,
        modelName,
        average: n(r['Average ⬆️']),
        params: n(r['#Params (B)']),
        architecture: (r['Architecture'] as string) ?? null,
        modelType: cleanType(r['Type'] as string),
        license: (r['Hub License'] as string) ?? null,
        likes: typeof r['Hub ❤️'] === 'number' ? r['Hub ❤️'] : null,
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
      this.scores.withSourceScores(
        benchmarkEntries,
        'HF Open LLM Leaderboard v2',
      ),
    ];

    try {
      const artificialAnalysisEntries =
        await this.fetchArtificialAnalysisLlmEntries();
      if (artificialAnalysisEntries.length > 0)
        sourceGroups.push(artificialAnalysisEntries);
    } catch (e) {
      this.logger.warn(
        `Artificial Analysis LLM API failed: ${e instanceof Error ? e.message : e}`,
      );
    }

    const mergedBenchmarkEntries = this.scores.mergeByModel(
      'llm',
      sourceGroups,
    );
    const entries = await this.popularity.addEvidence(
      'llm',
      mergedBenchmarkEntries,
      'text-generation',
      300,
    );
    await this.store.save(entries, 'llm');
    this.logger.log(`Stored ${entries.length} LLM entries`);
  }

  private async fetchArtificialAnalysisLlmEntries(): Promise<
    NormalizedEntry[]
  > {
    const apiKey = await this.source.getArtificialAnalysisApiKey();
    if (!apiKey) {
      this.logger.warn(
        'Artificial Analysis API key is not configured; skipping source.',
      );
      return [];
    }

    const response = (await this.source.fetchJson(
      ARTIFICIAL_ANALYSIS_LLM_MODELS_URL,
      {
        'x-api-key': apiKey,
        Accept: 'application/json',
      },
    )) as { data?: unknown[] };

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
        const intelligenceIndex = nAny(
          evaluations.artificial_analysis_intelligence_index,
        );
        const codingIndex = nAny(evaluations.artificial_analysis_coding_index);
        const mathIndex = nAny(evaluations.artificial_analysis_math_index);

        const benchmarks = {
          ifeval: this.scores.percent(evaluations.ifbench),
          bbh: null,
          mathLvl5: this.scores.percent(
            evaluations.math_500 ?? evaluations.aime_25 ?? evaluations.aime,
          ),
          gpqa: this.scores.percent(evaluations.gpqa),
          musr: null,
          mmluPro: this.scores.percent(evaluations.mmlu_pro),
          hle: this.scores.percent(evaluations.hle),
          livecodebench: this.scores.percent(evaluations.livecodebench),
          scicode: this.scores.percent(evaluations.scicode),
          artificialAnalysisCoding: codingIndex,
          artificialAnalysisMath: mathIndex,
          outputTokensPerSecond: nAny(row.median_output_tokens_per_second),
          timeToFirstTokenSeconds: nAny(row.median_time_to_first_token_seconds),
          priceInput1M: nAny(row.pricing?.price_1m_input_tokens),
          priceOutput1M: nAny(row.pricing?.price_1m_output_tokens),
        };

        return {
          id: this.scores.entryId('llm', fullname),
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
      this.logger.warn(
        `VLM dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`,
      );
    }

    entries = await this.popularity.addEvidence(
      'vlm',
      this.scores.withSourceScores(entries, 'OpenVLM Leaderboard'),
      'image-text-to-text',
      120,
    );

    await this.store.save(entries, 'vlm');
    this.logger.log(`Stored ${entries.length} VLM entries`);
  }

  private async fetchVlmFromDataset(): Promise<NormalizedEntry[]> {
    try {
      const entries = await this.fetchVlmFromOpenCompassJson();
      if (entries.length > 0) return entries;
    } catch (e) {
      this.logger.warn(
        `OpenVLM JSON fetch failed: ${e instanceof Error ? e.message : e}`,
      );
    }

    const splits = ['leaderboard', 'train', 'test'];
    for (const split of splits) {
      try {
        const rows = await this.source.fetchHuggingFaceDatasetRows(
          'opencompass/open_vlm_leaderboard',
          'default',
          split,
          0,
          500,
        );
        if (rows.length > 0) return this.parseVlmRows(rows);
      } catch {
        /* try next */
      }
    }
    throw new Error('No data from any VLM dataset split');
  }

  private async fetchVlmFromOpenCompassJson(): Promise<NormalizedEntry[]> {
    const data = (await this.source.fetchHuggingFaceJson(
      OPEN_VLM_RESULTS_URL,
    )) as {
      results?: Record<string, Record<string, unknown>>;
    };
    const results = data?.results ?? {};

    return Object.entries(results)
      .map(([fallbackName, item]): NormalizedEntry | null => {
        const meta = (item.META ?? {}) as Record<string, unknown>;
        const method: unknown = Array.isArray(meta.Method)
          ? (meta.Method as unknown[])[0]
          : meta.Method;
        const fullname = text(method || fallbackName).trim();
        if (!fullname) return null;
        const org = text(meta.Org).trim();
        const parsed = parseId(fullname);
        const benchmarks = {
          mmbench:
            this.openVlmOverall(item, 'MMBench_TEST_EN_V11') ??
            this.openVlmOverall(item, 'MMBench_TEST_EN'),
          mmstar: this.openVlmOverall(item, 'MMStar'),
          mmmu: this.openVlmOverall(item, 'MMMU_VAL'),
          mathvista: this.openVlmOverall(item, 'MathVista'),
          ai2d: this.openVlmOverall(item, 'AI2D'),
          hallusionbench: this.openVlmOverall(item, 'HallusionBench'),
          ocrbench: this.openVlmOcrScore(item),
        };
        const average = this.scores.average(Object.values(benchmarks));

        return {
          id: this.scores.entryId('vlm', fullname),
          fullname,
          org: org || parsed.org,
          modelName: parsed.modelName || fullname,
          average,
          params: this.parseParamB(meta.Parameters),
          modelType:
            meta.OpenSource === 'Yes'
              ? 'open-source'
              : meta.OpenSource === 'No'
                ? 'api'
                : null,
          license: null,
          architecture:
            text(meta['Language Model'] ?? meta['Vision Model']).trim() || null,
          likes: null,
          benchmarks,
        };
      })
      .filter(Boolean) as NormalizedEntry[];
  }

  private parseVlmRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[])
      .map((r): NormalizedEntry | null => {
        const fullname = text(
          r['Method'] ?? r['Model'] ?? r['model'] ?? r['model_name'] ?? '',
        ).trim();
        if (!fullname) return null;
        const { org, modelName } = parseId(fullname);
        const avg = nAny(
          r['Average'] ?? r['Overall'] ?? r['average'] ?? r['score'],
        );
        const benchmarks = {
          mmbench: nAny(
            r['MMBench-v1.1-en'] ??
              r['MMBench_V11'] ??
              r['MMBench'] ??
              r['mmbench'],
          ),
          mmstar: nAny(r['MMStar'] ?? r['mmstar']),
          mmmu: nAny(r['MMMU_Val'] ?? r['MMMU_VAL'] ?? r['MMMU'] ?? r['mmmu']),
          mathvista: nAny(
            r['MathVista_MINI'] ?? r['MathVista'] ?? r['mathvista'],
          ),
          ai2d: nAny(r['AI2D_TEST'] ?? r['AI2D'] ?? r['ai2d']),
          hallusionbench: nAny(r['HallusionBench'] ?? r['hallusionbench']),
          ocrbench: nAny(r['OCRBench'] ?? r['ocrbench']),
        };
        return {
          id: `vlm:${fullname}`,
          fullname,
          org,
          modelName,
          average: avg ?? this.scores.average(Object.values(benchmarks)),
          params: n(r['Params (B)'] ?? r['#Params (B)'] ?? r['params']),
          modelType: null,
          license: null,
          architecture: null,
          likes: n(r['Hub ❤️'] ?? r['likes']),
          benchmarks,
        };
      })
      .filter(Boolean) as NormalizedEntry[];
  }

  // ─── ASR ─────────────────────────────────────────────────────────────────────

  private async fetchAndStoreAsr(): Promise<void> {
    this.logger.log('Fetching ASR leaderboard...');
    let entries: NormalizedEntry[] = [];

    try {
      entries = await this.fetchAsrFromDataset();
    } catch (e) {
      this.logger.warn(
        `ASR dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`,
      );
    }

    entries = await this.popularity.addEvidence(
      'asr',
      this.scores.withSourceScores(entries, 'Open ASR Leaderboard'),
      'automatic-speech-recognition',
      120,
    );

    await this.store.save(entries, 'asr');
    this.logger.log(`Stored ${entries.length} ASR entries`);
  }

  private async fetchAsrFromDataset(): Promise<NormalizedEntry[]> {
    const splits = ['train', 'test', 'results'];
    for (const split of splits) {
      try {
        const rows = await this.source.fetchHuggingFaceDatasetRows(
          'hf-audio/open_asr_leaderboard',
          'default',
          split,
          0,
          300,
        );
        if (rows.length > 0) return this.parseAsrRows(rows);
      } catch {
        /* try next */
      }
    }
    throw new Error('No ASR data found');
  }

  private parseAsrRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[])
      .map((r): NormalizedEntry | null => {
        const fullname = text(
          r['model'] ?? r['model_id'] ?? r['Model'] ?? '',
        ).trim();
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
          fullname,
          org,
          modelName,
          average,
          params: n(r['params'] ?? r['Params'] ?? r['#Params (B)']),
          modelType:
            (r['type'] ?? (r['Type'] as string | undefined))
              ? String(r['type'] ?? r['Type'])
              : null,
          license: null,
          architecture: null,
          likes: null,
          benchmarks: {
            libriSpeechClean:
              wer('librispeech.clean') ??
              wer('librispeech_clean') ??
              wer('LibriSpeech clean') ??
              wer('AMI'),
            libriSpeechOther:
              wer('librispeech.other') ??
              wer('librispeech_other') ??
              wer('LibriSpeech other'),
            commonVoice:
              wer('common_voice') ?? wer('Common Voice') ?? wer('cv'),
            voxpopuli: wer('voxpopuli') ?? wer('VoxPopuli'),
            earnings22: wer('earnings22') ?? wer('Earnings22'),
          },
        };
      })
      .filter(Boolean) as NormalizedEntry[];
  }

  // ─── Code ────────────────────────────────────────────────────────────────────

  private async fetchAndStoreCode(): Promise<void> {
    this.logger.log('Fetching Code leaderboard...');
    let entries: NormalizedEntry[] = [];

    try {
      entries = await this.fetchCodeFromDataset();
    } catch (e) {
      this.logger.warn(
        `Code dataset fetch failed, using HF models API: ${e instanceof Error ? e.message : e}`,
      );
    }

    if (entries.length === 0) {
      const raw = await this.popularity.fetchEntries(
        'text-generation',
        'code',
        150,
        'code',
      );
      // Filter: keep models whose name contains coding keywords
      const CODE_KEYWORDS = [
        'code',
        'coder',
        'coding',
        'starcoder',
        'deepseek-coder',
        'codellama',
        'codegen',
        'wizard-coder',
        'phind',
        'replit',
      ];
      entries = raw.filter((e) =>
        CODE_KEYWORDS.some((k) => e.fullname.toLowerCase().includes(k)),
      );
    }

    entries = await this.popularity.addEvidence(
      'code',
      this.scores.withSourceScores(entries, 'Code Benchmark Leaderboards'),
      'text-generation',
      180,
      'code',
    );
    await this.store.save(entries, 'code');
    this.logger.log(`Stored ${entries.length} Code entries`);
  }

  private async fetchCodeFromDataset(): Promise<NormalizedEntry[]> {
    // Try BigCode leaderboard
    const datasets = [
      {
        dataset: 'bigcode/bigcode-models-leaderboard',
        config: 'default',
        split: 'train',
        source: 'BigCode Models Leaderboard',
      },
      {
        dataset: 'EvalPlus-Org/evalplus-leaderboard',
        config: 'default',
        split: 'train',
        source: 'EvalPlus Leaderboard',
      },
    ];
    const sourceEntries: NormalizedEntry[][] = [];

    for (const { dataset, config, split, source } of datasets) {
      try {
        const rows = await this.source.fetchHuggingFaceDatasetRows(
          dataset,
          config,
          split,
          0,
          300,
        );
        const entries = this.scores.withSourceScores(
          this.parseCodeRows(rows),
          source,
        );
        if (entries.length > 0) sourceEntries.push(entries);
      } catch (e) {
        this.logger.warn(
          `Code source ${source} failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    if (sourceEntries.length > 0)
      return this.scores.mergeByModel('code', sourceEntries);
    throw new Error('No Code data found');
  }

  private parseCodeRows(rows: unknown[]): NormalizedEntry[] {
    type Row = Record<string, unknown>;
    return (rows as Row[])
      .map((r): NormalizedEntry | null => {
        const fullname = text(
          r['model_name'] ?? r['Model'] ?? r['model'] ?? '',
        ).trim();
        if (!fullname) return null;
        const { org, modelName } = parseId(fullname);
        const avg = nAny(
          r['average_pass@1'] ?? r['average'] ?? r['Average'] ?? r['pass@1'],
        );
        return {
          id: `code:${fullname}`,
          fullname,
          org,
          modelName,
          average: avg,
          params: n(r['params'] ?? r['#Params (B)'] ?? r['Params (B)']),
          modelType: null,
          license: null,
          architecture: null,
          likes: null,
          benchmarks: {
            humanEval: nAny(
              r['humaneval_pass@1'] ?? r['HumanEval'] ?? r['humaneval'],
            ),
            mbpp: nAny(r['mbpp_pass@1'] ?? r['MBPP'] ?? r['mbpp']),
            humanEvalPlus: nAny(
              r['humaneval+_pass@1'] ?? r['HumanEval+'] ?? r['humaneval_plus'],
            ),
            mbppPlus: nAny(r['mbpp+_pass@1'] ?? r['MBPP+'] ?? r['mbpp_plus']),
            ds1000: nAny(r['ds1000'] ?? r['DS-1000']),
          },
        };
      })
      .filter(Boolean) as NormalizedEntry[];
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────────

  private openVlmOverall(
    item: Record<string, unknown>,
    benchmark: string,
  ): number | null {
    const value = item[benchmark];
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    return nAny(
      row.Overall ??
        row.overall ??
        row.Score ??
        row.score ??
        row.Acc ??
        row.acc,
    );
  }

  private openVlmOcrScore(item: Record<string, unknown>): number | null {
    const value = item.OCRBench;
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const finalScore = nAny(row['Final Score'] ?? row.Overall ?? row.overall);
    if (finalScore == null) return null;
    // OpenVLM OCRBench is a 0-1000 style score. Normalize for table/radar consistency.
    return finalScore > 100
      ? Math.round((finalScore / 10) * 10) / 10
      : finalScore;
  }

  private parseParamB(value: unknown): number | null {
    if (value == null) return null;
    const raw = text(value).trim();
    if (!raw) return null;
    const numeric = Number(raw.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (/m\b/i.test(raw) && !/b\b/i.test(raw))
      return Math.round((numeric / 1000) * 1000) / 1000;
    return numeric;
  }
}
