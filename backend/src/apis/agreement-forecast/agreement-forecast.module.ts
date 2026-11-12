import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { CommitmentReconcileService } from '@apis/budget-commitments/commitment-reconcile.service';
import { AgreementForecastController } from './agreement-forecast.controller';
import { AgreementForecastService } from './agreement-forecast.service';
import { ConsipAgreementForecast } from './entity/agreement-forecast.entity';
import { ConsipAgreementPrice } from './entity/agreement-price.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsipAgreementForecast, ConsipAgreementPrice]),
    BudgetCommitmentsModule,
  ],
  providers: [AgreementForecastService],
  controllers: [AgreementForecastController],
  exports: [AgreementForecastService],
})
export class AgreementForecastModule implements OnModuleInit {
  private readonly logger = new Logger(AgreementForecastModule.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reconcile: CommitmentReconcileService,
    private readonly forecast: AgreementForecastService,
  ) {}

  onModuleInit() {
    // Dopo ogni riconciliazione degli impegni (salvataggio di impegno o
    // fattura, import della contabilità e della PEC, avvio) si riallinea la
    // cache delle convenzioni dei contratti toccati: l'avviso sparisce appena
    // l'impegno è integrato.
    this.reconcile.onReconciled((contractIds) => {
      void this.forecast
        .refreshForContracts(contractIds)
        .catch((e: Error) => this.logger.error('Ricalcolo del fabbisogno fallito', e));
    });

    // Ogni notte, dopo consumi (3:00), storico utenze (3:30) e impegni (3:45).
    const cronTime = process.env.AGREEMENT_FORECAST_CRON || '30 4 * * *';
    // Orario italiano: il container gira in UTC.
    const job = new CronJob(cronTime, () => this.run(), null, false, 'Europe/Rome');
    this.schedulerRegistry.addCronJob('agreement-forecast', job);
    job.start();
  }

  private async run(): Promise<void> {
    try {
      const { processed, failed } = await this.forecast.refreshAll();
      this.logger.log(`Fabbisogno convenzioni: ${processed} aggiornate, ${failed} errori`);
    } catch (e) {
      this.logger.error('Ricalcolo notturno del fabbisogno fallito', e as Error);
    }
  }
}
