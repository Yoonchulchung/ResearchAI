import { Injectable, Logger } from '@nestjs/common';
import { inflateRaw } from 'zlib';
import { promisify } from 'util';
import { DartApiQueueService } from 'src/company/infrastructure/dart-api-queue.service';

const inflateRawAsync = promisify(inflateRaw);

const OPEN_DART_BASE = 'https://opendart.fss.or.kr/api';
const CORP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DartCorpCodeService {
  private readonly logger = new Logger(DartCorpCodeService.name);
  private corpCodeCache: {
    map: Map<string, string>;
    fetchedAt: number;
  } | null = null;

  constructor(private readonly dartQueue: DartApiQueueService) {}

  async findCorpCode(
    companyName: string,
    apiKey: string,
  ): Promise<string | null> {
    const map = await this.getCorpCodeMap(apiKey);
    if (!map.size) return null;

    if (map.has(companyName)) return map.get(companyName)!;

    const norm = (s: string) =>
      s.replace(/[\s(주)㈜()（）]/g, '').toLowerCase();
    const target = norm(companyName);
    for (const [name, code] of map) {
      if (norm(name) === target) return code;
    }

    const prefixMatches: string[] = [];
    for (const [name, code] of map) {
      if (name.startsWith(companyName) || companyName.startsWith(name)) {
        prefixMatches.push(`"${name}"(${code})`);
        if (prefixMatches.length === 1) return code;
      }
    }

    this.logger.warn(
      `[DART] "${companyName}" 기업코드 미발견. 접두사 후보: ${prefixMatches.slice(0, 5).join(', ')}`,
    );
    return null;
  }

  private async getCorpCodeMap(apiKey: string): Promise<Map<string, string>> {
    const now = Date.now();
    if (
      this.corpCodeCache &&
      now - this.corpCodeCache.fetchedAt < CORP_CACHE_TTL_MS
    ) {
      return this.corpCodeCache.map;
    }

    const map = new Map<string, string>();
    try {
      const url = `${OPEN_DART_BASE}/corpCode.xml?crtfc_key=${apiKey}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ResearchAI/1.0' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `[DART] corpCode.xml 다운로드 실패 — body: ${body.slice(0, 300)}`,
        );
        return map;
      }

      const zipBuf = Buffer.from(await res.arrayBuffer());
      const xml = await this.extractXmlFromZip(zipBuf);
      if (!xml) {
        this.logger.error(
          '[DART] ZIP 파싱 실패 — compression 방식 미지원 또는 헤더 오류',
        );
        return map;
      }

      const re =
        /<list>[\s\S]*?<corp_code>(\d+)<\/corp_code>[\s\S]*?<corp_name>([^<]+)<\/corp_name>[\s\S]*?<\/list>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        map.set(m[2].trim(), m[1].trim());
      }
    } catch (err) {
      this.logger.error(
        `[DART] corpCode.xml 오류: ${(err as Error).message}\n${(err as Error).stack}`,
      );
    }

    this.corpCodeCache = { map, fetchedAt: Date.now() };
    return map;
  }

  private async extractXmlFromZip(zipBuf: Buffer): Promise<string | null> {
    // ── 1. EOCD(End of Central Directory) 탐색 — 파일 끝에서 역방향 ────
    let eocdOffset = -1;
    for (let i = zipBuf.length - 22; i >= 0; i--) {
      if (zipBuf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) {
      this.logger.error('[DART] EOCD 서명 없음');
      return null;
    }
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

    // ── 2. 첫 Central Directory 엔트리에서 정확한 크기 읽기 ────────────
    if (zipBuf.readUInt32LE(cdOffset) !== 0x02014b50) {
      this.logger.error('[DART] CD 서명 불일치');
      return null;
    }
    const compression = zipBuf.readUInt16LE(cdOffset + 10);
    const compressedSz = zipBuf.readUInt32LE(cdOffset + 20);
    const localHdrOffset = zipBuf.readUInt32LE(cdOffset + 42);

    // ── 3. 로컬 헤더에서 데이터 시작 위치 계산 (크기는 CD 값 사용) ────
    if (zipBuf.readUInt32LE(localHdrOffset) !== 0x04034b50) {
      this.logger.error('[DART] 로컬 파일 헤더 서명 불일치');
      return null;
    }
    const fileNameLen = zipBuf.readUInt16LE(localHdrOffset + 26);
    const extraLen = zipBuf.readUInt16LE(localHdrOffset + 28);
    const dataStart = localHdrOffset + 30 + fileNameLen + extraLen;
    const compressed = zipBuf.subarray(dataStart, dataStart + compressedSz);

    if (compression === 0) return compressed.toString('utf-8');
    if (compression === 8) {
      const raw = await inflateRawAsync(compressed);
      return raw.toString('utf-8');
    }
    this.logger.error(`[DART] 미지원 compression: ${compression}`);
    return null;
  }
}
