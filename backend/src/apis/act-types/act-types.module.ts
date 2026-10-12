import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Act } from '@apis/acts/entity/act.entity';
import { ActType } from './entity/act-type.entity';
import { ActTypesService } from './act-types.service';
import { ActTypesController } from './act-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ActType, Act])],
  controllers: [ActTypesController],
  providers: [ActTypesService],
})
export class ActTypesModule {}
