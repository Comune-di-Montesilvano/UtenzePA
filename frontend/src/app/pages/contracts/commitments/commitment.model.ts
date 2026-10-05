import type {BudgetChapter} from '../../budget-chapters/entity/budget-chapter.entity';

export interface Commitment {
  id: number;
  contract_id_fk: number;
  budget_chapter_id_fk: number;
  fiscal_year: number;
  commitment_number: string | null;
  amount: number | null;
  notes: string | null;
  budgetChapter?: BudgetChapter;
}

export type CommitmentPayload = Pick<Commitment, 'budget_chapter_id_fk' | 'fiscal_year' | 'commitment_number' | 'amount' | 'notes'>;

export const chapterLabel = (c: {chapter_code?: string | null; article?: number | string | null; description?: string | null} | null | undefined): string =>
  c?.chapter_code ? `${c.chapter_code}/${c.article ?? 0}${c.description ? ' — ' + c.description : ''}` : 'Senza capitolo';
