import { RentPeriod } from './enum/real-estate-contract.enum';

export interface ContractShape {
  id: number | null;
  start_date: string | null;
  end_date: string | null;
  rent_amount: number | null;
  rent_period: RentPeriod | null;
  tacit_renewal: boolean;
  renewal_months: number | null;
  notice_months: number | null;
  parent_contract_id: number | null;
  parentHasParent: boolean;
}

// Coerenza del contratto risultante (dopo il merge con il persistito):
// i contratti importati da Access senza canone né date restano validi.
export function validateContract(c: ContractShape): string | null {
  const hasAmount = c.rent_amount !== null && c.rent_amount !== undefined;
  if (hasAmount && !c.rent_period) return 'Indicare la periodicità del canone.';
  if (!hasAmount && c.rent_period) return 'Indicare il canone per la periodicità scelta.';
  if (c.start_date && c.end_date && c.end_date.slice(0, 10) < c.start_date.slice(0, 10)) {
    return 'La scadenza non può precedere la decorrenza.';
  }
  if (c.tacit_renewal) {
    if (!c.end_date) return 'Con il rinnovo tacito serve la scadenza.';
    if (!(Number(c.renewal_months) > 0))
      return 'Con il rinnovo tacito serve la durata del rinnovo (mesi).';
    if (c.notice_months === null || c.notice_months === undefined || Number(c.notice_months) < 0) {
      return 'Con il rinnovo tacito serve il preavviso di disdetta (mesi).';
    }
  }
  if (c.parent_contract_id !== null && c.parent_contract_id !== undefined) {
    if (c.id !== null && c.parent_contract_id === c.id)
      return 'Un contratto non può essere padre di sé stesso.';
    if (c.parentHasParent)
      return 'Il contratto padre non può avere a sua volta un padre (un solo livello).';
  }
  return null;
}
