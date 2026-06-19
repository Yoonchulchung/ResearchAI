import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { NewsBriefingEntity } from 'src/news/domain/entity/news-briefing.entity';
import {
  NewsProviderService,
  GHRepo,
  HFItem,
  NaverNewsItem,
} from 'src/news/infrastructure/news-provider.service';
import {
  AppConfigService,
  CONFIG_KEYS,
} from 'src/config/application/app-config.service';

@Injectable()
export class NewsSummaryService {
  constructor(
    private readonly aiProvider: AiProviderService,
    @InjectRepository(NewsBriefingEntity)
    private readonly briefingRepo: Repository<NewsBriefingEntity>,
    private readonly newsProvider: NewsProviderService,
    private readonly appConfig: AppConfigService,
  ) {}

  private getTodayKey(): string {
    return new Date()
      .toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\. /g, '-')
      .replace('.', '');
  }

  private async getRawCache<T>(cacheKey: string): Promise<T | null> {
    const cached = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (cached?.rawData) return JSON.parse(cached.rawData) as T;
    return null;
  }

  private async setRawCache(cacheKey: string, data: unknown): Promise<void> {
    const existing = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (existing) {
      await this.briefingRepo.update(
        { date: cacheKey },
        { rawData: JSON.stringify(data) },
      );
    } else {
      await this.briefingRepo.save({
        date: cacheKey,
        titlesHash: '',
        summary: '',
        rawData: JSON.stringify(data),
      });
    }
  }

  private async getSummaryCache(cacheKey: string): Promise<{
    summary: string;
    generatedAt: string;
    aiModel: string | null;
  } | null> {
    const cached = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (cached?.summary)
      return {
        summary: cached.summary,
        generatedAt: cached.updatedAt.toISOString(),
        aiModel: cached.aiModel ?? null,
      };
    return null;
  }

  private async setSummaryCache(
    cacheKey: string,
    summary: string,
    model: string,
  ): Promise<void> {
    const existing = await this.briefingRepo.findOneBy({ date: cacheKey });
    if (existing) {
      await this.briefingRepo.update(
        { date: cacheKey },
        { summary, aiModel: model },
      );
    } else {
      await this.briefingRepo.save({
        date: cacheKey,
        titlesHash: '',
        summary,
        rawData: null,
        aiModel: model,
      });
    }
  }

  async getGithubSummary(since: string): Promise<{
    summary: string;
    generatedAt: string;
    cached: boolean;
    aiModel: string | null;
  }> {
    const validSince = ['daily', 'weekly', 'monthly'].includes(since)
      ? since
      : 'daily';
    const today = this.getTodayKey();
    const summaryCacheKey = `github-${validSince}-${today}`;
    const rawCacheKey = `raw-github-${validSince}-${today}`;

    const summaryCache = await this.getSummaryCache(summaryCacheKey);
    if (summaryCache) return { ...summaryCache, cached: true };

    let repos = await this.getRawCache<GHRepo[]>(rawCacheKey);
    if (!repos) {
      repos = await this.newsProvider.fetchTrendingRepos(
        validSince as 'daily' | 'weekly' | 'monthly',
      );
      await this.setRawCache(rawCacheKey, repos);
    }

    const model = await this.appConfig.get(
      CONFIG_KEYS.DEFAULT_CLOUD_MODEL,
      'claude-haiku-4-5-20251001',
    );
    const periodLabel =
      validSince === 'daily'
        ? '오늘'
        : validSince === 'weekly'
          ? '이번 주'
          : '이번 달';
    const repoList = repos
      .map(
        (r, i) =>
          `${i + 1}. ${r.full_name} (⭐${r.stargazers_count}${r.language ? ', ' + r.language : ''})${r.description ? ': ' + r.description : ''}`,
      )
      .join('\n');

    const { text: summary } = await this.aiProvider.call(
      model,
      '',
      `다음은 GitHub에서 ${periodLabel} 가장 핫한 저장소 목록이야.\n\n${repoList}\n\n위 저장소들을 분석해서 현재 개발자 커뮤니티에서 주목받는 트렌드 3~5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [트렌드]: 실제 저장소명을 포함해 한 문장으로 설명해줘.\n\n어떤 기능이 주요 관심사인지 알려줘.`,
    );
    await this.setSummaryCache(summaryCacheKey, summary, model);
    return {
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
      aiModel: model,
    };
  }

  async getHfSummary(category: string): Promise<{
    summary: string;
    generatedAt: string;
    cached: boolean;
    aiModel: string | null;
  }> {
    const validCategory = ['models', 'datasets', 'spaces'].includes(category)
      ? category
      : 'models';
    const today = this.getTodayKey();
    const summaryCacheKey = `hf-${validCategory}-${today}`;
    const rawCacheKey = `raw-hf-${validCategory}-${today}`;

    const summaryCache = await this.getSummaryCache(summaryCacheKey);
    if (summaryCache) return { ...summaryCache, cached: true };

    let items = await this.getRawCache<HFItem[]>(rawCacheKey);
    if (!items) {
      items = await this.newsProvider.fetchHfTrending(
        validCategory as 'models' | 'datasets' | 'spaces',
      );
      await this.setRawCache(rawCacheKey, items);
    }

    const model = await this.appConfig.get(
      CONFIG_KEYS.DEFAULT_CLOUD_MODEL,
      'claude-haiku-4-5-20251001',
    );
    const categoryLabel =
      validCategory === 'models'
        ? '모델'
        : validCategory === 'datasets'
          ? '데이터셋'
          : '스페이스';
    const itemList = items
      .slice(0, 10)
      .map(
        (item, i) =>
          `${i + 1}. ${item.id}${item.pipeline_tag ? ` (${item.pipeline_tag})` : ''}${item.trendingScore != null ? ` - 트렌딩 ${item.trendingScore.toFixed(1)}` : ''}${item.likes ? ` ❤️${item.likes}` : ''}`,
      )
      .join('\n');

    const { text: summary } = await this.aiProvider.call(
      model,
      '',
      `다음은 Hugging Face에서 현재 가장 트렌딩인 ${categoryLabel} 목록이야.\n\n${itemList}\n\n위 항목들을 분석해서 현재 AI/ML 커뮤니티에서 주목받는 트렌드 3~5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [트렌드]: 실제 ${categoryLabel}명을 포함해 한 문장으로 설명해줘.\n\n어떤 기능이 주요 관심사인지 알려줘.`,
    );
    await this.setSummaryCache(summaryCacheKey, summary, model);
    return {
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
      aiModel: model,
    };
  }

  async getNewsSummary(): Promise<{
    summary: string;
    generatedAt: string;
    cached: boolean;
    aiModel: string | null;
  }> {
    const today = this.getTodayKey();
    const summaryCacheKey = `news-${today}`;
    const rawCacheKey = `raw-news-titles-${today}`;

    const summaryCache = await this.getSummaryCache(summaryCacheKey);
    if (summaryCache) return { ...summaryCache, cached: true };

    let titleSample = await this.getRawCache<string[]>(rawCacheKey);
    if (!titleSample) {
      const queries = [
        'IT AI 기술',
        '경제 금융 증시',
        '사회 정치',
        '국제 세계',
        '과학 환경',
      ];
      const results = await Promise.allSettled(
        queries.map((q) => this.newsProvider.fetchNewsByQuery(q)),
      );
      const allTitles: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          allTitles.push(...r.value.map((item: NaverNewsItem) => item.title));
        }
      }
      titleSample = allTitles.slice(0, 30);
      await this.setRawCache(rawCacheKey, titleSample);
    }

    const model = await this.appConfig.get(
      CONFIG_KEYS.DEFAULT_CLOUD_MODEL,
      'claude-haiku-4-5-20251001',
    );
    const { text: summary } = await this.aiProvider.call(
      model,
      '',
      `다음은 오늘의 실시간 뉴스 헤드라인 목록이야.\n\n[헤드라인]\n${titleSample.join('\n')}\n\n위 헤드라인을 분석해서 오늘의 주요 뉴스 5개를 뽑아줘.\n각 항목은 아래 형식으로 작성해:\n\n• [구체적 사실]: 실제 기사에 등장한 기업명·인물명·수치·지명 등을 반드시 포함해서 한 문장으로 설명해줘. 검색하면 바로 찾을 수 있을 만큼 구체적으로 써줘.\n\n추상적인 표현("기술 발전", "경제 위기" 등) 없이, 헤드라인에 있는 고유명사와 구체적 내용만 사용해.`,
    );
    await this.setSummaryCache(summaryCacheKey, summary, model);
    return {
      summary,
      generatedAt: new Date().toISOString(),
      cached: false,
      aiModel: model,
    };
  }
}
