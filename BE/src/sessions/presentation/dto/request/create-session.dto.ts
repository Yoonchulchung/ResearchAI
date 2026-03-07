import { IsString, IsNotEmpty, IsArray } from 'class-validator';

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
}
