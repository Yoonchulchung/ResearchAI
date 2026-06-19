import { Injectable } from '@nestjs/common';
import { GithubApi, GHRepo } from 'src/news/infrastructure/provider/github.api';
import {
  HuggingfaceApi,
  HFItem,
} from 'src/news/infrastructure/provider/huggingface.api';
import {
  NaverNewsApi,
  NaverNewsItem,
} from 'src/news/infrastructure/provider/naver-news.api';
import {
  StackOverflowApi,
  SOQuestion,
} from 'src/news/infrastructure/provider/stackoverflow.api';

export type { GHRepo, HFItem, NaverNewsItem, SOQuestion };

@Injectable()
export class NewsProviderService {
  constructor(
    private readonly githubApi: GithubApi,
    private readonly hfApi: HuggingfaceApi,
    private readonly naverNewsApi: NaverNewsApi,
    private readonly stackOverflowApi: StackOverflowApi,
  ) {}

  fetchTrendingRepos(since: 'daily' | 'weekly' | 'monthly'): Promise<GHRepo[]> {
    return this.githubApi.fetchTrendingRepos(since);
  }

  fetchHfTrending(
    category: 'models' | 'datasets' | 'spaces',
    limit = 10,
  ): Promise<HFItem[]> {
    return this.hfApi.fetchTrending(category, limit);
  }

  fetchNewsByQuery(
    query: string,
    limit = 15,
    offset = 0,
  ): Promise<NaverNewsItem[]> {
    return this.naverNewsApi.fetchByQuery(query, limit, offset);
  }

  fetchStackOverflowHot(
    site = 'stackoverflow',
    limit = 20,
  ): Promise<SOQuestion[]> {
    return this.stackOverflowApi.fetchHotQuestions(site, limit);
  }
}
