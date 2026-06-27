import { Injectable } from '@nestjs/common';
import {
  AutoRegisterResult,
  FinancialAutoRegisterImplService,
} from 'src/financial/application/registration/financial-auto-register-impl.service';

export type { AutoRegisterResult } from 'src/financial/application/registration/financial-auto-register-impl.service';

@Injectable()
export class FinancialAutoRegisterService {
  constructor(private readonly impl: FinancialAutoRegisterImplService) {}

  register(symbol: string): Promise<AutoRegisterResult | null> {
    return this.impl.register(symbol);
  }
}
