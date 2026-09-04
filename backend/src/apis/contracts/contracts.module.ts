import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { ContractUtility } from '@apis/contracts/entity/contract-utility.entity';

// Modulo minimo: registra le entity Contract/ContractUtility presso TypeORM
// (necessario con `autoLoadEntities: true`, che carica solo le entity di
// moduli effettivamente importati in AppModule). Service/controller arrivano
// nei task successivi del piano "entità Contratto".
@Module({
  imports: [TypeOrmModule.forFeature([Contract, ContractUtility])],
  exports: [TypeOrmModule],
})
export class ContractsModule {}
