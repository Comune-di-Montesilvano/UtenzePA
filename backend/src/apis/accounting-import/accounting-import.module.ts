import { Module } from '@nestjs/common';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { AccountingImportController } from './accounting-import.controller';
import { ACCOUNTING_STEPS, AccountingImportService } from './accounting-import.service';
import { AccountingStateModule } from './accounting-state.module';
import { AccountingDataService } from './accounting-data.service';

@Module({
  imports: [AccountingStateModule, BudgetCommitmentsModule],
  providers: [AccountingImportService, AccountingDataService, { provide: ACCOUNTING_STEPS, useValue: [] }],
  controllers: [AccountingImportController],
})
export class AccountingImportModule {}
