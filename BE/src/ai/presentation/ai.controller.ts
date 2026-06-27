import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  Query,
} from '@nestjs/common';
import * as os from 'os';
import { execSync } from 'child_process';
import { AiProviderService } from 'src/ai/infrastructure/ai-provider.service';
import { AiService } from 'src/ai/application/ai.service';
import { AiCallLogRepository } from 'src/ai/domain/repository/ai-call-log.repository';
import { SessionItemQueryService } from 'src/sessions/application/query/session-item-query.service';
import { SessionItemCommandService } from 'src/sessions/application/command/session-item-command.service';
import { requestContext } from 'src/shared/request-context';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiProviderService: AiProviderService,
    private readonly aiService: AiService,
    private readonly aiCallLogRepository: AiCallLogRepository,
    private readonly sessionItemQueryService: SessionItemQueryService,
    private readonly sessionItemCommandService: SessionItemCommandService,
  ) {}

  @Get('system/memory')
  getSystemMemory() {
    const total = os.totalmem();
    if (os.platform() === 'darwin') {
      try {
        const vmstat = execSync('vm_stat', { encoding: 'utf8' });
        const pageSize = parseInt(
          vmstat.match(/page size of (\d+)/)?.[1] ?? '16384',
          10,
        );
        const get = (key: string) => {
          const m = vmstat.match(new RegExp(`${key}:\\s+(\\d+)`));
          return m ? parseInt(m[1], 10) * pageSize : 0;
        };
        const free = get('Pages free') + get('Pages speculative');
        const cached = get('Pages inactive');
        const wired = get('Pages wired down');
        const active = get('Pages active');
        const compressed = get('Pages occupied by compressor');
        const used = wired + active + compressed;
        return { total, free, used, cached };
      } catch {
        // fall through to os fallback
      }
    }
    const free = os.freemem();
    return { total, free, used: total - free, cached: 0 };
  }

  @Get('ollama/running')
  async getRunningModels() {
    return this.aiProviderService.getRunningOllamaModels();
  }

  @Get('llama-cpp/models')
  async getLlamaCppModels() {
    return this.aiProviderService.getLlamaCppModels();
  }

  @Post('ollama/unload/:model')
  @HttpCode(200)
  async unloadModel(@Param('model') model: string) {
    await this.aiProviderService.unloadOllamaModel(model);
    return { model, unloaded: true };
  }

  @Post('improve-task')
  @HttpCode(200)
  async improveTask(
    @Body()
    body: {
      topic: string;
      title: string;
      prompt: string;
      model: string;
    },
  ) {
    return this.aiService.improveTask(
      body.topic,
      body.title,
      body.prompt,
      body.model,
    );
  }

  @Post('re-evaluate-confidence')
  @HttpCode(200)
  async reEvaluateConfidence(@Body() body: { itemId: string; model: string }) {
    const item = await this.sessionItemQueryService.findById(body.itemId);
    const confidence = await this.aiService.evaluateConfidence(
      item.aiResult ?? '',
      item.webResult ?? '',
      body.model,
    );
    await this.sessionItemCommandService.updateConfidence(
      body.itemId,
      confidence,
    );
    return confidence;
  }

  @Post('write-assist')
  @HttpCode(200)
  async writeAssist(
    @Body() body: { content: string; instruction: string; model: string },
  ) {
    return this.aiService.writeAssist(
      body.content,
      body.instruction,
      body.model,
    );
  }

  @Get('call-logs')
  async getCallLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('model') model?: string,
  ) {
    const userId = requestContext.getStore()?.id ?? null;
    return this.aiCallLogRepository.findPaginated(
      parseInt(page, 10),
      parseInt(limit, 10),
      model || undefined,
      userId,
    );
  }

  @Delete('call-logs')
  @HttpCode(200)
  async deleteCallLogs() {
    const userId = requestContext.getStore()?.id ?? null;
    await this.aiCallLogRepository.deleteAll(userId);
    return { deleted: true };
  }

  @Post('generate-title')
  @HttpCode(200)
  async generateTitle(
    @Body()
    body: {
      topic: string;
      tasks: Array<{ title: string }>;
      model: string;
    },
  ) {
    return this.aiService.generateTitle(body.topic, body.tasks, body.model);
  }

  @Post('chat-tasks')
  @HttpCode(200)
  async chatTasks(
    @Body()
    body: {
      topic: string;
      tasks: Array<{ id: number; title: string; webSearchPrompt: string }>;
      message: string;
      model: string;
      history: Array<{ role: string; content: string }>;
    },
  ) {
    return this.aiService.chatTasks(
      body.topic,
      body.tasks,
      body.message,
      body.model,
      body.history ?? [],
    );
  }

  @Post('analyze-chart')
  @HttpCode(200)
  async analyzeChart(
    @Body()
    body: {
      symbol: string;
      companyName?: string;
      interval: string;
      currentPrice: number;
      changePercent: number;
      recentCandles: Array<{
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
      }>;
      signals: Array<{ label: string; direction: string; description: string }>;
      activeStrategy?: string;
      model?: string;
    },
  ) {
    const model = body.model ?? 'claude-haiku-4-5';
    const {
      symbol,
      companyName,
      interval,
      currentPrice,
      changePercent,
      recentCandles,
      signals,
      activeStrategy,
    } = body;

    const intervalLabel: Record<string, string> = {
      '15m': '15분봉',
      '1h': '1시간봉',
      '4h': '4시간봉',
      '1d': '일봉',
      '1w': '주봉',
    };
    const priceLines = recentCandles
      .slice(-20)
      .map(
        (c) =>
          `${c.date}  종가 ${c.close.toLocaleString()}  고 ${(c.high ?? c.close).toLocaleString()}  저 ${(c.low ?? c.close).toLocaleString()}`,
      )
      .join('\n');

    const signalLines = signals.length
      ? signals
          .map(
            (s) =>
              `  - ${s.label}: ${s.direction === 'bull' ? '▲ 매수' : s.direction === 'bear' ? '▼ 매도' : '● 중립'} — ${s.description}`,
          )
          .join('\n')
      : '  (활성 지표 없음)';

    const strategyNote = activeStrategy
      ? `\n선택된 전략: ${activeStrategy}`
      : '';

    const prompt = `당신은 주식 기술적 분석 전문가입니다. 아래 데이터를 바탕으로 현재 시장 상황을 한국어로 분석해주세요.

종목: ${symbol}${companyName ? ` (${companyName})` : ''}
현재가: ${currentPrice.toLocaleString()}원  변동률: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%
차트 종류: ${intervalLabel[interval] ?? interval}${strategyNote}

── 기술적 지표 현재 신호 ──
${signalLines}

── 최근 가격 데이터 (최신 20개) ──
${priceLines}

── 분석 요청 ──
다음 항목을 포함하여 분석해주세요:
1. 현재 추세 방향과 강도 (상승/하락/횡보, 강함/약함)
2. 주요 지지 및 저항 구간
3. 기술적 지표가 시사하는 진입/청산 시점
4. 주요 리스크 요인
5. 종합 의견 (한두 문장)

※ 이 분석은 참고용이며, 투자 결정은 본인의 판단에 따라야 합니다.`;

    const { text } = await this.aiService.call(model, '', prompt);
    return { analysis: text };
  }
}
