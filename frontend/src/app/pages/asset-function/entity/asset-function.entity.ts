import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import type {MefBuildingType, MefPurpose} from '../../assets/mef-domains';

export class AssetFunction extends AbstractEntity {
  name!: string;
  icon?: string | null;
  // Tipologia e finalità del censimento MEF per gli immobili con questa funzione.
  mef_building_type?: MefBuildingType | null;
  mef_purpose?: MefPurpose | null;

  // Campi inviati in creazione/modifica (senza autore): elenco e navigatore.
  static toPayload(e: AssetFunction): Partial<AssetFunction> {
    return {
      name: e.name,
      icon: e.icon,
      mef_building_type: e.mef_building_type ?? null,
      mef_purpose: e.mef_purpose ?? null,
    };
  }

  static create(data?: Partial<AssetFunction>): AssetFunction {
    return plainToInstance(AssetFunction, {id: 0, name: '', icon: null, mef_building_type: null, mef_purpose: null, ...data});
  }
}
