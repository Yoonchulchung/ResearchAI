import { Controller, Post, Get, Patch, Body, Req, Param, UseGuards, HttpCode, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../application/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserEntity } from '../domain/entity/user.entity';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // dev 환경: 키 없으면 통과

  const res = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const data = await res.json() as { success: boolean };
  return data.success === true;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('check-username/:username')
  async checkUsername(@Param('username') username: string) {
    const user = await this.authService.findByUsername(username);
    return { available: !user };
  }

  @Post('register')
  @HttpCode(201)
  async register(
    @Body() body: { username: string; password: string; turnstileToken?: string; registerCode?: string },
    @Req() req: Request,
  ) {
    if (!(await verifyTurnstile(body.turnstileToken ?? ''))) {
      throw new BadRequestException('봇 인증에 실패했습니다. 다시 시도해주세요.');
    }
    const requiredCode = process.env.REGISTER_CODE;
    if (requiredCode && body.registerCode !== requiredCode) {
      throw new BadRequestException('초대 코드가 올바르지 않습니다.');
    }
    const ip = this.getIp(req);
    const ua = req.headers['user-agent'];
    return this.authService.register(body.username, body.password, ip, ua);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { username: string; password: string; turnstileToken?: string }, @Req() req: Request) {
    if (!(await verifyTurnstile(body.turnstileToken ?? ''))) {
      throw new BadRequestException('봇 인증에 실패했습니다. 다시 시도해주세요.');
    }
    const ip = this.getIp(req);
    const ua = req.headers['user-agent'];
    return this.authService.login(body.username, body.password, ip, ua);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: UserEntity }) {
    const { passwordHash, ...safe } = req.user;
    void passwordHash;
    return safe;
  }

  @Get('login-history')
  @UseGuards(JwtAuthGuard)
  getLoginHistory(@Req() req: { user: UserEntity }) {
    return this.authService.getLoginHistory(req.user.id);
  }

  private getIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    return req.socket?.remoteAddress;
  }

  @Patch('default-models')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async updateDefaultModels(
    @Req() req: { user: UserEntity },
    @Body() body: { cloudModel?: string; localModel?: string },
  ) {
    await this.authService.updateDefaultModels(req.user.id, body.cloudModel, body.localModel);
    return { ok: true };
  }

  @Patch('api-keys')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async updateSingleApiKey(
    @Req() req: { user: UserEntity },
    @Body() body: { key: string; value: string },
  ) {
    await this.authService.updateSingleApiKey(req.user.id, body.key, body.value);
    return { ok: true };
  }
}
