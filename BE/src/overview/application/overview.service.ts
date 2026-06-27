import { Injectable } from '@nestjs/common';
import { OverviewEnvImplService } from 'src/overview/application/env/overview-env-impl.service';
import { OverviewUsageImplService } from 'src/overview/application/usage/overview-usage-impl.service';
import { OverviewApiKeyImplService } from 'src/overview/application/api-key/overview-api-key-impl.service';
import { OverviewLogsImplService } from 'src/overview/application/logs/overview-logs-impl.service';
import { ApiKeyResponseDto } from 'src/overview/presentation/dto/response/api-key.response.dto';

@Injectable()
export class OverviewService {
  constructor(
    private readonly envImpl: OverviewEnvImplService,
    private readonly usageImpl: OverviewUsageImplService,
    private readonly apiKeyImpl: OverviewApiKeyImplService,
    private readonly logsImpl: OverviewLogsImplService,
  ) {}

  // ── Env 키 관리 ─────────────────────────────────────────────────────────────
  getApiKeys() {
    return this.envImpl.getApiKeys();
  }

  updateApiKey(key: string, value: string): { ok: boolean } {
    const result = this.envImpl.updateApiKey(key, value);
    this.usageImpl.invalidateCache();
    return result;
  }

  getPromptTemplates() {
    return this.envImpl.getPromptTemplates();
  }

  getPipelineStatus() {
    return this.envImpl.getPipelineStatus();
  }

  // ── 외부 서비스 사용량 ────────────────────────────────────────────────────────
  getTavilyOverview() {
    return this.usageImpl.getTavilyOverview();
  }

  getAnthropicUsage() {
    return this.usageImpl.getAnthropicUsage();
  }

  // ── DB 저장 API 키 ────────────────────────────────────────────────────────────
  getStoredApiKeys(): Promise<ApiKeyResponseDto[]> {
    return this.apiKeyImpl.getStoredApiKeys();
  }

  getStoredApiKey(id: string): Promise<ApiKeyResponseDto> {
    return this.apiKeyImpl.getStoredApiKey(id);
  }

  createStoredApiKey(apiName: string, key: string): Promise<ApiKeyResponseDto> {
    return this.apiKeyImpl.createStoredApiKey(apiName, key);
  }

  updateStoredApiKey(
    id: string,
    apiName?: string,
    key?: string,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeyImpl.updateStoredApiKey(id, apiName, key);
  }

  deleteStoredApiKey(id: string): Promise<{ ok: boolean }> {
    return this.apiKeyImpl.deleteStoredApiKey(id);
  }

  // ── 로그 & 애널리틱스 ──────────────────────────────────────────────────────────
  getLogs(page: number, limit: number) {
    return this.logsImpl.getLogs(page, limit);
  }

  getAnalytics(range: string, granularity = '1d') {
    return this.logsImpl.getAnalytics(range, granularity);
  }
}
