import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utility.service';
import { UtilitiesController } from './utility.controller';
import { Utility } from './entity/utility.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { UtilitySupplyModule } from '@apis/utility-supply/utility-supply.module';
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Utility, Contract, Asset, Plant]), UtilityConsumptionsModule, UtilitySupplyModule, BudgetCommitmentsModule],
  providers: [UtilitiesService],
  controllers: [UtilitiesController],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
