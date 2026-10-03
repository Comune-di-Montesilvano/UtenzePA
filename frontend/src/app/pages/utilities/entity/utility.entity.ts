import {AbstractEntity} from '../../../core/entities/abstract.entity';
import type {CostInfo, IUtility, MaintenanceInfo} from './utility.interface';
import {Phase} from '../enum/phase.enum';
import {ExpireState} from '../enum/expire-state.enum';
import {ConsipAgreement} from '../../consip-agreement/entity/consip-agreement.entity';
import {UtilityType} from '../../utility-types/entity/utility-type.entity';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {Asset} from '../../assets/entity/asset.entity';
import type {PlantType} from '../../plants/plant.model';
import type {AreraCategory, GasUseCategory} from '../arera-category';
import {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';
import {SystemUser} from '../../system-users/entity/system-user.entity';
import {Contract} from '../../contracts/entity/contract.entity';

export class Utility extends AbstractEntity implements IUtility {
  utility_id!: string;
  utility_code?: string;
  meter_number?: string;
  supplier_address?: string;
  @Exclude({toPlainOnly: true})
  consip_order?: string;
  @Exclude({toPlainOnly: true})
  consip_agreement_id?: number;
  supply_active?: boolean;
  meter_removed?: boolean;
  // Deposito cauzionale del punto di fornitura (dato dell'utenza).
  security_deposit?: number;
  reported_consumption_year?: number;
  // Calcolati dal backend (storico consumi): mai inviati in scrittura,
  // il DTO backend li rifiuterebbe (forbidNonWhitelisted).
  @Exclude({toPlainOnly: true})
  actual_consumption?: number;
  @Exclude({toPlainOnly: true})
  actual_consumption_coverage_days?: number;
  @Exclude({toPlainOnly: true})
  estimated_consumption_source?: 'MANUAL' | 'HISTORY' | 'NONE';
  @Exclude({toPlainOnly: true})
  estimated_consumption_set_at?: string | null;
  estimated_annual_consumption?: number;
  power_kw_electric?: number;
  voltage_kw_electric?: string;
  phase_type_electric?: Phase;
  latitude?: string;
  longitude?: string;
  notes?: string;
  wbs_gas_element?: string;
  meter_verified?: boolean;
  arera_category?: AreraCategory | null;
  gas_use_category?: GasUseCategory | null;
  disconnectable?: boolean | null;
  water_concession?: Date;
  utility_type_id_fk!: number;
  transferred_to_third_party_id?: number | null;
  transferred_on?: Date | string | null;
  @Exclude({toPlainOnly: true})
  supplier_id_fk?: number | null;
  // Inviato al backend (sostituisce gli immobili collegati); in lettura si
  // ricava da `assets`.
  asset_ids?: number[];
  // Inviato al backend (impianti a servizio); in lettura si ricava da `plants`.
  plant_ids?: number[];
  budget_chapter_code_fk!: number;
  @Exclude({toPlainOnly: true})
  order_number?: string;
  @Exclude({toPlainOnly: true})
  cig_contract?: string;

  @Exclude({toPlainOnly: true})
  utilityType?: UtilityType;

  @Exclude({toPlainOnly: true})
  cost_info?: CostInfo;

  @Exclude({toPlainOnly: true})
  maintenance_info?: MaintenanceInfo;

  @Exclude({toPlainOnly: true})
  supplier?: ThirdParty;

  @Exclude({toPlainOnly: true})
  @Type(() => Asset)
  assets?: Asset[];

  @Exclude({toPlainOnly: true})
  plants?: {id: number; code: string; name: string; type: PlantType}[];

  @Exclude({toPlainOnly: true})
  @Type(() => BudgetChapter)
  budgetChapter?: BudgetChapter;

  created_by?: SystemUser | null;
  updated_by?: SystemUser | null;
  @Exclude({toPlainOnly: true})
  supply_start_date?: Date | null;
  @Exclude({toPlainOnly: true})
  supply_expiry_date?: Date | null;
  @Exclude({toPlainOnly: true})
  management_expiry_date?: Date | null;

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  supply_start_date_range?: string[];

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  supply_expiry_date_range?: string[];

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  management_expiry_date_range?: string[];

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  takeover_termination_date_range?: string[];

  @Transform(({value}) => {
    if (Array.isArray(value)) {
      return value.map(date => (date instanceof Date ? date.toISOString() : date));
    }
    return value;
  }, {toPlainOnly: true})
  water_concession_range?: string[];

  @Exclude({toPlainOnly: true})
  takeover_termination_date?: Date | null;

  @Exclude({toPlainOnly: true})
  expiryStatus?: ExpireState | null;

  @Exclude({toPlainOnly: true})
  consipAgreement?: ConsipAgreement | null;

  @Exclude({toPlainOnly: true})
  remainingDays: number = 0;

  @Exclude({toPlainOnly: true})
  @Type(() => Contract)
  contratti?: Contract[];

  get currentContract(): Contract | null {
    return this.contratti?.find(c => c.isCurrent) ?? null;
  }

  get label(): string {
    return `${this.utility_id} (${this.utility_code || 'N/D'})`.trim().replace(/ - $/, '');
  }

  get daysUntilExpiry(): number {
    if (!this.supply_expiry_date) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.supply_expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  get isExpired(): boolean {
    if (!this.supply_expiry_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(this.supply_expiry_date);
    expiry.setHours(0, 0, 0, 0);
    return expiry < today;
  }

  static create(data?: Partial<Utility>): Utility {
    return plainToInstance(Utility, {
      id: 0,
      utility_id: '',
      meter_number: '',
      supply_start_date: new Date(),
      meter_removed: false,
      deleted: false,
      ...data
    });
  }
}
