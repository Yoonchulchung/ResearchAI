import { Injectable } from '@nestjs/common';

export interface SOQuestion {
  question_id: number;
  title: string;
  link: string;
  score: number;
  answer_count: number;
  tags: string[];
  creation_date: number;
  owner: { display_name?: string };
}

@Injectable()
export class StackOverflowApi {
  async fetchHotQuestions(site = 'stackoverflow', limit = 20): Promise<SOQuestion[]> {
    const params = new URLSearchParams({
      order: 'desc',
      sort: 'hot',
      site,
      filter: 'default',
      pagesize: String(Math.min(limit, 50)),
    });
    const res = await fetch(`https://api.stackexchange.com/2.3/questions?${params}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json() as { items?: SOQuestion[] };
    return data.items ?? [];
  }
}
