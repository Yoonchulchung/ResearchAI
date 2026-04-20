import { Controller, Delete, Get, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { GmailService } from '../application/gmail.service';
import { requestContext } from '../../shared/request-context';

const FE_BASE = process.env.FE_BASE_URL ?? 'http://localhost:3000';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmail: GmailService) {}

  private getUserId(): string {
    const userId = requestContext.getStore()?.id;
    if (!userId) throw new BadRequestException('인증이 필요합니다.');
    return userId;
  }

  @Get('auth-url')
  getAuthUrl() {
    const userId = this.getUserId();
    return { url: this.gmail.getAuthUrl(userId) };
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      if (!state) throw new Error('state 파라미터가 없습니다.');
      await this.gmail.handleCallback(code, state);
      res.redirect(`${FE_BASE}/main?gmail=connected`);
    } catch (err: any) {
      res.redirect(`${FE_BASE}/main?gmail=error&message=${encodeURIComponent(err.message)}`);
    }
  }

  @Get('status')
  getStatus() {
    const userId = this.getUserId();
    return this.gmail.getStatus(userId);
  }

  @Get('messages')
  getMessages(@Query('maxResults') maxResults?: string) {
    const userId = this.getUserId();
    return this.gmail.getMessages(userId, maxResults ? parseInt(maxResults, 10) : 10);
  }

  @Delete('disconnect')
  async disconnect() {
    const userId = this.getUserId();
    await this.gmail.disconnect(userId);
    return { success: true };
  }
}
