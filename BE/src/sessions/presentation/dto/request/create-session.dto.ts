import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsString()
  @IsNotEmpty()
  researchAiModel: string;

  @IsString()
  @IsNotEmpty()
  researchWebModel: string;

  @IsArray()
  tasks: any[];
}
