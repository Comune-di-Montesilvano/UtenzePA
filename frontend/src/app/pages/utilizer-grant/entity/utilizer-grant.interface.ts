import {IAsset} from '../../assets/entity/asset.interface';
import {IUtilizer} from '../../utilizer/entity/utilizer.interface';

export interface IUtilizerGrant {
  id: number;
  concession_act?: string;
  utilities_to_be_taken_over?: boolean;
  usage_type?: string;
  grant_date?: Date;
  expire_date?: Date;
  asset_id_fk: number;
  utilizer_id_fk: number;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  created_by?: { id: number; name: string } | null;
  updated_by?: { id: number; name: string } | null;
  asset?: IAsset;
  utilizer?: IUtilizer;
}
