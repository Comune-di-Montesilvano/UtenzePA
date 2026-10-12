// Gemello di backend/src/apis/acts/act-links.ts.
export type ActLinkEntity = 'asset' | 'plant' | 'utilizer_grant' | 'contract';

export interface ActType {
  id: number;
  name: string;
  sort_order: number;
}

export interface Act {
  id: number;
  act_type_id: number;
  actType?: ActType;
  number: string | null;
  act_date: string | null;
  subject: string;
  issuer: string | null;
  protocol_number: string | null;
  protocol_date: string | null;
  notes: string | null;
  deleted?: boolean;
  assets?: {id: number; asset_name: string | null; address?: string | null}[];
  plants?: {id: number; code: string; name: string}[];
  utilizerGrants?: {id: number; subject: string | null; kind?: string | null}[];
  // Del fornitore solo il nome (niente dati personali).
  contracts?: {id: number; cig_contract: string | null; supplier_name: string}[];
  file_count: number;
  link_count: number;
  update_date?: string;
  updated_by?: {firstName?: string | null; lastName?: string | null} | null;
}

export interface ActPayload {
  act_type_id: number;
  number: string | null;
  act_date: string | null;
  subject: string;
  issuer: string | null;
  protocol_number: string | null;
  protocol_date: string | null;
  notes: string | null;
  asset_ids?: number[];
  plant_ids?: number[];
  utilizer_grant_ids?: number[];
  contract_ids?: number[];
}

export const LINK_IDS_FIELD: Record<ActLinkEntity, keyof ActPayload> = {
  asset: 'asset_ids', plant: 'plant_ids', utilizer_grant: 'utilizer_grant_ids', contract: 'contract_ids',
};

const dateIt = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

// «Delibera di Giunta n. 12 del 03/04/2024»
export function actTitle(a: Pick<Act, 'actType' | 'number' | 'act_date'>): string {
  return [a.actType?.name ?? 'Atto', a.number ? `n. ${a.number}` : '', a.act_date ? `del ${dateIt(a.act_date)}` : '']
    .filter(Boolean).join(' ');
}
