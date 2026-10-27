import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CronJob, CronTime } from 'cron';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogModule } from '@apis/audit-log/audit-log.module';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { AccountingImportController } from './accounting-import.controller';
import {
  ACCOUNTING_STEPS,
  AccountingImportService,
  type AccountingStep,
} from './accounting-import.service';
import { AccountingStateModule } from './accounting-state.module';
import { AccountingInboxService } from './accounting-inbox.service';
import { AccountingDataService } from './accounting-data.service';
import { ChapterApplierService } from './chapter-applier.service';
import { CommitmentApplierService } from './commitment-applier.service';
import { AccountingInvoiceService } from './accounting-invoice.service';
import { ShareApplierService } from './share-applier.service';
import { LinkApplierService } from './link-applier.service';
import { AccChapter } from './entity/acc-chapter.entity';
import { AccCommitment } from './entity/acc-commitment.entity';
import { AccLiquidation } from './entity/acc-liquidation.entity';

const DEFAULT_INBOX_CRON = '*/5 * * * *';

// ACCOUNTING_INBOX_CRON vuota o non valida: il default, mai un'API che non parte.
export function inboxCronTime(value: string | undefined): string {
  if (!value?.trim()) return DEFAULT_INBOX_CRON;
  try {
    new CronTime(value);
    return value;
  } catch {
    return DEFAULT_INBOX_CRON;
  }
}

// Ordine dei passi del giro: perimetro e capitoli, poi impegni, fatture,
// quote, collegamenti. Ognuno legge quello che hanno scritto i precedenti.
@Module({
  imports: [
    // Tabelle di appoggio: con autoLoadEntities entrano nel DataSource solo da qui.
    TypeOrmModule.forFeature([AccChapter, AccCommitment, AccLiquidation]),
    AccountingStateModule,
    BudgetCommitmentsModule,
    AuditLogModule,
  ],
  providers: [
    AccountingImportService,
    AccountingInboxService,
    AccountingDataService,
    ChapterApplierService,
    CommitmentApplierService,
    AccountingInvoiceService,
    ShareApplierService,
    LinkApplierService,
    {
      provide: ACCOUNTING_STEPS,
      useFactory: (
        chapters: ChapterApplierService,
        commitments: CommitmentApplierService,
        invoices: AccountingInvoiceService,
        shares: ShareApplierService,
        links: LinkApplierService,
      ): AccountingStep[] => [
        { name: 'chapters', apply: () => chapters.apply() },
        { name: 'commitments', apply: () => commitments.apply() },
        { name: 'invoices', apply: () => invoices.apply() },
        { name: 'shares', apply: () => shares.apply() },
        { name: 'links', apply: () => links.apply() },
      ],
      inject: [
        ChapterApplierService,
        CommitmentApplierService,
        AccountingInvoiceService,
        ShareApplierService,
        LinkApplierService,
      ],
    },
  ],
  controllers: [AccountingImportController],
  exports: [AccountingInboxService],
})
export class AccountingImportModule implements OnModuleInit, OnModuleDestroy {
  private inboxJob?: CronJob;

  constructor(private readonly inbox: AccountingInboxService) {}

  // Casella del container Tinn: ogni 5 minuti (ACCOUNTING_INBOX_CRON).
  onModuleInit() {
    const logger = new Logger(AccountingImportModule.name);
    this.inboxJob = new CronJob(
      inboxCronTime(process.env.ACCOUNTING_INBOX_CRON),
      () =>
        void this.inbox
          .check()
          .catch((error: Error) =>
            logger.error(`controllo della casella Tinn non riuscito: ${error.message}`),
          ),
      null,
      true,
      'Europe/Rome',
    );
  }

  onModuleDestroy() {
    void this.inboxJob?.stop();
  }
}
