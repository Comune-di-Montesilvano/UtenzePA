import {UseType} from '../enum/use-type.enum';

export interface IPurpose {
  id: number;
  name: string;
  use_type: UseType;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}
