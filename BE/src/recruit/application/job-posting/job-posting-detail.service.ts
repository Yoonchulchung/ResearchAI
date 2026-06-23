import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { JobPosting } from 'src/recruit/domain/job-posting.model';
import { JobPostingCrawlerRegistryPort } from 'src/recruit/application/job-posting/ports/job-posting-crawler.port';
import { RecruitDb } from 'src/recruit/infrastructure/database/recruit-db';
import { JobPostingImageService } from './job-posting-image.service';
import { findHtmlContent } from './job-posting.utils';

@Injectable()
export class JobPostingDetailService {
  private readonly logger = new Logger(JobPostingDetailService.name);

  constructor(
    private readonly recruitDb: RecruitDb,
    private readonly imageService: JobPostingImageService,
    private readonly crawlerRegistry: JobPostingCrawlerRegistryPort,
  ) {}

  getAiAnalysis(
    id: string,
    mode: 'analysis' | 'interview',
  ): { text: string; docId: string | null } | null {
    return this.recruitDb.getAiAnalysisCache(id, mode);
  }

  setAiAnalysis(
    id: string,
    mode: 'analysis' | 'interview',
    text: string,
    docId?: string | null,
  ): void {
    this.recruitDb.setAiAnalysisCache(id, mode, text, docId);
  }

