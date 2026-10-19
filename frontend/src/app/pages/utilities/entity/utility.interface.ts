
// "A carico di" calcolato dal backend (apis/utility/cost-status.ts).
export type CostStatus = 'COMUNE' | 'TO_TRANSFER' | 'TRANSFERRED' | 'TO_RECOVER' | 'TO_DECIDE';

export interface CostInfo {
  status: CostStatus;
  // Intestatario attuale (voltura in corso di validita').
  holder: {id: number; name: string} | null;
  holder_since: string | null;
  // Cosa e' in sospeso e da quanti giorni.
  pending: {type: 'ACTIVATION' | 'CESSATION' | 'TRANSFER' | 'RETURN' | 'DECISION'; since: string; days: number} | null;
  // Contratti attivi sull'immobile con la decisione per questa utenza.
  grants: {grant_id: number; name: string; decision: 'FOLLOWS' | 'STAYS' | null}[];
}

// "Manutenzione a carico di" calcolata dal backend (apis/utility/maintenance-status.ts).
export interface MaintenanceInfo {
  status: 'COMUNE' | 'SUPPLIER' | 'COUNTERPARTY';
  contracts: {id: number; name: string}[];
  parties: {grant_id: number; third_party_id: number; name: string}[];
}
