import { Injectable, Logger } from '@nestjs/common';
import { BrowserService } from 'src/browse/application/browser.service';
import { NewsCacheService } from 'src/news/application/internal/news-cache.service';
import {
  LIVE_CHANNELS,
  YoutubeApi,
  YoutubeNewsItem,
} from 'src/news/infrastructure/provider/youtube.api';

@Injectable()
export class NewsYoutubeService {
  private readonly logger = new Logger(NewsYoutubeService.name);

  constructor(
    private readonly youtubeApi: YoutubeApi,
    private readonly browser: BrowserService,
    private readonly cache: NewsCacheService,
  ) {}

  async getNews(limit = 30): Promise<YoutubeNewsItem[]> {
    const cacheKey = `raw-youtube-${this.cache.todayKey()}`;
    const cached = await this.cache.get<YoutubeNewsItem[]>(cacheKey);
    if (cached) return cached.slice(0, limit);

    const items = await this.youtubeApi.fetchNewsVideos(limit);
    await this.cache.set(cacheKey, items);
    return items;
  }

  async getLive(): Promise<YoutubeNewsItem[]> {
    const cacheKey = `raw-youtube-live-${Math.floor(Date.now() / 300_000)}`;
    const cached = await this.cache.get<YoutubeNewsItem[]>(cacheKey);
    if (cached?.length) return cached;

    const results = await Promise.allSettled(
      LIVE_CHANNELS.map((channel) =>
        this.fetchChannelLive(channel.baseUrl, channel.name),
      ),
    );
    const items = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
    if (items.length) await this.cache.set(cacheKey, items);
    return items;
  }

  private async fetchChannelLive(
    baseUrl: string,
    channelName: string,
  ): Promise<YoutubeNewsItem | null> {
    try {
      const live = await this.browser.findLiveVideo(baseUrl, channelName);
      if (!live) return null;
      return {
        videoId: live.videoId,
        title: live.title,
        link: live.url,
        source: channelName,
        channelId: '',
        pubDate: new Date().toISOString(),
        thumbnailUrl: live.thumbnailUrl,
        description: '',
        isLive: true,
      };
    } catch (error) {
      this.logger.debug(
        `${channelName} live lookup failed: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
