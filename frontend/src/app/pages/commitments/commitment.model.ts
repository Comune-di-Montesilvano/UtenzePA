import {Exclude, plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../core/entities/abstract.entity';
import type {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {commitmentLabel} from './commitment-label';

// Impegno di spesa (GET /commitments): numero della ragioneria, capitolo,
// esercizio di competenza, importo e contratti collegati (N-N). Speso e
// rimanenza calcolati dalle righe di fattura assegnate, mai salvati.
export class Commitment extends AbstractEntity {
  commitment_year!: number | null;
  commitment_num!: number | null;
  commitment_sub!: number | null;
  budget_chapter_id_fk!: number;
  fiscal_year!: number;
  amount!: number | null;
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

  // Campi inviati in creazione/modifica: elenco e navigatore.
  static toPayload(c: Partial<Commitment>): Partial<Commitment> {
    return {
      commitment_year: c.commitment_year ?? null,
      commitment_num: c.commitment_num ?? null,
      commitment_sub: c.commitment_num == null ? null : (c.commitment_sub ?? 1),
      budget_chapter_id_fk: c.budget_chapter_id_fk,
      fiscal_year: c.fiscal_year,
      amount: c.amount ?? null,
      supplier_id_fk: c.supplier_id_fk ?? null,
      contract_ids: c.contract_ids ?? [],
      notes: c.notes?.trim() || null,
    };
  }

  static create(data: Partial<Commitment> = {}): Commitment {
    return plainToInstance(Commitment, {
      id: 0,
      commitment_year: null,
      commitment_num: null,
      commitment_sub: null,
      budget_chapter_id_fk: null,
      fiscal_year: new Date().getFullYear(),
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
  progressive: number;
}

// Impegno come arriva annidato nella riga di fattura (entity, senza calcolati).
export interface CommitmentRef {
  id: number;
  commitment_year: number | null;
  commitment_num: number | null;
  commitment_sub: number | null;
  fiscal_year: number;
  budgetChapter?: BudgetChapter;
}

export const commitmentRefLabel = (c: CommitmentRef | null | undefined): string =>
  c ? commitmentLabel(c.commitment_year, c.commitment_num, c.commitment_sub) : '—';

export const chapterLabel = (c: {chapter_code?: string | null; article?: number | string | null; description?: string | null} | null | undefined): string =>
  c?.chapter_code ? `${c.chapter_code}/${c.article ?? 0}${c.description ? ' — ' + c.description : ''}` : 'Senza capitolo';
