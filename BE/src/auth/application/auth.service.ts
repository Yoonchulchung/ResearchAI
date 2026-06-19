import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UserEntity } from 'src/auth/domain/entity/user.entity';
import { LoginHistoryEntity } from 'src/auth/domain/entity/login-history.entity';
import { UserApiKeys } from 'src/shared/request-context';

const TOKEN_EXPIRY_SECONDS = 3 * 24 * 60 * 60; // 3 days
const RENEW_THRESHOLD_SECONDS = 24 * 60 * 60; // renew if < 1 day left

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(LoginHistoryEntity)
    private readonly loginHistoryRepo: Repository<LoginHistoryEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const existing = await this.userRepo.findOne({ where: { username } });
    if (existing) throw new ConflictException('이미 사용 중인 사용자명입니다.');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userRepo.save({
      id: randomUUID(),
      username,
      passwordHash,
    });
    void this.saveLoginHistory(user.id, 'register', ipAddress, userAgent);
    return { accessToken: this.signToken(user) };
  }

  async login(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user)
      throw new UnauthorizedException(
        '사용자명 또는 비밀번호가 올바르지 않습니다.',
      );

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException(
        '사용자명 또는 비밀번호가 올바르지 않습니다.',
      );

    void this.saveLoginHistory(user.id, 'login', ipAddress, userAgent);
    return { accessToken: this.signToken(user) };
  }

  async getLoginHistory(
    userId: string,
    limit = 30,
  ): Promise<LoginHistoryEntity[]> {
    return this.loginHistoryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private async saveLoginHistory(
    userId: string,
    action: 'login' | 'register',
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    try {
      await this.loginHistoryRepo.save({
        id: randomUUID(),
        userId,
        action,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ? userAgent.slice(0, 300) : null,
      });
    } catch {
      /* 기록 실패해도 로그인은 정상 처리 */
    }
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async updateApiKeys(
    userId: string,
    keys: Partial<UserApiKeys>,
  ): Promise<void> {
    await this.userRepo.update(userId, {
      anthropicApiKey: keys.anthropicApiKey ?? undefined,
      openaiApiKey: keys.openaiApiKey ?? undefined,
      googleApiKey: keys.googleApiKey ?? undefined,
      tavilyApiKey: keys.tavilyApiKey ?? undefined,
      serperApiKey: keys.serperApiKey ?? undefined,
      naverClientId: keys.naverClientId ?? undefined,
      naverClientSecret: keys.naverClientSecret ?? undefined,
      braveApiKey: keys.braveApiKey ?? undefined,
      artificialAnalysisApiKey: keys.artificialAnalysisApiKey ?? undefined,
      groqApiKey: keys.groqApiKey ?? undefined,
    });
  }

  async updateDefaultModels(
    userId: string,
    cloudModel?: string | null,
    localModel?: string | null,
  ): Promise<void> {
    const update: Partial<UserEntity> = {};
    if (cloudModel !== undefined) update.defaultCloudModel = cloudModel || null;
    if (localModel !== undefined) update.defaultLocalModel = localModel || null;
    if (Object.keys(update).length) await this.userRepo.update(userId, update);
  }

  async updateSingleApiKey(
    userId: string,
    key: string,
    value: string,
  ): Promise<void> {
    const allowed: Record<string, keyof UserEntity> = {
      ANTHROPIC_API_KEY: 'anthropicApiKey',
      OPENAI_API_KEY: 'openaiApiKey',
      GOOGLE_API_KEY: 'googleApiKey',
      TAVILY_API_KEY: 'tavilyApiKey',
      SERPER_API_KEY: 'serperApiKey',
      NAVER_CLIENT_ID: 'naverClientId',
      NAVER_CLIENT_SECRET: 'naverClientSecret',
      BRAVE_API_KEY: 'braveApiKey',
      ARTIFICIAL_ANALYSIS_API_KEY: 'artificialAnalysisApiKey',
      GROQ_API_KEY: 'groqApiKey',
      DART_API_KEY: 'dartApiKey',
      JOBPLANET_ID: 'jobplanetId',
      JOBPLANET_PASSWORD: 'jobplanetPassword',
      JOBKOREA_ID: 'jobkoreaId',
      JOBKOREA_PASSWORD: 'jobkoreaPassword',
      CATCH_ID: 'catchId',
      CATCH_PASSWORD: 'catchPassword',
    };
    const field = allowed[key];
    if (!field) throw new UnauthorizedException('지원하지 않는 키입니다.');
    await this.userRepo.update(userId, { [field]: value || null });
  }

  /** 토큰 만료까지 1일 미만이면 새 토큰을 반환, 아니면 null */
  tryRenewToken(
    payload: { sub: string; exp: number },
    user: UserEntity,
  ): string | null {
    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    if (remaining < RENEW_THRESHOLD_SECONDS) {
      return this.signToken(user);
    }
    return null;
  }

  private signToken(user: UserEntity): string {
    return this.jwtService.sign(
      { sub: user.id, username: user.username },
      { expiresIn: TOKEN_EXPIRY_SECONDS },
    );
  }
}
