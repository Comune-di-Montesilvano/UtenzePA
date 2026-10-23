import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { InvoiceLine } from '@apis/invoices/entity/invoice-line.entity';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { BudgetCommitmentsService } from './budget-commitments.service';
import { BudgetCommitmentsController } from './budget-commitments.controller';
import { CommitmentReconcileService } from './commitment-reconcile.service';

// Cron registrato qui (non @Cron nel service): @nestjs/schedule è ESM-only e
// non caricabile dagli spec jest — stesso pattern di utility-supply.module.ts.
// Il giro notturno copre ciò che non passa da un salvataggio (esiti SDI
// arrivati senza estrazione, modifiche fatte direttamente sul DB).
@Module({
  imports: [TypeOrmModule.forFeature([BudgetCommitment, Contract, BudgetChapter, InvoiceLine])],
  providers: [BudgetCommitmentsService, CommitmentReconcileService],
  exports: [CommitmentReconcileService, BudgetCommitmentsService],
  controllers: [BudgetCommitmentsController],
})
export class BudgetCommitmentsModule implements OnModuleInit {
  private readonly logger = new Logger(BudgetCommitmentsModule.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reconcile: CommitmentReconcileService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.COMMITMENT_RECONCILE_CRON ?? '45 3 * * *';
    // Orario italiano: il container gira in UTC.
    const job = new CronJob(cronTime, () => this.run(), null, false, 'Europe/Rome');
    this.schedulerRegistry.addCronJob('commitment-reconcile', job);
    job.start();
  }

  private async run(): Promise<void> {
    try {
      await this.reconcile.reconcileAll();
    } catch (error) {
      this.logger.error('Consumo impegni notturno fallito', error as Error);
    }
  }
}
