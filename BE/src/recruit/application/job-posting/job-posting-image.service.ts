import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getImageExt } from './job-posting.utils';

const IMAGE_CACHE_DIR = path.join(process.cwd(), 'data/recruit/image-cache');

@Injectable()
export class JobPostingImageService {
  private readonly logger = new Logger(JobPostingImageService.name);

  pruneImageCache(): void {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) return;
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(IMAGE_CACHE_DIR)) {
      const filePath = path.join(IMAGE_CACHE_DIR, file);
      try {
        if (fs.statSync(filePath).mtimeMs < twoDaysAgo) fs.unlinkSync(filePath);
      } catch {}
    }
  }

  serveImage(filename: string): { buffer: Buffer; contentType: string } | null {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) return null;
    const safe = path.basename(filename);
    if (!/^[a-f0-9]{32}\.(jpg|png|gif|webp|svg)$/.test(safe)) return null;
    const filePath = path.join(IMAGE_CACHE_DIR, safe);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(safe).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    };
    return { buffer, contentType: contentTypes[ext] ?? 'image/jpeg' };
  }

  getPostingImageFiles(html: string): string[] {
    return [
      ...html.matchAll(/src=["']\/api\/recruit\/job-postings\/image\/([^"']+)["']/g),
    ]
      .map((m) => m[1])
      .slice(0, 5)
      .filter((f) => fs.existsSync(path.join(IMAGE_CACHE_DIR, f)));
  }

  getImageCacheStats() {
    if (!fs.existsSync(IMAGE_CACHE_DIR)) {
      return { dir: IMAGE_CACHE_DIR, count: 0, totalKb: 0, files: [] };
    }
    const now = Date.now();
    const files = fs.readdirSync(IMAGE_CACHE_DIR).map((name) => {
      try {
        const stat = fs.statSync(path.join(IMAGE_CACHE_DIR, name));
        return { name, sizeKb: Math.round(stat.size / 1024), ageMin: Math.round((now - stat.mtimeMs) / 60_000) };
      } catch {
        return { name, sizeKb: 0, ageMin: 0 };
      }
    });
    return { dir: IMAGE_CACHE_DIR, count: files.length, totalKb: files.reduce((s, f) => s + f.sizeKb, 0), files };
  }

  async downloadAndCacheImages(html: string, referer: string): Promise<string> {
    fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });

    const srcToFetchUrl = new Map<string, string>();
    for (const m of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
      const src = m[1];
      if (src.startsWith('http')) srcToFetchUrl.set(src, src);
      else if (src.startsWith('//')) srcToFetchUrl.set(src, `https:${src}`);
    }
    if (srcToFetchUrl.size === 0) return html;

    const existingFiles = fs.readdirSync(IMAGE_CACHE_DIR);
    const srcToProxy = new Map<string, string>();

    await Promise.allSettled(
      [...srcToFetchUrl.entries()].map(async ([src, fetchUrl]) => {
        const hash = crypto.createHash('md5').update(fetchUrl).digest('hex');
        const existing = existingFiles.find((f) => f.startsWith(`${hash}.`));
        if (existing) {
          srcToProxy.set(src, `/api/recruit/job-postings/image/${existing}`);
          return;
        }
        const downloaded = await this.downloadImageFile(fetchUrl, referer);
        if (!downloaded) return;
        const filename = `${hash}${downloaded.ext}`;
        fs.writeFileSync(path.join(IMAGE_CACHE_DIR, filename), downloaded.buffer);
        srcToProxy.set(src, `/api/recruit/job-postings/image/${filename}`);
      }),
    );

    if (srcToProxy.size === 0) return html;
    let result = html;
    for (const [src, proxyUrl] of srcToProxy) result = result.split(src).join(proxyUrl);
    return result;
  }

  private async downloadImageFile(url: string, referer: string): Promise<{ buffer: Buffer; ext: string } | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
          Referer: referer,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return { buffer, ext: getImageExt(url, contentType) };
    } catch {
      return null;
    }
  }
}
