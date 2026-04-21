import { Controller, Post, Get, Patch, Body, Req, Param, UseGuards, HttpCode } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserEntity } from '../domain/entity/user.entity';

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
  register(@Body() body: { username: string; password: string }) {
    return this.authService.register(body.username, body.password);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: UserEntity }) {
    const { passwordHash, ...safe } = req.user;
    void passwordHash;
    return safe;
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
