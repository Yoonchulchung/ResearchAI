import { IsString, IsOptional } from 'class-validator';

export class StreamSummaryDto {
  @IsOptional()
  @IsString()
  model?: string;
}
