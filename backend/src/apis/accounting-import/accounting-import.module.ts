import { Module } from '@nestjs/common';
import { AuditLogModule } from '@apis/audit-log/audit-log.module';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { AccountingImportController } from './accounting-import.controller';
import { ACCOUNTING_STEPS, AccountingImportService, type AccountingStep } from './accounting-import.service';
import { AccountingStateModule } from './accounting-state.module';
import { AccountingDataService } from './accounting-data.service';
import { ChapterApplierService } from './chapter-applier.service';
import { CommitmentApplierService } from './commitment-applier.service';
import { AccountingInvoiceService } from './accounting-invoice.service';

// Ordine dei passi del giro: perimetro e capitoli, poi impegni, fatture,
// quote, collegamenti. Ognuno legge quello che hanno scritto i precedenti.
@Module({
  imports: [AccountingStateModule, BudgetCommitmentsModule, AuditLogModule],
  providers: [
    AccountingImportService,
    AccountingDataService,
    ChapterApplierService,
    CommitmentApplierService,
    AccountingInvoiceService,
    {
      provide: ACCOUNTING_STEPS,
      useFactory: (
        chapters: ChapterApplierService,
        commitments: CommitmentApplierService,
        invoices: AccountingInvoiceService,
      ): AccountingStep[] => [
        { name: 'chapters', apply: () => chapters.apply() },
        { name: 'commitments', apply: () => commitments.apply() },
        { name: 'invoices', apply: () => invoices.apply() },
      ],
      inject: [ChapterApplierService, CommitmentApplierService, AccountingInvoiceService],
    },
  ],
  controllers: [AccountingImportController],
})
export class AccountingImportModule {}
