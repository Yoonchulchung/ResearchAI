import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CompanyAnalysisService } from 'src/company/application/analysis/company-analysis.service';

@Controller('company-analysis')
export class CompanyAnalysisController {
  constructor(
    private readonly companyAnalysisService: CompanyAnalysisService,
  ) {}

  @Get()
  listCompanyAnalyses() {
    return this.companyAnalysisService.findAll();
  }

  @Get(':companyKey')
  getCompanyAnalysis(@Param('companyKey') companyKey: string) {
    return this.companyAnalysisService.findByKey(companyKey);
  }

  @Delete(':companyKey')
  async deleteCompanyAnalysis(@Param('companyKey') companyKey: string) {
    await this.companyAnalysisService.delete(companyKey);
    return { ok: true };
  }

  @Post('analyze')
  async analyzeCompany(
    @Body() body: { companyName: string; aiModel?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!body.companyName?.trim()) {
      throw new BadRequestException('companyName 이 필요합니다');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const cleanup = () => res.end();
    req.on('close', cleanup);

    try {
      for await (const event of this.companyAnalysisService.analyzeStream(
        body.companyName,
        body.aiModel ?? '',
      )) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (e) {
      if (!res.writableEnded) {
        const msg = e instanceof Error ? e.message : '오류 발생';
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`,
        );
      }
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }
}
