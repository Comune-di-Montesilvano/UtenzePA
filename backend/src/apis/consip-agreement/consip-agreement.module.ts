import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsipAgreementService } from '@apis/consip-agreement/consip-agreement.service';
import { ConsipAgreementController } from '@apis/consip-agreement/consip-agreement.controller';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';

@Module({
  imports: [TypeOrmModule.forFeature([ConsipAgreement, Contract]), BudgetCommitmentsModule],
  providers: [ConsipAgreementService],
  controllers: [ConsipAgreementController],
  exports: [ConsipAgreementService],
})
export class ConsipAgreementModule {}
