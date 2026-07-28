import {ISystemUser} from '../../system-users/entity/system-user.interface';

export interface IMaintenanceManager {
  id: number;
  code: string;
  description?: string;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  created_by?: ISystemUser | null;
  updated_by?: ISystemUser | null;
}
