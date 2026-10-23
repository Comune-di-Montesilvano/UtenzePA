import type {Utility} from '../../utilities/entity/utility.entity';
import type {CommitmentRef} from '../../commitments/commitment.model';

export interface InvoiceLine {
  id?: number;
  amount: number;
  utility_id_fk: number | null;
  commitment_id_fk: number | null;
  // Impegno assegnato dal ricalcolo (true, default) o scelto a mano (false).
  commitment_auto?: boolean;
  period_start: string | null;
  period_end: string | null;
  consumption: number | null;
  supply_code: string | null;
  description: string | null;
  utility?: Utility | null;
  commitment?: CommitmentRef | null;
}

// Senza scelta esplicita: automatico se la riga non indica un impegno.
export const isAutoLine = (l: InvoiceLine): boolean => l.commitment_auto ?? !l.commitment_id_fk;

// Valore della select «Impegno» per «Automatico» (gli id partono da 1).
export const AUTO_COMMITMENT = 0;

const toNumberOrNull = (v: unknown): number | null =>
  v === null || v === undefined || `${v}` === '' ? null : Number(v);

// Solo i campi che il backend accetta (whitelist + forbidNonWhitelisted).
export const toLinePayload = (l: InvoiceLine): InvoiceLine => ({
  amount: Number(l.amount),
  utility_id_fk: l.utility_id_fk ?? null,
  commitment_id_fk: isAutoLine(l) ? null : (l.commitment_id_fk ?? null),
  commitment_auto: isAutoLine(l),
  period_start: l.period_start ?? null,
  period_end: l.period_end ?? null,
  consumption: toNumberOrNull(l.consumption),
  supply_code: l.supply_code?.trim() || null,
  description: l.description?.trim() || null,
});
