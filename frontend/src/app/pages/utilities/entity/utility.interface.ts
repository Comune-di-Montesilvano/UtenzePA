
// "A carico di" calcolato dal backend (apis/utility/cost-status.ts).
export type CostStatus = 'COMUNE' | 'TO_TRANSFER' | 'TRANSFERRED' | 'TO_RECOVER';

export interface CostInfo {
  status: CostStatus;
  parties: {grant_id: number; third_party_id: number; name: string}[];
  active_parties: {grant_id: number; third_party_id: number; name: string}[];
  transferred_to: {id: number; name: string} | null;
  transferred_on: string | null;
}

// "Manutenzione a carico di" calcolata dal backend (apis/utility/maintenance-status.ts).
export interface MaintenanceInfo {
  status: 'COMUNE' | 'SUPPLIER' | 'COUNTERPARTY';
  contracts: {id: number; name: string}[];
  parties: {grant_id: number; third_party_id: number; name: string}[];
}
