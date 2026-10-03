import {ExpireState} from "../enum/expire-state.enum";
import {Phase} from '../enum/phase.enum';
import type {AreraCategory, GasUseCategory} from '../arera-category';
import {IUtilityType} from '../../utility-types/entity/utility-type.interface';
import {IConsipAgreement} from '../../consip-agreement/entity/consip-agreement.interface';
import {ISystemUser} from '../../system-users/entity/system-user.interface';
import {IAsset} from '../../assets/entity/asset.interface';
import {IBudgetChapter} from '../../budget-chapters/entity/budget-chapter.interface';
import {IMaintenanceManager} from '../../maintenance-managers/entity/maintenance-manager.interface';
import {Contract} from '../../contracts/entity/contract.entity';

// "A carico di" calcolato dal backend (apis/utility/cost-status.ts).
export type CostStatus = 'COMUNE' | 'TO_TRANSFER' | 'TRANSFERRED' | 'TO_RECOVER';

export interface CostInfo {
  status: CostStatus;
  parties: {grant_id: number; third_party_id: number; name: string}[];
  active_parties: {grant_id: number; third_party_id: number; name: string}[];
  transferred_to: {id: number; name: string} | null;
  transferred_on: string | null;
}

export interface IUtility {
  id: number;
  additional_notes?: string | null;
  assets?: IAsset[];
  asset_ids?: number[];
  budget_chapter_code_fk: number;
  budgetChapter?: IBudgetChapter;
  consipAgreement?: IConsipAgreement | null;
  contratti?: Contract[];
  cost_info?: CostInfo;
  transferred_to_third_party_id?: number | null;
  transferred_on?: Date | string | null;
  create_date: Date | null;
  created_by?: ISystemUser | null;
  created_by_user_id: number | null;
  deleted: boolean;
  arera_category?: AreraCategory | null;
  gas_use_category?: GasUseCategory | null;
  disconnectable?: boolean | null;
  estimated_annual_consumption?: number | null;
  expiryStatus?: ExpireState | null;
  latitude?: string | null;
  longitude?: string | null;
  maintenance_management_id_fk: number | null;
  maintenanceManager?: IMaintenanceManager | null;
  management_expiry_date?: Date | null;
  meter_number?: string | null;
  meter_removed?: boolean | null;
  meter_verified?: boolean | null;
  notes?: string | null;
  phase_type_electric?: Phase | null;
  power_kw_electric?: number | null;
  reported_consumption_year?: number | null;
  actual_consumption?: number | null;
  specifications?: string | null;
  supplier?: {type?: string | null; company_name?: string | null; last_name?: string | null; first_name?: string | null} | null;
  supplier_address?: string | null;
  supply_active?: boolean | null;
  update_date: Date | null;
  updated_by?: ISystemUser | null;
  updated_by_user_id: number | null;
  utility_code?: string | null;
  utility_id: string;
  utility_type_id_fk: number;
  utilityType?: IUtilityType | null;
  voltage_kw_electric?: string | null;
  water_concession?: Date | null;
  wbs_gas_element?: string | null;
}
