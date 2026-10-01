import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { ThermalPlant } from './entity/thermal-plant.entity';
import { ThermalPlantsService } from './thermal-plants.service';
import { ThermalPlantsController } from './thermal-plants.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ThermalPlant, Asset, Utility])],
  providers: [ThermalPlantsService],
  controllers: [ThermalPlantsController],
})
export class ThermalPlantsModule {}
