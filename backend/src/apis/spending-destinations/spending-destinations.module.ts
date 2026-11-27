import { Global, Logger, Module, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { SpendingDestination } from './entity/spending-destination.entity';
import { SpendingDestinationsService } from './spending-destinations.service';
import { SpendingDestinationsController } from './spending-destinations.controller';
import { ChapterDerivationService } from './chapter-derivation.service';

// Globale: immobili, impianti, utenze e capitoli chiedono il ricalcolo dopo
// ogni salvataggio senza importare questo modulo (eviterebbe import circolari).
// Cron registrato qui (non @Cron nel service): @nestjs/schedule è ESM-only e
// non caricabile dagli spec jest, come utility-supply.module.ts.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SpendingDestination]), BudgetCommitmentsModule],
  controllers: [SpendingDestinationsController],
  providers: [SpendingDestinationsService, ChapterDerivationService],
  exports: [SpendingDestinationsService, ChapterDerivationService],
})
export class SpendingDestinationsModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(SpendingDestinationsModule.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly derivation: ChapterDerivationService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.CHAPTER_DERIVATION_CRON ?? '20 3 * * *';
    // Orario italiano: il container gira in UTC.
    const job = new CronJob(cronTime, () => this.run(), null, false, 'Europe/Rome');
    this.schedulerRegistry.addCronJob('chapter-derivation', job);
    job.start();
  }

  // In background: l'avvio non aspetta il giro su tutte le utenze.
  onApplicationBootstrap() {
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      await this.derivation.requestAll();
    } catch (error) {
      this.logger.error('Ricalcolo dei capitoli per destinazione fallito', error as Error);
    }
  }
}
