import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';
import { ContractsService } from '@apis/contracts/contracts.service';
import { ContractsController } from '@apis/contracts/contracts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, ContractUtility])],
  providers: [ContractsService],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
