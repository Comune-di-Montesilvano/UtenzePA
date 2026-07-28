import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilityAggregator } from './entity/utility-aggregator.entity';
import { UtilityAggregatorsService } from './utility-aggregators.service';
import { UtilityAggregatorsController } from './utility-aggregators.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UtilityAggregator])],
  providers: [UtilityAggregatorsService],
  controllers: [UtilityAggregatorsController],
  exports: [UtilityAggregatorsService],
})
export class UtilityAggregatorsModule {}
