import type {Utility} from '../../utilities/entity/utility.entity';
import type {Commitment} from '../../contracts/commitments/commitment.model';

export interface InvoiceLine {
  id?: number;
  amount: number;
  utility_id_fk: number | null;
  commitment_id_fk: number | null;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  supply_code: string | null;
  description: string | null;
  utility?: Utility | null;
  commitment?: Commitment | null;
}

const toNumberOrNull = (v: unknown): number | null =>
  v === null || v === undefined || `${v}` === '' ? null : Number(v);

// Solo i campi che il backend accetta (whitelist + forbidNonWhitelisted).
export const toLinePayload = (l: InvoiceLine): InvoiceLine => ({
  amount: Number(l.amount),
  utility_id_fk: l.utility_id_fk ?? null,
  commitment_id_fk: l.commitment_id_fk ?? null,
  period_start: l.period_start ?? null,
  period_end: l.period_end ?? null,
  consumption: toNumberOrNull(l.consumption),
  supply_code: l.supply_code?.trim() || null,
  description: l.description?.trim() || null,
});
