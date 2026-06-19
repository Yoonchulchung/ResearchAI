import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SearchSources } from 'src/research/domain/model/search-sources.model';

export class UpdateTaskDto {
  @IsString()
  @IsNotEmpty()
  aiResult: string;

  @IsString()
  @IsOptional()
  webResult?: string;

  @IsString()
  @IsNotEmpty()
  status: string;
}
