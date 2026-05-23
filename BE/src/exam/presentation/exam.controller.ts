import { Controller, Get, Post, Query } from '@nestjs/common';
import { ExamService } from '../application/exam.service';
import type { ExamEventListResult } from '../domain/exam-event.types';

@Controller('exams')
export class ExamController {
  constructor(private readonly examService: ExamService) {}

  @Get()
  getEvents(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('refresh') refresh = 'false',
  ): Promise<ExamEventListResult> {
    return this.examService.getEvents({
      from: from || start,
      to: to || end,
      refresh: refresh === 'true' || refresh === '1',
    });
  }

  @Post('refresh')
  async refresh(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ): Promise<{ errors: string[] }> {
    const errors = await this.examService.refreshCache(from || start, to || end);
    return { errors };
  }
}
