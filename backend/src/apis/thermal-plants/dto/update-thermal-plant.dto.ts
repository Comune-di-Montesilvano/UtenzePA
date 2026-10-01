import { PartialType } from '@nestjs/swagger';
import { CreateThermalPlantDto } from './create-thermal-plant.dto';

export class UpdateThermalPlantDto extends PartialType(CreateThermalPlantDto) {}
