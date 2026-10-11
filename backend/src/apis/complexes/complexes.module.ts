import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Complex } from './entity/complex.entity';
import { ComplexesService } from './complexes.service';
import { ComplexesController } from './complexes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Complex, Asset, Utility, Plant, UtilizerGrant])],
  controllers: [ComplexesController],
  providers: [ComplexesService],
  exports: [ComplexesService],
})
export class ComplexesModule {}
