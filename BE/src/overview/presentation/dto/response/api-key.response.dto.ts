import { ApiKeyEntity } from 'src/overview/domain/entity/api-key.entity';

export class ApiKeyResponseDto {
  id: string;
  apiName: string;
  key: string;
  createdAt: Date;

  static from(entity: ApiKeyEntity): ApiKeyResponseDto {
    const dto = new ApiKeyResponseDto();
    dto.id = entity.id;
    dto.apiName = entity.apiName;
    dto.key =
      entity.key.slice(0, 10) + '*'.repeat(Math.max(0, entity.key.length - 10));
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
