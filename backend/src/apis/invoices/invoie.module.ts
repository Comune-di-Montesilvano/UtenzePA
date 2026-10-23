import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoice.service';
import { InvoicesController } from './invoice.controller';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { InvoiceImportModule } from '@apis/invoice-import/invoice-import.module';
import { UtilityConsumptionsModule } from '@apis/utility-consumptions/utility-consumptions.module';
import { BudgetCommitmentsModule } from '@apis/budget-commitments/budget-commitments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceLine, BudgetCommitment, Contract]),
    InvoiceImportModule,
    UtilityConsumptionsModule,
    BudgetCommitmentsModule,
  ],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
