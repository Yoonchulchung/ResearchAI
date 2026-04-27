import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsString()
  @IsNotEmpty()
  researchCloudAIModel: string;

  @IsString()
  @IsNotEmpty()
  researchLocalAIModel: string;

  @IsString()
  @IsNotEmpty()
  researchWebModel: string;

  @IsArray()
  tasks: any[];

  @IsOptional()
  @IsString()
  sessionType?: string;

  @IsOptional()
  @IsString()
  lightResearchId?: string | null;
}
