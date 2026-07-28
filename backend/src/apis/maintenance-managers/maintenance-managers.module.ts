import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MaintenanceManager } from '../shared/entities/maintenanceManagers.entity';
import { MaintenanceManagersService } from './maintenance-managers.service';
import { MaintenanceManagersController } from './maintenance-managers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceManager])],
  providers: [MaintenanceManagersService],
  controllers: [MaintenanceManagersController],
  exports: [MaintenanceManagersService],
})
export class MaintenanceManagersModule {}
