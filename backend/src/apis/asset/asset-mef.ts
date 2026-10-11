import {
  ContractDirection,
  ContractStatus,
  DisplayStatus,
} from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { displayStatus } from '@apis/utilizer-grant/real-estate-contract.calc';
import { AssetStatusEnum } from './enum/asset-status.enum';
import { CadastralStatus, MefBuildingType, MefPurpose, MefUsage } from './enum/mef-domains.enum';

export interface AssetMefInput {
  ownership: number;
  status: string | null;
  cadastral_unit_count: number;
  function: { mef_building_type: MefBuildingType | null; mef_purpose: MefPurpose | null } | null;
  grants: {
    id: number;
    direction: string;
    status: ContractStatus;
    end_date: string | null;
    tacit_renewal: boolean;
    renewal_months: number | null;
    notice_months: number | null;
    deleted?: boolean;
  }[];
}

export interface AssetMef {
  usage: MefUsage;
  usage_grant_id: number | null;
  title: 'PROPERTY' | null;
  cadastral_status: CadastralStatus;
  building_type: MefBuildingType | null;
  purpose: MefPurpose | null;
}

const ACTIVE_DISPLAY = new Set([DisplayStatus.ACTIVE, DisplayStatus.EXPIRING]);

// Dati MEF ricavati (nessun campo salvato): utilizzo dai contratti attivi e
// dallo stato, titolo dalla proprietà, stato di accatastamento dalle unità,
// tipologia e finalità dalla funzione. La finalità vale solo con utilizzo
// diretto, come nel censimento MEF.
export function computeAssetMef(a: AssetMefInput, today: string): AssetMef {
  const grant = a.grants.find(
    (g) =>
      !g.deleted &&
      g.direction === ContractDirection.ACTIVE &&
      ACTIVE_DISPLAY.has(displayStatus(g, today)),
  );
  const usage = grant
    ? MefUsage.THIRD_PARTIES
    : a.status === AssetStatusEnum.DISMESSO
      ? MefUsage.UNUSABLE
      : MefUsage.DIRECT;
  return {
    usage,
    usage_grant_id: grant?.id ?? null,
    title: a.ownership === 1 ? 'PROPERTY' : null,
    cadastral_status:
      a.cadastral_unit_count > 0 ? CadastralStatus.REGISTERED : CadastralStatus.NOT_REGISTERED,
    building_type: a.function?.mef_building_type ?? null,
    purpose: usage === MefUsage.DIRECT ? (a.function?.mef_purpose ?? null) : null,
  };
}
