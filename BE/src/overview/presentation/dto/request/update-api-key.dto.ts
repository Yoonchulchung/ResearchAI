import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  apiName?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  key?: string;
}
