import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailTokenEntity } from '../domain/entity/gmail-token.entity';

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  isUnread: boolean;
}

export interface GmailStatus {
  connected: boolean;
  email?: string;
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    @InjectRepository(GmailTokenEntity)
    private readonly tokenRepo: Repository<GmailTokenEntity>,
  ) {}

  private get clientId() { return process.env.GMAIL_CLIENT_ID ?? ''; }
  private get clientSecret() { return process.env.GMAIL_CLIENT_SECRET ?? ''; }
  private get redirectUri() {
    return process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:3001/api/gmail/callback';
  }

  getAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback(code: string, userId: string): Promise<string> {
    // 1. code → tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // 2. email 조회
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) throw new Error(`Userinfo fetch failed: ${userRes.status}`);
    const userInfo = await userRes.json() as { email: string };

    // 3. DB upsert (userId 기준)
    const existing = await this.tokenRepo.findOne({ where: { userId } });
    const expiresAt = Date.now() + (tokens.expires_in - 60) * 1000;

    if (existing) {
      existing.email = userInfo.email;
      existing.refreshToken = tokens.refresh_token ?? existing.refreshToken;
      existing.accessToken = tokens.access_token;
      existing.accessTokenExpiresAt = expiresAt;
      await this.tokenRepo.save(existing);
    } else {
      await this.tokenRepo.save(this.tokenRepo.create({
        userId,
        email: userInfo.email,
        refreshToken: tokens.refresh_token ?? '',
        accessToken: tokens.access_token,
        accessTokenExpiresAt: expiresAt,
      }));
    }

    this.logger.log(`Gmail 연동 완료: ${userInfo.email} (userId: ${userId})`);
    return userInfo.email;
  }

  async getStatus(userId: string): Promise<GmailStatus> {
    const token = await this.tokenRepo.findOne({ where: { userId } });
    if (!token) return { connected: false };
    return { connected: true, email: token.email };
  }

  async disconnect(userId: string): Promise<void> {
    await this.tokenRepo.delete({ userId });
    this.logger.log(`Gmail 연동 해제 (userId: ${userId})`);
  }

  async getMessages(userId: string, maxResults = 10): Promise<GmailMessage[]> {
    const token = await this.tokenRepo.findOne({ where: { userId } });
    if (!token) throw new Error('Gmail이 연동되지 않았습니다.');

    const accessToken = await this.ensureAccessToken(token);

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const listData = await listRes.json() as { messages?: { id: string }[] };
    const ids = listData.messages ?? [];

    const messages = await Promise.all(
      ids.map((m) => this.fetchMessage(m.id, accessToken)),
    );
    return messages.filter((m): m is GmailMessage => m !== null);
  }

  private async fetchMessage(id: string, accessToken: string): Promise<GmailMessage | null> {
    try {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const data = await res.json() as {
        id: string;
        snippet: string;
        labelIds: string[];
        payload: { headers: { name: string; value: string }[] };
      };

      const headers = data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      return {
        id: data.id,
        subject: getHeader('Subject') || '(제목 없음)',
        from: this.parseFrom(getHeader('From')),
        date: getHeader('Date'),
        snippet: data.snippet ?? '',
        isUnread: data.labelIds?.includes('UNREAD') ?? false,
      };
    } catch {
      return null;
    }
  }

  private parseFrom(from: string): string {
    const match = from.match(/^"?([^"<]+)"?\s*<.+>$/);
    return match ? match[1].trim() : from;
  }

  private async ensureAccessToken(token: GmailTokenEntity): Promise<string> {
    if (token.accessToken && token.accessTokenExpiresAt && token.accessTokenExpiresAt > Date.now()) {
      return token.accessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: token.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json() as { access_token: string; expires_in: number };

    token.accessToken = data.access_token;
    token.accessTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    await this.tokenRepo.save(token);

    return token.accessToken;
  }
}
