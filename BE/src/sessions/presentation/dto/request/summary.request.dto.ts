import { IsString, IsNotEmpty } from 'class-validator';

export class SummaryRequestDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string

  @IsString()
  @IsNotEmpty()
  localAIModel: string
}
