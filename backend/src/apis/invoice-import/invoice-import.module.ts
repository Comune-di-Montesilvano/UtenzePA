import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';
import { ConsumptionLinker } from './consumption-linker.service';
import { InvoiceImportState } from './entity/invoice-import-state.entity';
import { InvoiceImportIssue } from './entity/invoice-import-issue.entity';
import { InvoicePattern } from './entity/invoice-pattern.entity';
import { SdiMessage } from './entity/sdi-message.entity';
import { InvoiceApplier } from './invoice-applier.service';
import { InvoiceMatcher } from './invoice-matcher.service';
import { InvoicePatternsController } from './invoice-patterns.controller';
import { InvoicePatternsService } from './invoice-patterns.service';
import { InvoiceImportController } from './invoice-import.controller';
import { InvoiceImportService } from './invoice-import.service';
import {
  ImapPecMailbox,
  imapConfigFromEnv,
  PEC_MAILBOX_FACTORY,
  type PecMailboxFactory,
} from './pec-imap.client';

// Cron registrato qui come in utility-consumptions.module.ts (@nestjs/schedule
// è ESM-only per jest). Il service esce subito se non configurato o spento.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SdiMessage,
      InvoiceImportState,
      Invoice,
      InvoicePattern,
      InvoiceImportIssue,
    ]),
    UtilityConsumptionsModule,
  ],
  providers: [
    InvoiceImportService,
    InvoiceMatcher,
    InvoiceApplier,
    ConsumptionLinker,
    InvoicePatternsService,
    {
      provide: PEC_MAILBOX_FACTORY,
      useValue: (() => {
        const config = imapConfigFromEnv(process.env);
        if (!config) throw new Error('Import non configurato.');
        return new ImapPecMailbox(config);
      }) satisfies PecMailboxFactory,
    },
  ],
  controllers: [InvoiceImportController, InvoicePatternsController],
  exports: [InvoiceImportService],
})
export class InvoiceImportModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly service: InvoiceImportService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.INVOICE_IMPORT_CRON ?? '*/15 * * * *';
    const job = new CronJob(
      cronTime,
      () => void this.service.runOnce(),
      null,
      false,
      'Europe/Rome',
    );
    this.schedulerRegistry.addCronJob('invoice-import', job);
    job.start();
  }
}
