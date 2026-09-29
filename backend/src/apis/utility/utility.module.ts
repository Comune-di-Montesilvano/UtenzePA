import { Asset } from '@apis/asset/entity/asset.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utility.service';
import { UtilitiesController } from './utility.controller';
import { Utility } from './entity/utility.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Utility, Contract, Asset]), UtilityConsumptionsModule],
  providers: [UtilitiesService],
  controllers: [UtilitiesController],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
