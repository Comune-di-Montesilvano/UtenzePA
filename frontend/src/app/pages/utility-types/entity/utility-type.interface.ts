import {HardType} from '../enum/hard-type.enum';

export interface IUtilityType {
  id: number;
  name: string;
  description?: string;
  hard_type: HardType;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}
