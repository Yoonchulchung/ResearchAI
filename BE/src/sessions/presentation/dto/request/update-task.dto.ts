import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SearchSources } from '../../../../research/domain/model/search-sources.model';

export class UpdateTaskDto {
  @IsString()
  @IsNotEmpty()
  result: string;

  @IsString()
  @IsNotEmpty()
  status: string;
}
