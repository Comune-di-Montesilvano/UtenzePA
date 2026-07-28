import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {plainToInstance} from 'class-transformer';
import {IMaintenanceManager} from './maintenance-manager.interface';

export class MaintenanceManager extends AbstractEntity implements IMaintenanceManager {
  code!: string;
  description?: string;

  static create(data?: Partial<MaintenanceManager>): MaintenanceManager {
    return plainToInstance(MaintenanceManager, {
      id: 0,
      code: '',
      description: null,
      deleted: false,
      ...data
    });
  }
}
