import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { AuditLog } from './entity/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

const RETENTION_DAYS = 60;

// Registrazione programmatica invece di @Cron sul service — stesso motivo
// documentato in cronjobs.module.ts/backup.module.ts: @nestjs/schedule@12 è
// ESM puro, un import statico in un file coperto da spec Jest rompe la
// suite ("SyntaxError: Unexpected token export"). L'import qui resta
// confinato al .module.ts, mai caricato dagli spec.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService],
  controllers: [AuditLogController],
  exports: [AuditLogService],
})
export class AuditLogModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit() {
    const job = new CronJob(CronExpression.EVERY_DAY_AT_MIDNIGHT, async () => {
      await this.auditLogService.purgeOlderThan(RETENTION_DAYS);
    });
    this.schedulerRegistry.addCronJob('audit-log-retention', job);
    job.start();
  }
}
