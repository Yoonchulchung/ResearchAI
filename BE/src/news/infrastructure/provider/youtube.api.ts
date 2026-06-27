import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface YoutubeNewsItem {
  videoId: string;
  title: string;
  link: string;
  source: string;
  channelId: string;
  pubDate: string;
  thumbnailUrl: string;
  description: string;
  isLive?: boolean;
  viewCount?: number;
}

const CHANNELS: { id: string; name: string }[] = [
  { id: 'UChlgI3UHCOnwUGzWzbJ3H5w', name: 'YTN' },
  { id: 'UCuOyDYGEqoV3P9duJ65LB7w', name: '연합뉴스TV' },
  { id: 'UCF4Wxdo3inmxP-Y59wXDsDg', name: 'MBC 뉴스' },
  { id: 'UCkinYTS9IHqOEwiXgfTV1Dg', name: 'SBS 뉴스' },
  { id: 'UCH0el1KPGIXD1kCVEBzIRDA', name: 'JTBC 뉴스' },
  { id: 'UCcQTRi69dsVYHN3exePtZ1A', name: 'KBS 뉴스' },
];

export const LIVE_CHANNELS: { baseUrl: string; name: string }[] = [
  {
    baseUrl: 'https://www.youtube.com/channel/UChlgI3UHCOnwUGzWzbJ3H5w',
    name: 'YTN',
  },
  { baseUrl: 'https://www.youtube.com/@newskbs', name: 'KBS 뉴스' },
  { baseUrl: 'https://www.youtube.com/@MBCNEWS11', name: 'MBC 뉴스' },
  { baseUrl: 'https://www.youtube.com/sbs8news', name: 'SBS 뉴스' },
];

@Injectable()
export class YoutubeApi {
  private readonly logger = new Logger(YoutubeApi.name);

  async fetchNewsVideos(limit = 30): Promise<YoutubeNewsItem[]> {
    const results = await Promise.allSettled(
      CHANNELS.map((ch) => this.fetchChannel(ch.id, ch.name)),
    );

    const all: YoutubeNewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }

    all.sort(
      (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
    );
    return all.slice(0, limit);
  }

  private async fetchChannel(
    channelId: string,
    channelName: string,
  ): Promise<YoutubeNewsItem[]> {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchAI/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(`YouTube RSS ${channelName} HTTP ${res.status}`);
        return [];
      }
      const xml = await res.text();
      return this.parseRss(xml, channelName, channelId);
    } catch (e) {
      this.logger.warn(
        `YouTube RSS ${channelName} failed: ${(e as Error).message}`,
      );
      return [];
    }
  }

  private parseRss(
    xml: string,
    channelName: string,
    channelId: string,
  ): YoutubeNewsItem[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: YoutubeNewsItem[] = [];

    $('entry').each((_, el) => {
      const videoId = $('yt\\:videoId', el).text().trim();
      const title = $('title', el).first().text().trim();
      const link =
        $('link[rel="alternate"]', el).attr('href') ??
        `https://www.youtube.com/watch?v=${videoId}`;
      const pubDate =
        $('published', el).text().trim() || $('updated', el).text().trim();
      const description = $('media\\:description', el).text().trim();
      const thumbnail =
        $('media\\:thumbnail', el).attr('url') ??
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

      if (videoId && title) {
        items.push({
          videoId,
          title,
          link,
          source: channelName,
          channelId,
          pubDate,
          thumbnailUrl: thumbnail,
          description,
        });
      }
    });

    return items;
  }
}
