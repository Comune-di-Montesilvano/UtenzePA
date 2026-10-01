import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import { UtilityConsumptionsService } from './utility-consumptions.service';
import { UtilityConsumptionsController } from './utility-consumptions.controller';
import { ConsumptionRecalcService } from './consumption-recalc.service';

// Cron registrato qui (non @Cron nel service): @nestjs/schedule@12 è
// ESM-only e non caricabile dagli spec jest — stesso pattern di
// backup.module.ts. Ricalcolo notturno: la finestra 12 mesi scorre e le
// stime manuali scadono anche senza nuove rilevazioni.
@Module({
  imports: [TypeOrmModule.forFeature([UtilityConsumption, Utility])],
  providers: [UtilityConsumptionsService, ConsumptionRecalcService],
  controllers: [UtilityConsumptionsController],
  exports: [ConsumptionRecalcService],
})
export class UtilityConsumptionsModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly recalc: ConsumptionRecalcService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.CONSUMPTION_RECALC_CRON ?? '0 3 * * *';
    // Orario italiano: il container gira in UTC.
    const job = new CronJob(
      cronTime,
      () => this.recalc.handleNightlyRecalc(),
      null,
      false,
      'Europe/Rome',
    );
    this.schedulerRegistry.addCronJob('consumption-recalc', job);
    job.start();
  }
}
