import { Module, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronjobsService } from './cronjobs.service';

// Registrazione programmatica invece del decorator @Cron sul service: @Cron
// richiederebbe un import statico di '@nestjs/schedule' anche in
// cronjobs.service.ts, file caricato da cronjobs.service.spec.ts —
// @nestjs/schedule@12 è pubblicato come ESM puro (package.json "type":
// "module", nessuna build CJS), non caricabile da jest/ts-jest (CommonJS).
// Qui invece l'import è sicuro: nessuno spec importa CronjobsModule
// direttamente (i .module.ts sono esclusi anche dalla coverage, vedi
// package.json). Pattern "Dynamic schedule module" documentato da NestJS:
// https://docs.nestjs.com/techniques/task-scheduling#dynamic-schedule-module-api
@Module({
  imports: [],
  providers: [CronjobsService],
})
export class CronjobsModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly cronjobsService: CronjobsService,
  ) {}

  onModuleInit() {
    const job = new CronJob(CronExpression.EVERY_DAY_AT_MIDNIGHT, () =>
      this.cronjobsService.handleCron(),
    );
    this.schedulerRegistry.addCronJob('dev-cronjob', job);
    job.start();
  }
}
