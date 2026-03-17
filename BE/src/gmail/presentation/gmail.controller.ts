import { Controller, Delete, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { GmailService } from '../application/gmail.service';

const FE_BASE = process.env.FE_BASE_URL ?? 'http://localhost:3000';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmail: GmailService) {}

  /** Gmail OAuth URL 반환 */
  @Get('auth-url')
  getAuthUrl() {
    return { url: this.gmail.getAuthUrl() };
  }

  /** Google OAuth 콜백 — 토큰 저장 후 FE로 리다이렉트 */
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    try {
      await this.gmail.handleCallback(code);
      res.redirect(`${FE_BASE}/main?gmail=connected`);
    } catch (err: any) {
      res.redirect(`${FE_BASE}/main?gmail=error&message=${encodeURIComponent(err.message)}`);
    }
  }

  /** 연동 상태 조회 */
  @Get('status')
  getStatus() {
    return this.gmail.getStatus();
  }

  /** 최근 메일 목록 */
  @Get('messages')
  getMessages(@Query('maxResults') maxResults?: string) {
    return this.gmail.getMessages(maxResults ? parseInt(maxResults, 10) : 10);
  }

  /** 연동 해제 */
  @Delete('disconnect')
  async disconnect() {
    await this.gmail.disconnect();
    return { success: true };
  }
}
