import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res,
  Sse,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import type { Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { requestContext } from 'src/shared/request-context';
import { FinancialShortSellingService } from 'src/financial/application/financial-short-selling.service';
import { FinancialInvestorTradingService } from 'src/financial/application/financial-investor-trading.service';
import { CompanyFinancialInsightsService } from 'src/company/application/company-financial-insights.service';
import { StockQuoteService } from 'src/financial/application/stock/stock-quote.service';
import { FinancialAutoRegisterService } from 'src/financial/application/financial-auto-register.service';
import { StockResearchService } from 'src/financial/application/stock/stock-research.service';
import { CompanyFinancialEntity } from 'src/company/domain/entity/company-financial.entity';
import { ShortSellingData } from 'src/financial/infrastructure/krx/krx-short-selling.service';
import { InvestorTradingData } from 'src/financial/infrastructure/krx/krx-investor.service';
import { DartFinancialService } from 'src/financial/infrastructure/dart/dart-financial.service';
import {
  StockMarketService,
  MarketItem,
  ChartPoint,
} from 'src/financial/application/stock/stock-market.service';
import { StockDashboardService } from 'src/financial/application/stock/stock-dashboard.service';
import {
  StockDashboard,
  StockInfo,
  StockQuote,
  StockSearchItem,
} from 'src/financial/domain/stock/stock-market.types';

@Controller('financial')
export class FinancialController {
  private readonly logger = new Logger('FinancialController');

  constructor(
    private readonly shortSelling: FinancialShortSellingService,
    private readonly investorTrading: FinancialInvestorTradingService,
    private readonly financialInsights: CompanyFinancialInsightsService,
    private readonly companyStock: StockQuoteService,
    private readonly stockMarket: StockMarketService,
    private readonly stockDashboard: StockDashboardService,
    private readonly autoRegister: FinancialAutoRegisterService,
    private readonly stockResearch: StockResearchService,
    private readonly dartFinancial: DartFinancialService,
    @InjectRepository(CompanyFinancialEntity)
    private readonly companyFinancialRepo: Repository<CompanyFinancialEntity>,
  ) {}

  // ─── 종목 리서치 채팅 ────────────────────────────────────────────────────

  /**
   * 종목 리서치 SSE 스트림
   * GET /financial/research/stream?q=로봇주에서+부품관련+회사
   */
  @Sse('research/stream')
  researchStream(@Query('q') q: string): Observable<MessageEvent> {
    if (!q?.trim()) {
      return from([
        {
          data: JSON.stringify({
            type: 'error',
            error: '검색어를 입력해주세요.',
          }),
        } as MessageEvent,
      ]);
    }
    const gen = this.stockResearch.research(q.trim());
    return new Observable((subscriber) => {
      (async () => {
        try {
          for await (const chunk of gen) {
            subscriber.next({ data: JSON.stringify(chunk) } as MessageEvent);
            if (chunk.type === 'done' || chunk.type === 'error') break;
          }
          subscriber.complete();
        } catch (e) {
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              error: (e as Error).message,
            }),
          } as MessageEvent);
          subscriber.complete();
        }
      })();
    });
  }

  // ─── 시장 데이터 (구 /stock) ───────────────────────────────────────────

  /** GET /financial/dashboard */
  @Get('dashboard')
  getDashboard(@Query('limit') limit = '20'): Promise<StockDashboard> {
    return this.stockDashboard.getDashboard(Number(limit) || 20);
  }

  /** GET /financial/market */
  @Get('market')
  getMarketData(): Promise<MarketItem[]> {
    return this.stockMarket.getMarketData();
  }

  /**
   * 종목 검색 — GET /financial/search?q=삼성&limit=10
   * 검색 결과에 company 테이블 매핑 (companyId 포함)
   */
  @Get('search')
  async searchStocks(
    @Query('q') query = '',
    @Query('limit') limit = '10',
  ): Promise<(StockSearchItem & { companyId: string | null })[]> {
    const results = await this.stockMarket.searchStocks(
      query,
      Number(limit) || 10,
    );
    return this.enrichWithCompanyId(results);
  }

  /** GET /financial/quote?symbol=000660.KS&interval=1d */
  @Get('quote')
  getStockQuote(
    @Query('symbol') symbol = '',
    @Query('name') name = '',
    @Query('interval') interval = '1d',
    @Query('before') before?: string,
  ): Promise<StockQuote> {
    return this.stockMarket.getStockQuote(symbol, name, interval, before);
  }

  /** GET /financial/chart?symbol=^KS11&range=1mo */
  @Get('chart')
  getMarketChart(
    @Query('symbol') symbol = '^KS11',
    @Query('range') range = '1mo',
  ): Promise<ChartPoint[]> {
    return this.stockMarket.getMarketChart(symbol, range);
  }

  /** GET /financial/price?symbol=^KS11 */
  @Get('price')
  getMarketPrice(
    @Query('symbol') symbol = '^KS11',
  ): Promise<MarketItem | null> {
    return this.stockMarket.getMarketPrice(symbol);
  }

  /** GET /financial/info?symbol=000660.KS */
  @Get('info')
  async getStockInfo(
    @Query('symbol') symbol = '',
  ): Promise<StockInfo & { companyId: string | null }> {
    const info = await this.stockMarket.getStockInfo(symbol);
    const companyId = await this.findCompanyIdBySymbol(symbol);
    return { ...info, companyId };
  }

  // ─── 종목 재무 (companyId / symbol 공통) ─────────────────────────────

  /**
   * 주식 시세 + 차트
   * GET /financial/stock?companyId=<uuid>&interval=1d
   * GET /financial/stock?symbol=000660.KS&interval=1d  (DB에서 companyId 자동 매핑)
   */
  @Get('stock')
  async getStockByCompany(
    @Query('companyId') companyId?: string,
    @Query('symbol') symbol?: string,
    @Query('interval') interval = '1d',
    @Query('before') before?: string,
  ) {
    this.logger.debug(
      `[stock] companyId=${companyId ?? 'none'} symbol=${symbol ?? 'none'} interval=${interval}`,
    );
    let id = companyId;
    if (!id && symbol) {
      id = (await this.findCompanyIdBySymbol(symbol)) ?? undefined;
      this.logger.debug(
        `[stock] symbol=${symbol} → DB lookup → companyId=${id ?? 'not found'}`,
      );
    }
    // DB에 기업 정보가 있으면 Naver+Yahoo 풀 데이터, 없으면 Yahoo 단독 fallback
    if (id) {
      this.logger.debug(`[stock] → CompanyStockService.getStockQuote(${id})`);
      return this.companyStock.getStockQuote(id, interval, before);
    }
    if (symbol) {
      this.logger.debug(
        `[stock] → StockMarketService.getStockQuote(${symbol}) [fallback]`,
      );
      return this.stockMarket.getStockQuote(symbol, '', interval, before);
    }
    throw new BadRequestException(
      'companyId 또는 symbol 파라미터가 필요합니다.',
    );
  }

  /**
   * 공매도 현황
   * GET /financial/short-selling?companyId=<uuid>&days=180
   * GET /financial/short-selling?symbol=000660.KS&days=180
   */
  @Get('short-selling')
  getShortSelling(
    @Query('companyId') companyId?: string,
    @Query('symbol') symbol?: string,
    @Query('days') days = '90',
  ): Promise<ShortSellingData> {
    const d = Number(days) || 90;
    if (companyId) return this.shortSelling.getByCompanyId(companyId, d);
    if (symbol) return this.shortSelling.getBySymbol(symbol, d);
    throw new BadRequestException(
      'companyId 또는 symbol 파라미터가 필요합니다.',
    );
  }

  /**
   * 투자자별 순매수
   * GET /financial/investor-trading?companyId=<uuid>&days=30
   * GET /financial/investor-trading?symbol=000660.KS&days=30
   */
  @Get('investor-trading')
  getInvestorTrading(
    @Query('companyId') companyId?: string,
    @Query('symbol') symbol?: string,
    @Query('days') days = '30',
  ): Promise<InvestorTradingData> {
    const d = Number(days) || 30;
    if (companyId) return this.investorTrading.getByCompanyId(companyId, d);
    if (symbol) return this.investorTrading.getBySymbol(symbol, d);
    throw new BadRequestException(
      'companyId 또는 symbol 파라미터가 필요합니다.',
    );
  }

  /**
   * 재무 인사이트
   * GET /financial/insights?companyId=<uuid>
   */
  @Get('insights')
  getFinancialInsights(@Query('companyId') companyId?: string) {
    if (!companyId)
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    return this.financialInsights.getFinancialInsights(companyId);
  }

  /**
   * DART 재무 데이터 재수집 (DB 업데이트)
   * POST /financial/refresh-financials?companyId=<uuid>
   */
  @Post('refresh-financials')
  async refreshFinancials(@Query('companyId') companyId?: string) {
    if (!companyId)
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    const dartApiKey =
      requestContext.getStore()?.serviceCredentials?.dartApiKey;
    if (!dartApiKey)
      throw new HttpException(
        'DART API 키가 설정되지 않았습니다.',
        HttpStatus.BAD_REQUEST,
      );
    try {
      const financials = await this.financialInsights.refreshFinancials(
        companyId,
        dartApiKey,
      );
      return { ok: true, count: financials.length, financials };
    } catch (e) {
      throw new HttpException(
        (e as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** GET /financial/insights/ai-analysis?companyId=<uuid>&limit=1 */
  @Get('insights/ai-analysis')
  getFinancialAiAnalysisHistory(
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!companyId)
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    return this.financialInsights.getAiAnalysisHistory(
      companyId,
      limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10,
    );
  }

  /** POST /financial/insights/ai-analysis?companyId=<uuid> */
  @Post('insights/ai-analysis')
  analyzeFinancialStatements(
    @Body() body: { model?: string },
    @Query('companyId') companyId?: string,
  ) {
    if (!companyId)
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    return this.financialInsights.analyzeFinancialStatements(
      companyId,
      body.model ?? '',
    );
  }

  /**
   * 분기별 재무 (DART)
   * GET /financial/quarterly?companyId=<uuid>
   */
  @Get('quarterly')
  async getQuarterlyFinancials(@Query('companyId') companyId?: string) {
    if (!companyId)
      throw new BadRequestException('companyId 파라미터가 필요합니다.');
    const dartApiKey =
      requestContext.getStore()?.serviceCredentials?.dartApiKey;
    if (!dartApiKey)
      throw new HttpException(
        'DART API 키가 설정되지 않았습니다.',
        HttpStatus.BAD_REQUEST,
      );
    try {
      return await this.financialInsights.getQuarterlyFinancials(
        companyId,
        dartApiKey,
      );
    } catch (e) {
      throw new HttpException(
        (e as Error).message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DART 공시 PDF 프록시 — HTML 뷰어 URL에서 실제 PDF를 추출해 반환
   * GET /financial/disclosures/pdf?url=<dart-url>
   */
  @Get('disclosures/pdf')
  async getDisclosurePdf(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      throw new HttpException('공시 URL이 필요합니다.', HttpStatus.BAD_REQUEST);
    }

    const pdf = await this.dartFinancial.fetchDisclosurePdf(url);
    if (!pdf) {
      throw new HttpException(
        '공시 PDF를 가져올 수 없습니다.',
        HttpStatus.NOT_FOUND,
      );
    }

    res.set({
      'Content-Type': pdf.contentType,
      'Content-Disposition': 'inline; filename="dart-disclosure.pdf"',
      'Content-Length': String(pdf.buffer.length),
      'Cache-Control': 'public, max-age=3600',
      'X-Frame-Options': 'ALLOWALL',
    });
    return res.send(pdf.buffer);
  }

  /**
   * 종목 로고 프록시 — Naver CDN에서 최초 1회 다운로드 후 서버 디스크에 캐시
   * GET /financial/logo/:code  (code = 6자리 종목코드, e.g. 005930)
   */
  @Get('logo/:code')
  async getStockLogo(
    @Param('code') code: string,
    @Res() res: Response,
  ): Promise<void> {
    const safeCode = code.replace(/[^0-9A-Za-z]/g, '').slice(0, 10);
    if (!safeCode) {
      res.status(400).end();
      return;
    }

    const logoDir = join(process.cwd(), 'data', 'logos');
    if (!existsSync(logoDir)) mkdirSync(logoDir, { recursive: true });

    const filePath = join(logoDir, `${safeCode}.png`);

    // 캐시 히트
    if (existsSync(filePath)) {
      const buf = await readFile(filePath);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7일
      res.end(buf);
      return;
    }

    // Naver CDN에서 다운로드
    try {
      const url = `https://ssl.pstatic.net/imgstock/fn/real/logo/png/stock/Stock${safeCode}.png`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 ResearchAI/1.0',
          Referer: 'https://finance.naver.com/',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) {
        res.status(404).end();
        return;
      }

      const contentType = r.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        res.status(404).end();
        return;
      }

      const buf = Buffer.from(await r.arrayBuffer());
      void writeFile(filePath, buf).catch(() => {});

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.end(buf);
    } catch {
      res.status(502).end();
    }
  }

  /**
   * 신규 종목 자동 등록 (DB에 없는 종목 → Naver 조회 후 CompanyEntity 생성)
   * POST /financial/register?symbol=005380.KS
   */
  @Post('register')
  async registerCompany(@Query('symbol') symbol?: string) {
    if (!symbol) throw new BadRequestException('symbol 파라미터가 필요합니다.');
    const result = await this.autoRegister.register(symbol);
    if (!result)
      throw new HttpException(
        '종목 정보를 조회할 수 없습니다.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return result;
  }

  // ─── 내부 헬퍼 ────────────────────────────────────────────────────────

  /** 심볼(000660.KS) → stockCode(000660) → companyId 매핑 */
  private async findCompanyIdBySymbol(symbol: string): Promise<string | null> {
    if (!symbol) return null;
    const code = symbol
      .replace(/\.K[QS]$/i, '')
      .replace(/\D/g, '')
      .padStart(6, '0');
    if (!code || code === '000000') return null;
    const row = await this.companyFinancialRepo.findOne({
      where: { stockCode: code },
    });
    return row?.companyId ?? null;
  }

  /** 검색 결과에 companyId 병합 */
  private async enrichWithCompanyId(
    items: StockSearchItem[],
  ): Promise<(StockSearchItem & { companyId: string | null })[]> {
    const codes = items
      .map((item) => item.stockCode)
      .filter((c): c is string => !!c);

    if (codes.length === 0)
      return items.map((item) => ({ ...item, companyId: null }));

    const rows = await this.companyFinancialRepo
      .createQueryBuilder('f')
      .where('f.stockCode IN (:...codes)', { codes })
      .select(['f.companyId', 'f.stockCode'])
      .getMany();

    const codeToCompanyId = new Map(
      rows.map((r) => [r.stockCode, r.companyId]),
    );

    return items.map((item) => ({
      ...item,
      companyId: item.stockCode
        ? (codeToCompanyId.get(item.stockCode) ?? null)
        : null,
    }));
  }
}
