import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {IAsset} from './asset.interface';
import {Exclude, plainToInstance, Transform, Type} from 'class-transformer';
import {Utility} from '../../utilities/entity/utility.entity';
import {UtilizerGrant} from '../../utilizer-grant/entity/utilizer-grant.entity';
import {SystemUser} from '../../system-users/entity/system-user.entity';
import {AssetNature} from '../../asset-nature/entity/asset-nature.entity';
import {AssetFunction} from '../../asset-function/entity/asset-function.entity';
import {AssetStatus} from '../enum/asset-status.enum';
import type {AssetMef, ConstructionPeriod, HeritageConstraint, LegalNature} from '../mef-domains';
import {CadastralUnit} from './cadastral-unit';

export class Asset extends AbstractEntity implements IAsset {
  asset_name!: string;
  associated_building?: string;
  toponym?: string;
  address?: string;
  civic_number?: string;
  zip_code?: string;
  municipality?: string;
  ownership!: number;
  specific_details?: string;
  memo?: string;
  services_and_artifacts?: string;
  latitude?: string;
  longitude?: string;
  geocoded_latitude?: string;
  geocoded_longitude?: string;
  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  area_sqm?: number;

  // Dati del censimento MEF. mef_id: sola lettura, lo scrive l'import.
  @Exclude({toPlainOnly: true})
  mef_id?: number | null;
  legal_nature?: LegalNature | null;
  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  reference_area_sqm?: number | null;
  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  appurtenance_area_sqm?: number | null;
  @Transform(({ value }) => (value !== null && value !== undefined && value !== '' ? Number(value) : value))
  volume_m3?: number | null;
  construction_period?: ConstructionPeriod | null;
  heritage_constraint?: HeritageConstraint | null;
  federal_transfer?: boolean | null;
  confiscated?: boolean | null;

  // Unità catastali lette dal backend; il salvataggio le invia come cadastral_units.
  @Exclude({toPlainOnly: true})
  @Type(() => CadastralUnit)
  cadastralUnits?: CadastralUnit[];
  cadastral_units?: CadastralUnit[];

  // Dati MEF calcolati dal backend (utilizzo, accatastamento, tipologia…).
  @Exclude({toPlainOnly: true})
  mef?: AssetMef;
  nature_id?: number | null;
  function_id?: number | null;
  complex_id?: number | null;

  // Solo lettura (il salvataggio usa complex_id).
  @Exclude({toPlainOnly: true})
  complex?: {id: number; name: string} | null;
  status?: AssetStatus;

  @Exclude({toPlainOnly: true})
  @Type(() => AssetNature)
  assetNature?: AssetNature | null;

  @Exclude({toPlainOnly: true})
  @Type(() => AssetFunction)
  assetFunction?: AssetFunction | null;

  @Exclude({toPlainOnly: true})
  created_by?: { id: number; name: string } | null;

  @Exclude({toPlainOnly: true})
  @Type(() => SystemUser)
  updated_by?: SystemUser | null;

  @Exclude({toPlainOnly: true})
  @Type(() => Utility)
  utilities?: Utility[];

  @Exclude({toPlainOnly: true})
  @Type(() => UtilizerGrant)
  utilizerGrants?: UtilizerGrant[];

  static create(data?: Partial<Asset>): Asset {
    return plainToInstance(Asset, {
      asset_id: 0,
      asset_name: '',
      nature_id: null,
      function_id: null,
      complex_id: null,
      status: AssetStatus.ATTIVO,
      ownership: 1,
      area_sqm: 0,
      deleted: false,
      ...data
    });
  }
}


