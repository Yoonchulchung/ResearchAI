import { Injectable } from '@nestjs/common';

export interface GHRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  forks_count: number;
}

@Injectable()
export class GithubApi {
  async fetchTrendingRepos(
    since: 'daily' | 'weekly' | 'monthly',
  ): Promise<GHRepo[]> {
    const days = since === 'monthly' ? 30 : since === 'weekly' ? 7 : 1;
    const from = new Date(Date.now() - days * 86400_000)
      .toISOString()
      .split('T')[0];

    const res = await fetch(
      `https://api.github.com/search/repositories?q=pushed:>${from}&sort=stars&order=desc&per_page=10`,
      { headers: { Accept: 'application/vnd.github+json' } },
    );
    const data = (await res.json()) as { items?: GHRepo[] };
    return data.items ?? [];
  }
}
