import { BadRequestException } from '@nestjs/common';
import type { AccountingStateService } from './accounting-state.service';
import { RecordSource } from './record-source.enum';

export const ACCOUNTING_LOCKED_MESSAGE =
  "Con l'import della contabilità attivo questo dato arriva dalla contabilità.";

const isNumeric = (v: unknown): boolean =>
  typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)));

// Valori uguali per il confronto col form, che rimanda tutti i campi: importi
// al centesimo (MySQL restituisce i decimal come stringhe), vuoto = null.
export function sameValue(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) && empty(b);
  if (isNumeric(a) && isNumeric(b))
    return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
  return String(a) === String(b);
}

// Campi del DTO presenti e diversi dal valore salvato.
export function changedFields(current: object, dto: object, fields: readonly string[]): string[] {
  const c = current as Record<string, unknown>;
  const d = dto as Record<string, unknown>;
  return fields.filter((f) => d[f] !== undefined && !sameValue(c[f], d[f]));
}

// Con l'import attivo non si crea a mano quello che arriva dalla contabilità.
export async function assertCanCreate(
  accounting: AccountingStateService | undefined,
): Promise<void> {
  if (await accounting?.isActive()) throw new BadRequestException(ACCOUNTING_LOCKED_MESSAGE);
}

// Un dato importato, con l'import attivo, non si cancella né cambia nei campi
// della contabilità; gli altri campi restano modificabili.
export async function assertCanChange(
  accounting: AccountingStateService | undefined,
  current: { source?: string | null },
  changed: boolean,
): Promise<void> {
  if (!changed || current.source !== RecordSource.ACCOUNTING) return;
  if (await accounting?.isActive()) throw new BadRequestException(ACCOUNTING_LOCKED_MESSAGE);
}
