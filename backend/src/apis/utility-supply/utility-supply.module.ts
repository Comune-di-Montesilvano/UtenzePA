import { Logger, Module, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilitySupplyEvent } from './entity/utility-supply-event.entity';
import { GrantUtilityDecision } from './entity/grant-utility-decision.entity';
import { SupplyReconcileService } from './supply-reconcile.service';
import { SupplyEventsService } from './supply-events.service';
import { UtilitySupplyController } from './utility-supply.controller';

// Nessun import di UtilityModule/UtilizerGrantModule: sono loro a importare
// questo modulo. Cron registrato qui (non @Cron nel service): @nestjs/schedule
// è ESM-only e non caricabile dagli spec jest — stesso pattern di
// utility-consumptions.module.ts. Il job notturno chiude i contratti finiti
// per data; quello all'avvio copre la migration e i rilasci.
@Module({
  imports: [TypeOrmModule.forFeature([UtilitySupplyEvent, GrantUtilityDecision, Utility])],
  providers: [SupplyReconcileService, SupplyEventsService],
  controllers: [UtilitySupplyController],
  exports: [SupplyReconcileService, SupplyEventsService],
})
export class UtilitySupplyModule implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(UtilitySupplyModule.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly reconcile: SupplyReconcileService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.SUPPLY_RECONCILE_CRON ?? '30 3 * * *';
    // Orario italiano: il container gira in UTC.
    const job = new CronJob(cronTime, () => this.run(), null, false, 'Europe/Rome');
    this.schedulerRegistry.addCronJob('utility-supply-reconcile', job);
    job.start();
  }

  // In background: l'avvio non aspetta il giro su tutte le utenze.
  onApplicationBootstrap() {
    void this.run();
  }

  private async run(): Promise<void> {
    try {
      await this.reconcile.reconcileAll();
    } catch (error) {
      this.logger.error('Riconciliazione storico utenze fallita', error as Error);
    }
  }
}
