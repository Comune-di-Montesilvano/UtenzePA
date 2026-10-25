import {Exclude, plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../core/entities/abstract.entity';
import type {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {commitmentLabel} from './commitment-label';

// Annualità: esercizio di competenza + importo; speso e rimanenza calcolati.
export interface CommitmentYear {
  fiscal_year: number;
  amount: number | null;
  spent?: number;
  remaining?: number | null;
}

// Impegno di spesa (GET /commitments): numero della ragioneria, capitolo,
// annualità (esercizio + importo, più d'una se pluriennale) e contratti
// collegati (N-N). Speso e rimanenza calcolati dalle righe di fattura
// assegnate, mai salvati.
export class Commitment extends AbstractEntity {
  commitment_year!: number | null;
  commitment_num!: number | null;
  commitment_sub!: number | null;
  budget_chapter_id_fk!: number;
  years!: CommitmentYear[];
  supplier_id_fk!: number | null;
  contract_ids!: number[];
  notes!: string | null;

  // Calcolati dal backend: mai inviati (whitelist + forbidNonWhitelisted).
  @Exclude({toPlainOnly: true}) label!: string;
  @Exclude({toPlainOnly: true}) chapter_label!: string;
  @Exclude({toPlainOnly: true}) chapter_description!: string | null;
  @Exclude({toPlainOnly: true}) supplier_name!: string | null;
  @Exclude({toPlainOnly: true}) spent!: number;
  @Exclude({toPlainOnly: true}) remaining!: number | null;
  // Prima annualità e somma degli importi (null se un'annualità non ce l'ha).
  @Exclude({toPlainOnly: true}) fiscal_year!: number;
  @Exclude({toPlainOnly: true}) amount!: number | null;

  // Campi inviati in creazione/modifica: elenco e navigatore.
  static toPayload(c: Partial<Commitment>): Partial<Commitment> {
    return {
      commitment_year: c.commitment_year ?? null,
      commitment_num: c.commitment_num ?? null,
      commitment_sub: c.commitment_num == null ? null : (c.commitment_sub ?? 1),
      budget_chapter_id_fk: c.budget_chapter_id_fk,
      years: (c.years ?? []).map(y => ({fiscal_year: Number(y.fiscal_year), amount: y.amount ?? null})),
      supplier_id_fk: c.supplier_id_fk ?? null,
      contract_ids: c.contract_ids ?? [],
      notes: c.notes?.trim() || null,
    };
  }

  static create(data: Partial<Commitment> = {}): Commitment {
    const year = new Date().getFullYear();
    return plainToInstance(Commitment, {
      id: 0,
      commitment_year: null,
      commitment_num: null,
      commitment_sub: null,
      budget_chapter_id_fk: null,
      years: [{fiscal_year: year, amount: null}],
      fiscal_year: year,
      amount: null,
      supplier_id_fk: null,
      contract_ids: [],
      notes: null,
      label: '—',
      spent: 0,
      remaining: null,
      deleted: false,
      ...data,
    });
  }
}

// Riga di fattura assegnata all'impegno, in ordine di consumo.
export interface CommitmentLine {
  line_id: number;
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  period_start: string | null;
  period_end: string | null;
  utility_id: number | null;
  utility_code: string | null;
  amount: number;
  auto: boolean;
  fiscal_year: number | null;
  progressive: number;
}

// Impegno come arriva annidato nella riga di fattura (entity, senza calcolati).
export interface CommitmentRef {
  id: number;
  commitment_year: number | null;
  commitment_num: number | null;
  commitment_sub: number | null;
  budgetChapter?: BudgetChapter;
}

// Impegno senza numero (preimpegno): «senza numero» al posto del trattino.
export const commitmentRefLabel = (c: CommitmentRef | null | undefined): string => {
  if (!c) return '—';
  const label = commitmentLabel(c.commitment_year, c.commitment_num, c.commitment_sub);
  return label === '—' ? 'senza numero' : label;
};

// Esercizi di competenza: «2026», «2026–2028» se consecutivi, «2026, 2028».
export const yearsLabel = (list: number[]): string => {
  const years = [...new Set(list.map(Number))].sort((a, b) => a - b);
  if (!years.length) return '—';
  if (years.length === 1) return String(years[0]);
  const consecutive = years.every((y, i) => i === 0 || y === years[i - 1] + 1);
  return consecutive ? `${years[0]}–${years[years.length - 1]}` : years.join(', ');
};

export const competenceLabel = (c: {years?: {fiscal_year: number}[]; fiscal_year?: number} | null | undefined): string =>
  c?.years?.length ? yearsLabel(c.years.map(y => y.fiscal_year)) : c?.fiscal_year ? String(c.fiscal_year) : '—';

export const chapterLabel = (c: {chapter_code?: string | null; article?: number | string | null; description?: string | null} | null | undefined): string =>
  c?.chapter_code ? `${c.chapter_code}/${c.article ?? 0}${c.description ? ' — ' + c.description : ''}` : 'Senza capitolo';
