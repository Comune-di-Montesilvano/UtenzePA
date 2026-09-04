import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataImporterService } from '@/data-importer/data-importer.service';
import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
import { UtilityAggregator } from '@apis/utility-aggregators/entity/utility-aggregator.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { Supplier } from '@apis/shared/entities/supplier.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { CostsBorneBy } from '@apis/shared/entities/utility_cost_borne_by.entity';
import { MaintenanceManager } from '@apis/shared/entities/maintenanceManagers.entity';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Invoice } from '@apis/invoices/entity/invoice.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Utilizer,
      Asset,
      AssetAggregator,
      UtilityAggregator,
      BudgetChapter,
      Supplier,
      Utility,
      UtilityType,
      CostsBorneBy,
      MaintenanceManager,
      ConsipAgreement,
      UtilizerGrant,
      Invoice,
      Contract,
      ContractUtility,
    ]),
  ],
  providers: [DataImporterService],
  exports: [DataImporterService],
})
export class DataImporterModule {}
