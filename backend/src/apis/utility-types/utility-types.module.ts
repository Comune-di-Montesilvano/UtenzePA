import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilityTypesService } from './utility-types.service';
import { SystemUtilityTypesController } from './utility-types.controller';
import { UtilityType } from './entity/utility_type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UtilityType])],
  providers: [UtilityTypesService],
  controllers: [SystemUtilityTypesController],
  exports: [UtilityTypesService],
})
export class UtilityTypesModule {}
