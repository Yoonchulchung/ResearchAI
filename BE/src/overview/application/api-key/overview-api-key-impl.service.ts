import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiKeyRepository } from 'src/overview/domain/repository/api-key.repository';
import { ApiKeyResponseDto } from 'src/overview/presentation/dto/response/api-key.response.dto';

@Injectable()
export class OverviewApiKeyImplService {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async getStoredApiKeys(): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyRepository.findAll();
    return keys.map(ApiKeyResponseDto.from);
  }

  async getStoredApiKey(id: string): Promise<ApiKeyResponseDto> {
    const k = await this.apiKeyRepository.findById(id);
    if (!k) throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    return ApiKeyResponseDto.from(k);
  }

  async createStoredApiKey(
    apiName: string,
    key: string,
  ): Promise<ApiKeyResponseDto> {
    const entity = await this.apiKeyRepository.save({
      id: randomUUID(),
      apiName,
      key,
    });
    return ApiKeyResponseDto.from(entity);
  }

  async updateStoredApiKey(
    id: string,
    apiName?: string,
    key?: string,
  ): Promise<ApiKeyResponseDto> {
    const existing = await this.apiKeyRepository.findById(id);
    if (!existing)
      throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    const updated = await this.apiKeyRepository.update(id, {
      ...(apiName && { apiName }),
      ...(key && { key }),
    });
    return ApiKeyResponseDto.from(updated);
  }

  async deleteStoredApiKey(id: string): Promise<{ ok: boolean }> {
    const existing = await this.apiKeyRepository.findById(id);
    if (!existing)
      throw new NotFoundException(`API 키를 찾을 수 없습니다: ${id}`);
    await this.apiKeyRepository.delete(id);
    return { ok: true };
  }
}
