import { Module, OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { ChunkedUploadModule } from '@common/chunked-upload/chunked-upload.module';
import { AuthMysqlModule } from '@apis/auth/auth.module';

// Registrazione programmatica invece del decorator @Cron sul service: @Cron
// richiederebbe un import statico di '@nestjs/schedule' anche in
// backup.service.ts, file caricato da backup.service.spec.ts/
// backup.controller.spec.ts — @nestjs/schedule@12 è pubblicato come ESM puro
// (package.json "type": "module", nessuna build CJS), non caricabile da
// jest/ts-jest (CommonJS). Qui invece l'import è sicuro: nessuno spec importa
// BackupModule direttamente (i .module.ts sono esclusi anche dalla coverage,
// vedi package.json). Pattern "Dynamic schedule module" documentato da
// NestJS: https://docs.nestjs.com/techniques/task-scheduling#dynamic-schedule-module-api
@Module({
  imports: [ChunkedUploadModule, AuthMysqlModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly backupService: BackupService,
  ) {}

  onModuleInit() {
    const cronTime = process.env.BACKUP_CRON_SCHEDULE ?? CronExpression.EVERY_DAY_AT_MIDNIGHT;
    const job = new CronJob(cronTime, () => this.backupService.handleScheduledBackup());
    this.schedulerRegistry.addCronJob('backup-scheduled', job);
    job.start();
  }
}
