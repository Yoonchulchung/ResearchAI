import { Injectable } from '@nestjs/common';
import { GithubApi, GHRepo } from './provider/github.api';
import { HuggingfaceApi, HFItem } from './provider/huggingface.api';
import { GoogleNewsApi, GNewsItem } from './provider/google-news.api';
import { StackOverflowApi, SOQuestion } from './provider/stackoverflow.api';

export type { GHRepo, HFItem, GNewsItem, SOQuestion };

@Injectable()
export class NewsProviderService {
  constructor(
    private readonly githubApi: GithubApi,
    private readonly hfApi: HuggingfaceApi,
    private readonly googleNewsApi: GoogleNewsApi,
    private readonly stackOverflowApi: StackOverflowApi,
  ) {}

  fetchTrendingRepos(since: 'daily' | 'weekly' | 'monthly'): Promise<GHRepo[]> {
    return this.githubApi.fetchTrendingRepos(since);
  }

  fetchHfTrending(category: 'models' | 'datasets' | 'spaces', limit = 10): Promise<HFItem[]> {
    return this.hfApi.fetchTrending(category, limit);
  }

  fetchNewsByQuery(query: string, limit = 15): Promise<GNewsItem[]> {
    return this.googleNewsApi.fetchByQuery(query, limit);
  }

  fetchStackOverflowHot(site = 'stackoverflow', limit = 20): Promise<SOQuestion[]> {
    return this.stackOverflowApi.fetchHotQuestions(site, limit);
  }
}
