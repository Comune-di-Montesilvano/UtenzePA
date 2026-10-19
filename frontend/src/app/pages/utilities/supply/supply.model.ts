// Storico utenze (backend apis/utility-supply): cambiamenti dell'utenza e
// decisioni per contratto immobiliare.
export type SupplyEventType = 'ACTIVATION' | 'CESSATION' | 'TRANSFER' | 'RETURN';

export const SUPPLY_EVENT_LABEL: Record<SupplyEventType, string> = {
  ACTIVATION: 'Attivazione',
  CESSATION: 'Cessazione',
  TRANSFER: 'Voltura',
  RETURN: 'Reintestazione al Comune',
};

export type GrantDecisionValue = 'FOLLOWS' | 'STAYS';

export interface UtilitySupplyEvent {
  id: number;
  utility_id_fk: number;
  type: SupplyEventType;
  // Solo TRANSFER.
  third_party_id_fk: number | null;
  requested_on: string | null;
  effective_on: string | null;
  // ACTIVATION/CESSATION avvenuta senza data conosciuta.
  date_unknown: boolean;
  cancelled_on: string | null;
  // Contratto immobiliare che ha generato il cambiamento (riga automatica).
  utilizer_grant_id_fk: number | null;
  notes: string | null;
  create_date: string;
  update_date: string;
  created_by_user_id: number;
  updated_by_user_id: number;
  deleted: boolean;
}

export interface SupplyEvent extends UtilitySupplyEvent {
  third_party_name: string | null;
  grant_label: string | null;
}

export interface SupplyEventsList {
  events: SupplyEvent[];
  warnings: string[];
}

export interface SupplyEventPayload {
  utility_id_fk?: number;
  type?: SupplyEventType;
  third_party_id_fk?: number | null;
  requested_on?: string | null;
  effective_on?: string | null;
  date_unknown?: boolean;
  notes?: string | null;
}

export interface GrantDecisionRow {
  utility_id: number;
  decision: GrantDecisionValue | null;
  third_party_id: number | null;
  // Proposta di partenza: FOLLOWS se il contratto ha "Utenze da volturare".
  proposal: GrantDecisionValue | null;
  // Contratto FOLLOWS scavalcato da uno più recente con un'altra controparte.
  overridden: boolean;
}

export interface SetDecisionBody {
  decision: GrantDecisionValue;
  third_party_id?: number | null;
}
