import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilityTypesService } from './utility-types.service';
import { SystemUtilityTypesController } from './utility-types.controller';
import { UtilityType } from './entity/utility_type.entity';
import { UtilityTypePurpose } from './entity/utility_type_purpose.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UtilityType, UtilityTypePurpose])],
  providers: [UtilityTypesService],
  controllers: [SystemUtilityTypesController],
  exports: [UtilityTypesService],
})
export class UtilityTypesModule {}
