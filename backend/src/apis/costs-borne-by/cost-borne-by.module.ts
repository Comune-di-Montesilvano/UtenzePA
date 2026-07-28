import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostsBorneBy } from '../shared/entities/utility_cost_borne_by.entity';
import { CostsBorneByService } from './costs-borne-by.service';
import { CostsBorneByController } from './cost-borne-by.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CostsBorneBy])],
  providers: [CostsBorneByService],
  controllers: [CostsBorneByController],
  exports: [CostsBorneByService],
})
export class CostsBorneByModule {}
