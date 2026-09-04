import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utility.service';
import { UtilitiesController } from './utility.controller';
import { Utility } from './entity/utility.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Utility, Contract])],
  providers: [UtilitiesService],
  controllers: [UtilitiesController],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
