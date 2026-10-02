import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Plant } from './entity/plant.entity';
import { PlantThermal } from './entity/plant-thermal.entity';
import { PlantElevator } from './entity/plant-elevator.entity';
import { PlantInspection } from './entity/plant-inspection.entity';
import { PlantFireEquipment } from './entity/plant-fire-equipment.entity';
import { PlantsService } from './plants.service';
import { PlantsController } from './plants.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Plant,
      PlantThermal,
      PlantElevator,
      PlantInspection,
      PlantFireEquipment,
      Asset,
      Utility,
    ]),
  ],
  controllers: [PlantsController],
  providers: [PlantsService],
  exports: [PlantsService],
})
export class PlantsModule {}
