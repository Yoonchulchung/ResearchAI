import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { CoverLetter, ScrapeOptions, ScrapeStatus } from '../domain/cover-letter.model';
import { LinkareerCrawler } from '../infrastructure/linkareer.crawler';

const DATA_DIR = path.resolve(__dirname, '../../../data/cover-letters');
const JSONL_FILE = path.join(DATA_DIR, 'cover-letters.jsonl');
const IDS_FILE = path.join(DATA_DIR, 'collected-ids.json');

@Injectable()
export class CoverLetterScraperService implements OnModuleInit {
  private readonly logger = new Logger(CoverLetterScraperService.name);
  private readonly crawler = new LinkareerCrawler();

  private collectedIds = new Set<string>();
  private status: ScrapeStatus = {
    running: false,
    currentPage: 0,
    totalCollected: 0,
    totalSkipped: 0,
    errors: 0,
    startedAt: null,
    lastActivity: null,
  };

  async onModuleInit() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    await this.loadCollectedIds();
    this.status.totalCollected = this.collectedIds.size;
  }

  getStatus(): ScrapeStatus {
    return { ...this.status };
  }

  async startScraping(opts: ScrapeOptions = {}): Promise<{ message: string }> {
    if (this.status.running) {
      return { message: '이미 수집 중입니다.' };
    }
    this.status = {
      running: true,
      currentPage: opts.startPage ?? 1,
      totalCollected: this.collectedIds.size,
      totalSkipped: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };

    // 비동기로 실행 — 응답은 즉시 반환
    this.runScraping(opts).catch((err) => {
      this.logger.error('스크래핑 중 오류', err);
      this.status.running = false;
    });

    return { message: '수집을 시작했습니다.' };
  }

  stopScraping(): { message: string } {
    if (!this.status.running) return { message: '실행 중인 수집 작업이 없습니다.' };
    this.status.running = false;
    return { message: '수집 중단 요청됨.' };
  }

  /** 수집된 자소서 목록 (페이지네이션) */
  async getData(page: number, limit: number): Promise<{ items: CoverLetter[]; total: number }> {
    const all = await this.readAllFromJsonl();
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);
    return { items, total };
  }

  // ────────────────────────────────────────────────────────
  // private
  // ────────────────────────────────────────────────────────

  private async runScraping(opts: ScrapeOptions) {
    const delayMs = opts.delayMs ?? 1500;
    const maxPages = opts.maxPages ?? Infinity;
    let page = opts.startPage ?? 1;
    let emptyPageCount = 0;

    while (this.status.running) {
      if (page - (opts.startPage ?? 1) >= maxPages) break;

      this.status.currentPage = page;
      this.status.lastActivity = new Date().toISOString();

      let ids: string[];
      try {
        ids = await this.crawler.getIdsFromPage(page, {
          company: opts.company,
          role: opts.role,
          keyword: opts.keyword,
        });
      } catch (err) {
        this.logger.warn(`페이지 ${page} 목록 오류: ${err}`);
        this.status.errors++;
        break;
      }

      const newIds = ids.filter((id) => !this.collectedIds.has(id));
      this.logger.log(`페이지 ${page}: 총 ${ids.length}개, 신규 ${newIds.length}개`);

      if (ids.length === 0) {
        emptyPageCount++;
        if (emptyPageCount >= 3) {
          this.logger.log('빈 페이지 3회 연속 — 수집 완료');
          break;
        }
      } else {
        emptyPageCount = 0;
      }

      for (const id of newIds) {
        if (!this.status.running) break;

        try {
          const detail = await this.crawler.getDetail(id);
          if (detail) {
            await this.saveCoverLetter(detail);
            this.status.totalCollected++;
            this.logger.log(`수집 완료 [${id}] ${detail.company} / ${detail.position}`);
          } else {
            this.status.errors++;
          }
        } catch (err) {
          this.logger.warn(`자소서 [${id}] 오류: ${err}`);
          this.status.errors++;
        }

        this.status.lastActivity = new Date().toISOString();
        await this.delay(delayMs);
      }

      this.status.totalSkipped += ids.length - newIds.length;
      page++;
      await this.delay(delayMs);
    }

    this.status.running = false;
    this.logger.log(
      `수집 종료 — 총 ${this.status.totalCollected}개 (에러 ${this.status.errors}개)`,
    );
  }

  private async saveCoverLetter(cl: CoverLetter) {
    const line = JSON.stringify(cl) + '\n';
    fs.appendFileSync(JSONL_FILE, line, 'utf-8');
    this.collectedIds.add(cl.id);
    fs.writeFileSync(IDS_FILE, JSON.stringify([...this.collectedIds]), 'utf-8');
  }

  private async loadCollectedIds() {
    if (!fs.existsSync(IDS_FILE)) return;
    try {
      const raw = fs.readFileSync(IDS_FILE, 'utf-8');
      const arr: string[] = JSON.parse(raw);
      this.collectedIds = new Set(arr);
      this.logger.log(`기존 수집 ID ${this.collectedIds.size}개 로드`);
    } catch {
      this.logger.warn('collected-ids.json 로드 실패 — 초기화');
    }
  }

  private async readAllFromJsonl(): Promise<CoverLetter[]> {
    if (!fs.existsSync(JSONL_FILE)) return [];
    const results: CoverLetter[] = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(JSONL_FILE, 'utf-8'),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        results.push(JSON.parse(line));
      } catch {
        // 손상된 라인 무시
      }
    }
    return results;
  }

  private delay(ms: number) {
    const jitter = ms * 0.4;
    const actual = ms - jitter + Math.random() * jitter * 2;
    return new Promise((r) => setTimeout(r, actual));
  }
}
