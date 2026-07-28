import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetAggregator } from './entity/asset-aggregator.entity';
import { AssetAggregatorsService } from './asset-aggregators.service';
import { AssetAggregatorsController } from './asset-aggregators.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetAggregator])],
  providers: [AssetAggregatorsService],
  controllers: [AssetAggregatorsController],
  exports: [AssetAggregatorsService],
})
export class AssetAggregatorsModule {}
