import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CronjobsModule } from '@core/cronjobs/cronjobs.module';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from '@apis/health/health.module';
import { InfisicalModule } from '@core/infisical/infisical.module';
import { MySqlModule } from '@core/database/mysql/mysql.module';
// import { CsvCheckerModule } from './csv-checker/csv-checker.module';
import { AuthMysqlModule } from '@apis/auth/auth.module';
import { SystemUsersModule } from '@apis/system-users/system-users.module';
import { UtilityTypesModule } from '@apis/utility-types/utility-types.module';
import { SuppliersModule } from '@apis/suppliers/suppliers.module';
import { AssetAggregatorsModule } from '@apis/asset-aggregators/asset-aggregators.module';
import { UtilityAggregatorsModule } from '@apis/utility-aggregators/utility-aggregators.module';
import { BudgetChaptersModule } from '@apis/budget-chapters/budget-chapters.module';
import { AssetsModule } from '@apis/asset/assets.module';
import { UtilizerGrantModule } from '@apis/utilizer-grant/utilizer-grant.module';
import { UtilitiesModule } from '@apis/utility/utility.module';
import { CostsBorneByModule } from '@apis/costs-borne-by/cost-borne-by.module';
import { MaintenanceManagersModule } from '@apis/maintenance-managers/maintenance-managers.module';
import { InvoicesModule } from '@apis/invoices/invoie.module';
import { ConsipAgreementModule } from '@apis/consip-agreement/consip-agreement.module';
import { PurposeModule } from '@apis/purpose/purpose.module';
import { UtilizerModule } from '@apis/utilizer/utilizer.module';
import { DataImporterModule } from '@/data-importer/data-importer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InfisicalModule,
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    CronjobsModule,
    HealthModule,
    MySqlModule,
    // CsvCheckerModule,
    AuthMysqlModule,
    SystemUsersModule,
    UtilityTypesModule,
    SuppliersModule,
    AssetAggregatorsModule,
    UtilityAggregatorsModule,
    BudgetChaptersModule,
    AssetsModule,
    UtilizerGrantModule,
    UtilitiesModule,
    CostsBorneByModule,
    MaintenanceManagersModule,
    InvoicesModule,
    ConsipAgreementModule,
    PurposeModule,
    UtilizerModule,
    DataImporterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
