import {IAsset} from '../../assets/entity/asset.interface';
import {IUtilizer} from '../../utilizer/entity/utilizer.interface';
import type {
  ContractDirection,
  ContractKind,
  ContractStatus,
  DisplayStatus,
  RentPeriod,
} from '../real-estate-contract.model';

export interface IUtilizerGrant {
  id: number;
  concession_act?: string;
  utilities_to_be_taken_over?: boolean;
  usage_type?: string;
  utilizer_id_fk: number;
  asset_ids?: number[];
  start_date?: string | null;
  end_date?: string | null;
  direction?: ContractDirection;
  kind?: ContractKind;
  subject?: string | null;
  rent_amount?: number | null;
  rent_period?: RentPeriod | null;
  vat_applicable?: boolean;
  tacit_renewal?: boolean;
  renewal_months?: number | null;
  notice_months?: number | null;
  status?: ContractStatus;
  registration_ref?: string | null;
  cadastral_ref?: string | null;
  area_sqm?: number | null;
  department?: string | null;
  parent_contract_id?: number | null;
  notes?: string | null;
  annual_rent?: number | null;
  effective_end_date?: string | null;
  notice_deadline?: string | null;
  computed_status?: DisplayStatus;
  create_date: Date;
  update_date: Date;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
  created_by?: { id: number; name: string } | null;
  updated_by?: { id: number; firstName?: string; lastName?: string } | null;
  assets?: IAsset[];
  utilizer?: IUtilizer;
}
