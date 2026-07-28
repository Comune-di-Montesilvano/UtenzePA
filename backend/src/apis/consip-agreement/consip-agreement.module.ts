import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsipAgreementService } from '@apis/consip-agreement/consip-agreement.service';
import { ConsipAgreementController } from '@apis/consip-agreement/consip-agreement.controller';
import { ConsipAgreement } from '@apis/consip-agreement/entity/consip-agreement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConsipAgreement])],
  providers: [ConsipAgreementService],
  controllers: [ConsipAgreementController],
  exports: [ConsipAgreementService],
})
export class ConsipAgreementModule {}
