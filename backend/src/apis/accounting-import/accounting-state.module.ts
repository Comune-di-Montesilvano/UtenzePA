import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingStateService } from './accounting-state.service';
import { AccountingImportState } from './entity/accounting-import-state.entity';

// Solo lo stato dell'import: lo importano i moduli di capitoli, impegni e
// fatture per la sola lettura, senza dipendere dagli applicatori.
@Module({
  imports: [TypeOrmModule.forFeature([AccountingImportState])],
  providers: [AccountingStateService],
  exports: [AccountingStateService],
})
export class AccountingStateModule {}
