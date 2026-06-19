import { Injectable } from '@nestjs/common';

export interface HFItem {
  id: string;
  likes: number;
  downloads?: number;
  trendingScore?: number;
  pipeline_tag?: string;
}

@Injectable()
export class HuggingfaceApi {
  async fetchTrending(
    category: 'models' | 'datasets' | 'spaces',
    limit = 10,
  ): Promise<HFItem[]> {
    const res = await fetch(
      `https://huggingface.co/api/${category}?sort=trendingScore&direction=-1&limit=${limit}`,
    );
    return res.json() as Promise<HFItem[]>;
  }
}