  async fetchDetailContent(
    id: string,
    url: string,
    source: string,
  ): Promise<
    Pick<JobPosting, 'companyType' | 'jobs' | 'detailContent' | 'detailHtml'>
  > {
    const cached = this.recruitDb.getDetailCache(id);
    if (cached) {
      if (
        cached.detailHtml &&
        /<img\b[^>]*\bsrc=["'](https?:|\/\/)/i.test(cached.detailHtml)
      ) {
        const processed = await this.imageService.downloadAndCacheImages(
          cached.detailHtml,
          url,
        );
        if (processed !== cached.detailHtml) {
          const updated = { ...cached, detailHtml: processed };
          this.recruitDb.setDetailCache(id, updated);
          return updated;
        }
      }
      return cached;
    }

    try {
      let result: Pick<
        JobPosting,
        'companyType' | 'jobs' | 'detailContent' | 'detailHtml'
      >;

      if (source === 'linkareer') {
        const detail = await this.crawlerRegistry
          .get('linkareer')
          .getDetail({ id, url });
        result = {
          companyType: detail.companyType,
          jobs: detail.jobs,
          detailHtml: detail.detailHtml,
        };
      } else if (source === 'jobkorea') {
        const gno = id.startsWith('jk-') ? id.slice('jk-'.length) : id;
        result = await this.parseJobkoreaDetail(gno);
      } else if (source === 'jobplanet') {
        result = await this.parseJobplanetDetail(url);
      } else if (source === 'jobda') {
        result = await this.parseJobdaDetail(url);
      } else {
        const html = await this.fetchHtml(url);
        if (!html) return {};
        const $ = load(html);
        if (source === 'catch') {
          const recruitId = id.startsWith('catch-')
            ? id.slice('catch-'.length)
            : id;
          result = await this.parseCatchDetail($, recruitId);
        } else {
          $('script, style, nav, header, footer').remove();
          let text = '';
          for (const sel of ['article', 'main', '#content', '.content']) {
            const el = $(sel).first();
            if (!el.length) continue;
            text = el.text().replace(/\s+/g, ' ').trim();
            if (text.length > 200) break;
          }
          result = { detailContent: text || undefined };
        }
      }

      const hasContent =
        result.detailHtml ||
        result.detailContent ||
        result.jobs ||
        result.companyType;
      if (hasContent) {
        if (result.detailHtml) {
          result = {
            ...result,
            detailHtml: await this.imageService.downloadAndCacheImages(
              result.detailHtml,
              url,
            ),
          };
        }
        this.recruitDb.setDetailCache(id, result);
      }
      return result;
    } catch (err) {
      this.logger.warn(`fetchDetailContent 오류: ${err}`);
      return {};
    }
  }

  private async parseJobkoreaDetail(
    gno: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const iframeUrl = `https://www.jobkorea.co.kr/Recruit/GI_Read_Comt_Ifrm?Gno=${gno}&isHiringCenter=false&hideMapView=false`;
    const html = await this.fetchHtml(iframeUrl);
    if (!html) return {};
    const $ = load(html);
    $('script, style').remove();
    $('img').each((_, img) => {
      const $img = $(img);
      const dataSrc = $img.attr('data-src');
      if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
    });
    const contentEl = $(
      'article.view-content, div#container, div#secDetailRead',
    ).first();
    const detailHtml = contentEl.length
      ? contentEl.html()?.trim()
      : $('body').html()?.trim();
    return { detailHtml: detailHtml || undefined };
  }

  private async parseJobdaDetail(
    url: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const html = await this.fetchHtml(url, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.jobda.im/',
    });
    if (!html) return {};
    const $ = load(html);

    const nextDataRaw = $('script#__NEXT_DATA__').html();
    if (nextDataRaw) {
      try {
        const nextData = JSON.parse(nextDataRaw);
        const content = findHtmlContent(nextData?.props?.pageProps);
        if (content) return { detailHtml: content };
      } catch {}
    }

    $('script, style, nav, header, footer').remove();
    const contentEl = $('[class*="contents_infoArea"]').first();
    if (contentEl.length) {
      contentEl.find('script, style').remove();
      contentEl.find('img').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
      });
      const content = contentEl.html()?.trim();
      if (content && content.length > 50) return { detailHtml: content };
    }

    const mainEl = $('main').first();
    mainEl.find('script, style').remove();
    return { detailHtml: mainEl.html()?.trim() || undefined };
  }

  private async parseJobplanetDetail(
    url: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const encodedUrl = url.replace(/\[]/g, '%5B%5D');
    const html = await this.fetchHtml(encodedUrl, {
      'jp-ssr-auth': 'jobplanet_desktop_ssr_1d6f8a5f219176accbb8fe051729fc6a',
      'jp-os-type': 'web',
      Referer: 'https://www.jobplanet.co.kr/job',
    });
    if (!html) return {};
    const $ = load(html);

    const mainContent = $('div[class*="min-w-0"][class*="flex-1"]').first();
    if (!mainContent.length) return {};

    const iframeSrc = mainContent.find('iframe').first().attr('src');
    if (iframeSrc) {
      const iframeUrl = iframeSrc.startsWith('http')
        ? iframeSrc
        : `https://www.jobplanet.co.kr${iframeSrc}`;
      const iframeHtml = await this.fetchHtml(iframeUrl);
      if (iframeHtml) {
        const $i = load(iframeHtml);
        $i('script, style, noscript').remove();
        const content = $i('body').html()?.trim();
        if (content) return { detailHtml: content };
      }
    }

    const htmlParts: string[] = [];
    mainContent.find('section').each((_, section) => {
      const $s = $(section);
      if (!$s.find('[class*="new-h2"]').length) return;
      $s.find('script, style').remove();
      $s.find('img').each((_, img) => {
        const $img = $(img);
        const dataSrc = $img.attr('data-src');
        if (dataSrc && !$img.attr('src')) $img.attr('src', dataSrc);
      });
      const content = $s.html()?.trim();
      if (content && content.length > 30) htmlParts.push(content);
    });
    return { detailHtml: htmlParts.join('\n\n') || undefined };
  }

  private async parseCatchDetail(
    $: CheerioAPI,
    recruitId: string,
  ): Promise<Pick<JobPosting, 'detailHtml'>> {
    const htmlParts: string[] = [];
    const summaryEl = $('.recr_pop_summary').first();
    summaryEl.find('script, style').remove();
    const summaryHtml = summaryEl.html()?.trim();
    if (summaryHtml) htmlParts.push(summaryHtml);

    const iframeUrl = `https://www.catch.co.kr/controls/recruitDetail/${recruitId}`;
    const iframeHtml = await this.fetchHtml(iframeUrl);
    if (iframeHtml) {
      const $i = load(iframeHtml);
      $i('script, style').remove();
      const contentEl = $i('#recr_type_img, #iframe_wrapper').first();
      if (contentEl.length) {
        const content = contentEl.html()?.trim();
        if (content) htmlParts.push(content);
      }
    }
    return { detailHtml: htmlParts.join('\n\n') || undefined };
  }

  private async fetchHtml(
    url: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          ...extraHeaders,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return res.text();
    } catch {
      return null;
    }
  }
}
