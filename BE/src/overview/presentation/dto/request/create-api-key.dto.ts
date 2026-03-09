import { IsString, IsNotEmpty } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  apiName: string;

  @IsString()
  @IsNotEmpty()
  key: string;
}
