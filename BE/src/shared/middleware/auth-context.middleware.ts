import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/application/auth.service';
import { requestContext } from '../request-context';

@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      try {
        const payload = this.jwtService.verify<{ sub: string }>(
          token,
          { secret: process.env.JWT_SECRET ?? 'change-me-in-production' },
        );
        const user = await this.authService.findById(payload.sub);
        if (user) {
          requestContext.run(
            {
              id: user.id,
              username: user.username,
              role: user.role ?? 'visitor',
              defaultCloudModel: user.defaultCloudModel ?? null,
              defaultLocalModel: user.defaultLocalModel ?? null,
              apiKeys: {
                anthropicApiKey: user.anthropicApiKey,
                openaiApiKey: user.openaiApiKey,
                googleApiKey: user.googleApiKey,
                tavilyApiKey: user.tavilyApiKey,
                serperApiKey: user.serperApiKey,
                naverClientId: user.naverClientId,
                naverClientSecret: user.naverClientSecret,
                braveApiKey: user.braveApiKey,
                artificialAnalysisApiKey: user.artificialAnalysisApiKey,
                groqApiKey: user.groqApiKey,
              },
              serviceCredentials: {
                dartApiKey: user.dartApiKey,
                jobplanetId: user.jobplanetId,
                jobplanetPassword: user.jobplanetPassword,
                jobkoreaId: user.jobkoreaId,
                jobkoreaPassword: user.jobkoreaPassword,
                catchId: user.catchId,
                catchPassword: user.catchPassword,
              },
            },
            () => next(),
          );
          return;
        }
      } catch {
        // invalid token — fall through to anon handling
      }
    }

    // 비로그인: X-Anon-Id 헤더를 익명 userId로 사용
    const anonId = req.headers['x-anon-id'];
    if (anonId && typeof anonId === 'string') {
      requestContext.run(
        { id: anonId, username: 'anonymous', role: 'visitor', defaultCloudModel: null, defaultLocalModel: null, apiKeys: {}, serviceCredentials: {} },
        () => next(),
      );
      return;
    }

    next();
  }
}
