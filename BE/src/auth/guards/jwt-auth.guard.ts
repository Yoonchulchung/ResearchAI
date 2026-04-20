import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../application/auth.service';
import { UserEntity } from '../domain/entity/user.entity';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = await super.canActivate(context);
    if (!result) return false;

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const user = req.user as UserEntity & { exp: number };

    const newToken = this.authService.tryRenewToken({ sub: user.id, exp: user.exp }, user);
    if (newToken) res.setHeader('X-New-Token', newToken);

    return true;
  }
}
