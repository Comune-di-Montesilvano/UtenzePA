import {Exclude, plainToInstance, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IUtilizerGrant} from './utilizer-grant.interface';
import {Asset} from '../../assets/entity/asset.entity';
import {ThirdParty} from '../../third-parties/entity/third-party.entity';
import {SystemUser} from '../../system-users/entity/system-user.entity';
import type {
  ContractDirection,
  ContractKind,
  ContractStatus,
  DisplayStatus,
  RentPeriod,
} from '../real-estate-contract.model';

// Contratto immobiliare (ex concessione). Le date viaggiano come stringhe
// ISO YYYY-MM-DD (colonne `date` lato backend).
export class UtilizerGrant extends AbstractEntity implements IUtilizerGrant {

  concession_act?: string;
  utilities_to_be_taken_over?: boolean;
  usage_type?: string;
  asset_ids?: number[];
  party_ids?: number[];

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

  @Exclude({toPlainOnly: true})
  @Type(() => Asset)
  assets?: Asset[];

  @Exclude({toPlainOnly: true})
  @Type(() => ThirdParty)
  parties?: ThirdParty[];

  @Exclude({toPlainOnly: true})
  parent?: UtilizerGrant | null;

  @Exclude({toPlainOnly: true})
  children?: UtilizerGrant[];

  @Exclude({toPlainOnly: true})
  updated_by?: SystemUser | null;

  // Calcolati dal backend (sola lettura).
  @Exclude({toPlainOnly: true})
  annual_rent?: number | null;

  @Exclude({toPlainOnly: true})
  effective_end_date?: string | null;

  @Exclude({toPlainOnly: true})
  notice_deadline?: string | null;

  @Exclude({toPlainOnly: true})
  computed_status?: DisplayStatus;

  static create(data?: Partial<UtilizerGrant>): UtilizerGrant {
    return plainToInstance(UtilizerGrant, {
      asset_ids: [],
      party_ids: [],
      direction: 'ACTIVE',
      kind: 'CONCESSION',
      status: 'ACTIVE',
      tacit_renewal: false,
      vat_applicable: false,
      utilities_to_be_taken_over: false,
      deleted: false,
      ...data,
    });
  }
}
