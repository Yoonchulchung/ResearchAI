import { Injectable } from '@nestjs/common';
import {
  StockResearchChunk,
  StockResearchImplService,
} from 'src/financial/application/stock/stock-research-impl.service';

export type { StockResearchChunk } from 'src/financial/application/stock/stock-research-impl.service';

@Injectable()
export class StockResearchService {
  constructor(private readonly impl: StockResearchImplService) {}

  research(query: string): AsyncGenerator<StockResearchChunk> {
    return this.impl.research(query);
  }
}
