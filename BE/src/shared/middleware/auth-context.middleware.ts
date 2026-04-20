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
    if (!token) return next();

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
            apiKeys: {
              anthropicApiKey: user.anthropicApiKey,
              openaiApiKey: user.openaiApiKey,
              googleApiKey: user.googleApiKey,
              tavilyApiKey: user.tavilyApiKey,
              serperApiKey: user.serperApiKey,
              naverClientId: user.naverClientId,
              naverClientSecret: user.naverClientSecret,
              braveApiKey: user.braveApiKey,
            },
          },
          () => next(),
        );
        return;
      }
    } catch {
      // invalid token — proceed without context
    }
    next();
  }
}
