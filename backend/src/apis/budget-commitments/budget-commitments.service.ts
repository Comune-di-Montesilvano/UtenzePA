import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  assertCanChange,
  assertCanCreate,
  changedFields,
} from '@apis/accounting-import/accounting-lock';
import { AccountingStateService } from '@apis/accounting-import/accounting-state.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { CommitmentShareSource } from '@apis/invoices/entity/commitment-share-source.enum';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';
import { SearchBudgetCommitmentDto } from './dto/search-budget-commitment.dto';
import { CommitmentReconcileService } from './commitment-reconcile.service';
import { commitmentLabel } from './commitment-label';
import { idList } from './id-list';
import { annualityFor } from './annuality';
import { dbDay } from '@/helpers/date.helpers';

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;
// Annualità per l'audit: «2026: 100.00; 2027: —».
const yearsLabel = (years: { fiscal_year: number; amount: number | string | null }[]): string =>
  [...years]
    .sort((a, b) => a.fiscal_year - b.fiscal_year)
    .map((y) => `${y.fiscal_year}: ${y.amount === null ? '—' : Number(y.amount).toFixed(2)}`)
    .join('; ');

const LOCKED_FIELDS = [
  'commitment_year',
  'commitment_num',
  'commitment_sub',
  'budget_chapter_id_fk',
  'supplier_id_fk',
];

export interface CommitmentYearRow {
  fiscal_year: number;
  amount: number | null;
  spent: number;
  remaining: number | null;
}

export interface CommitmentRow {
  id: number;
  commitment_year: number | null;
  commitment_num: number | null;
  commitment_sub: number | null;
  label: string;
  budget_chapter_id_fk: number;
  chapter_label: string;
  chapter_description: string | null;
  // Prima annualità; importo, speso e rimanenza = somme delle annualità
  // (importo null se un'annualità non ce l'ha).
  fiscal_year: number;
  amount: number | null;
  spent: number;
  remaining: number | null;
  years: CommitmentYearRow[];
  supplier_id_fk: number | null;
  supplier_name: string | null;
  contract_ids: number[];
  notes: string | null;
  // MANUAL o ACCOUNTING (dalla contabilità: in sola lettura con l'import attivo).
  source: string;
  deleted: boolean;
}

// Quota dell'impegno su una fattura; progressive = speso cumulato in ordine
// di consumo (data fattura, fattura).
export interface CommitmentInvoice {
  share_id: number;
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  amount: number;
  fiscal_year: number;
  source: CommitmentShareSource;
  progressive: number;
}

// Speso = quote di fatture non cancellate e non rifiutate; per annualità
// quelle con il suo esercizio.
const VALID_SHARES = `FROM invoice_commitment_shares s
      JOIN invoices i ON i.id = s.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}`;
const ROWS_SQL = (
  where: string,
) => `/* c_rows */ SELECT bc.id, bc.commitment_year, bc.commitment_num,
    bc.commitment_sub, bc.budget_chapter_id_fk, CONCAT(ch.chapter_code, '/', ch.article) AS chapter_label,
    ch.description AS chapter_description, bc.supplier_id_fk,
    (SELECT MIN(y.fiscal_year) FROM budget_commitment_years y WHERE y.commitment_id = bc.id) AS fiscal_year,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT('fiscal_year', y.fiscal_year, 'amount', y.amount,
       'spent', (SELECT COALESCE(SUM(s.amount), 0) ${VALID_SHARES}
                 WHERE s.commitment_id_fk = bc.id AND s.fiscal_year = y.fiscal_year)))
      FROM budget_commitment_years y WHERE y.commitment_id = bc.id) AS years,
    COALESCE(tp.company_name, TRIM(CONCAT(COALESCE(tp.last_name, ''), ' ', COALESCE(tp.first_name, '')))) AS supplier_name,
    bc.notes, bc.source, bc.deleted,
    (SELECT JSON_ARRAYAGG(bcc.contract_id) FROM budget_commitment_contracts bcc
      WHERE bcc.commitment_id = bc.id) AS contract_ids,
    (SELECT COALESCE(SUM(s.amount), 0) ${VALID_SHARES} WHERE s.commitment_id_fk = bc.id) AS spent
  FROM budget_commitments bc
  JOIN budget_chapters ch ON ch.id = bc.budget_chapter_id_fk
  LEFT JOIN third_parties tp ON tp.id = bc.supplier_id_fk
  WHERE ${where}
  ORDER BY fiscal_year DESC, bc.commitment_num IS NULL, bc.commitment_year, bc.commitment_num, bc.commitment_sub, bc.id`;

const YEARS_DELETE_SQL =
  '/* c_years_delete */ DELETE FROM budget_commitment_years WHERE commitment_id = ?';
const YEARS_INSERT_SQL =
  '/* c_years_insert */ INSERT INTO budget_commitment_years (commitment_id, fiscal_year, amount) VALUES ?';

// Quote a mano su annualità tolte dall'impegno, per esercizio.
const MANUAL_ORPHANS_SQL = `/* c_manual_orphans */ SELECT fiscal_year, COUNT(*) AS n FROM invoice_commitment_shares
  WHERE commitment_id_fk = ? AND source = '${CommitmentShareSource.MANUAL}' AND fiscal_year NOT IN (?)
  GROUP BY fiscal_year`;
const MANUAL_MOVE_SQL = `/* c_manual_move */ UPDATE invoice_commitment_shares SET fiscal_year = ?
  WHERE commitment_id_fk = ? AND source = '${CommitmentShareSource.MANUAL}' AND fiscal_year = ?`;

// Fatture valide con quote a mano sull'impegno.
const MANUAL_SHARES_SQL = `/* c_manual */ SELECT COUNT(DISTINCT s.invoice_id_fk) AS n ${VALID_SHARES}
  WHERE s.commitment_id_fk = ? AND s.source = '${CommitmentShareSource.MANUAL}'`;

const INVOICES_SQL = `/* c_invoices */ SELECT s.id AS share_id, i.id AS invoice_id, i.invoice_id AS invoice_number,
    i.invoice_date, s.amount, s.fiscal_year, s.source
  ${VALID_SHARES}
  WHERE s.commitment_id_fk = ?
  ORDER BY i.invoice_date, i.id, s.id`;

function toYears(v: unknown): CommitmentYearRow[] {
  const list = (typeof v === 'string' ? JSON.parse(v) : (v ?? [])) as Record<string, unknown>[];
  return list
    .map((y) => {
      const amount = toNumber(y.amount);
      const spent = round2(Number(y.spent ?? 0));
      return {
        fiscal_year: Number(y.fiscal_year),
        amount,
        spent,
        remaining: amount === null ? null : round2(amount - spent),
      };
    })
    .sort((a, b) => a.fiscal_year - b.fiscal_year);
}

function toRow(r: Record<string, unknown>): CommitmentRow {
  const years = toYears(r.years);
  const amount =
    years.length && years.every((y) => y.amount !== null)
      ? round2(years.reduce((sum, y) => sum + y.amount!, 0))
      : null;
  const spent = round2(Number(r.spent ?? 0));
  return {
    id: Number(r.id),
    commitment_year: toNumber(r.commitment_year),
    commitment_num: toNumber(r.commitment_num),
    commitment_sub: toNumber(r.commitment_sub),
    label: commitmentLabel(
      toNumber(r.commitment_year),
      toNumber(r.commitment_num),
      toNumber(r.commitment_sub),
    ),
    budget_chapter_id_fk: Number(r.budget_chapter_id_fk),
    chapter_label: String(r.chapter_label ?? ''),
    chapter_description: (r.chapter_description as string | null) ?? null,
    fiscal_year: Number(r.fiscal_year),
    amount,
    spent,
    remaining: amount === null ? null : round2(amount - spent),
    years,
    supplier_id_fk: toNumber(r.supplier_id_fk),
    supplier_name: (r.supplier_name as string | null) || null,
    contract_ids: idList(r.contract_ids),
    notes: (r.notes as string | null) ?? null,
    source: (r.source as string | undefined) ?? 'MANUAL',
    deleted: Boolean(Number(r.deleted ?? 0)),
  };
}

@Injectable()
export class BudgetCommitmentsService extends BaseService<
  BudgetCommitment,
  CreateBudgetCommitmentDto,
  UpdateBudgetCommitmentDto
> {
  protected readonly entityName = 'budget_commitments';
  protected readonly relations = [
    'budgetChapter',
    'contracts',
    'supplier',
    'created_by',
    'updated_by',
  ];

  constructor(
    @InjectRepository(BudgetCommitment)
    protected readonly repo: Repository<BudgetCommitment>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(BudgetChapter)
    private readonly chapterRepo: Repository<BudgetChapter>,
    private readonly reconcile: CommitmentReconcileService,
    @Optional() private readonly accounting?: AccountingStateService,
  ) {
    super();
  }

  async listRows(search: SearchBudgetCommitmentDto): Promise<CommitmentRow[]> {
    const where = ['bc.deleted = ?'];
    const params: unknown[] = [search.deleted ? 1 : 0];
    const add = (sql: string, value: unknown) => {
      where.push(sql);
      params.push(value);
    };
    if (search.fiscal_year) {
      add(
        'EXISTS (SELECT 1 FROM budget_commitment_years y WHERE y.commitment_id = bc.id AND y.fiscal_year = ?)',
        search.fiscal_year,
      );
    }
    if (search.budget_chapter_id) add('bc.budget_chapter_id_fk = ?', search.budget_chapter_id);
    if (search.supplier_id) add('bc.supplier_id_fk = ?', search.supplier_id);
    if (search.contract_id) {
      add(
        'EXISTS (SELECT 1 FROM budget_commitment_contracts x WHERE x.commitment_id = bc.id AND x.contract_id = ?)',
        search.contract_id,
      );
    }
    if (search.consip_agreement_id) {
      add(
        'EXISTS (SELECT 1 FROM budget_commitment_contracts x JOIN contracts c ON c.id = x.contract_id AND c.deleted = 0 ' +
          'WHERE x.commitment_id = bc.id AND c.consip_agreement_id = ?)',
        search.consip_agreement_id,
      );
    }
    const rows: Record<string, unknown>[] = await this.repo.query(
      ROWS_SQL(where.join(' AND ')),
      params,
    );
    return rows.map(toRow);
  }

  async getRow(id: number): Promise<CommitmentRow> {
    const rows: Record<string, unknown>[] = await this.repo.query(ROWS_SQL('bc.id = ?'), [id]);
    if (!rows.length) throw new BadRequestException('Impegno non trovato');
    return toRow(rows[0]);
  }

  async invoices(id: number): Promise<CommitmentInvoice[]> {
    const rows: Record<string, unknown>[] = await this.repo.query(INVOICES_SQL, [id]);
    let progressive = 0;
    return rows.map((r) => {
      progressive = round2(progressive + Number(r.amount));
      return {
        share_id: Number(r.share_id),
        invoice_id: Number(r.invoice_id),
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: dbDay(r.invoice_date) ?? '',
        amount: Number(r.amount),
        fiscal_year: Number(r.fiscal_year),
        source: r.source as CommitmentShareSource,
        progressive,
      };
    });
  }

  async createForContract(
    contractId: number,
    dto: CreateBudgetCommitmentDto,
    userId: number,
  ): Promise<CommitmentRow> {
    const saved = await this.create(
      { ...dto, contract_ids: [...new Set([contractId, ...(dto.contract_ids ?? [])])] },
      userId,
    );
    return this.getRow(saved.id);
  }

  async create(dto: CreateBudgetCommitmentDto, userId?: number): Promise<BudgetCommitment> {
    await assertCanCreate(this.accounting);
    const number = this.number(dto);
    const years = this.years(dto.years);
    await this.ensureChapter(dto.budget_chapter_id_fk);
    await this.ensureFreeNumber(number);
    const contracts = await this.contracts(dto.contract_ids ?? []);
    const fields: Partial<CreateBudgetCommitmentDto> = { ...dto };
    delete fields.contract_ids;
    delete fields.years;
    const item = this.repo.create({
      ...fields,
      ...number,
      years,
      contracts,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    } as never);
    const saved = (await this.repo.save(item)) as unknown as BudgetCommitment;
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    await this.reconcile.reconcileSafe(contracts.map((c) => c.id));
    return saved;
  }

  async update(
    id: number,
    dto: UpdateBudgetCommitmentDto,
    userId?: number,
  ): Promise<BudgetCommitment> {
    if (dto.deleted === false) return this.restore(id, userId);
    delete dto.deleted;
    delete dto.updated_by_user_id;
    const current = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { contracts: true, years: true },
    });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const years = dto.years === undefined ? undefined : this.years(dto.years);
    // Con l'import attivo numero, capitolo, fornitore e importi arrivano dalla contabilità.
    await assertCanChange(
      this.accounting,
      current,
      changedFields(current, dto, LOCKED_FIELDS).length > 0 ||
        (years !== undefined && yearsLabel(years) !== yearsLabel(current.years ?? [])),
    );
    const merged = { ...current, ...dto };
    const number = this.number(merged);
    // Capitolo controllato solo se cambia: uno cancellato dopo resta valido.
    if (
      dto.budget_chapter_id_fk !== undefined &&
      dto.budget_chapter_id_fk !== current.budget_chapter_id_fk
    ) {
      await this.ensureChapter(merged.budget_chapter_id_fk);
    }
    await this.ensureFreeNumber(number, id);
    const before = (current.contracts ?? []).map((c) => c.id);
    const { contract_ids, ...fields } = dto;
    delete fields.years;
    const changes: { fieldName: string; oldValue: unknown; newValue: unknown }[] = [];
    const yearsBefore = yearsLabel(current.years ?? []);
    // Le annualità si scrivono a parte: il salvataggio dei contratti non le tocca.
    delete (current as Partial<BudgetCommitment>).years;
    if (contract_ids !== undefined) {
      const contracts = await this.contracts(contract_ids, before);
      const after = contracts.map((c) => c.id);
      if (before.join(',') !== [...after].sort((a, b) => a - b).join(',')) {
        changes.push({
          fieldName: 'contract_ids',
          oldValue: before.join(', '),
          newValue: after.join(', '),
        });
      }
      current.contracts = contracts;
      await this.repo.save(current);
    }
    if (years !== undefined && yearsLabel(years) !== yearsBefore) {
      changes.push({ fieldName: 'years', oldValue: yearsBefore, newValue: yearsLabel(years) });
      changes.push(...(await this.replaceYears(id, years)));
    }
    const result = await super.update(
      id,
      { ...fields, ...number } as UpdateBudgetCommitmentDto,
      userId,
    );
    if (changes.length) await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    await this.reconcile.reconcileSafe([...new Set([...before, ...(contract_ids ?? before)])]);
    return result;
  }

  // Annualità sostituite in blocco; le quote a mano su un esercizio tolto
  // passano all'annualità più vicina (annualityFor), quelle da contabilità no.
  private async replaceYears(
    id: number,
    years: { fiscal_year: number; amount: number | null }[],
  ): Promise<{ fieldName: string; oldValue: unknown; newValue: unknown }[]> {
    const list = years.map((y) => y.fiscal_year);
    return this.repo.manager.transaction(async (m) => {
      await m.query(YEARS_DELETE_SQL, [id]);
      await m.query(YEARS_INSERT_SQL, [years.map((y) => [id, y.fiscal_year, y.amount])]);
      const orphans: { fiscal_year: number; n: number }[] = await m.query(MANUAL_ORPHANS_SQL, [
        id,
        list,
      ]);
      const moved: { fieldName: string; oldValue: unknown; newValue: unknown }[] = [];
      for (const o of orphans) {
        const from = Number(o.fiscal_year);
        const to = annualityFor(list, from)!;
        await m.query(MANUAL_MOVE_SQL, [to, id, from]);
        moved.push({
          fieldName: 'shares_moved',
          oldValue: `${from} (${Number(o.n)} quote)`,
          newValue: `${to}`,
        });
      }
      return moved;
    });
  }

  // Il numero deve essere ancora libero: nel frattempo può essere stato riusato.
  private async restore(id: number, userId?: number): Promise<BudgetCommitment> {
    const current = await this.repo.findOne({ where: { id }, relations: { contracts: true } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    if (!current.deleted) return current;
    await this.ensureFreeNumber(this.number(current), id);
    current.deleted = false;
    if (userId !== undefined) current.updated_by_user_id = userId;
    const saved = await this.repo.save(current);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      { fieldName: 'deleted', oldValue: true, newValue: false },
    ]);
    await this.reconcile.reconcileSafe((current.contracts ?? []).map((c) => c.id));
    return saved;
  }

  // Le quote automatiche si riassegnano; quelle scelte a mano bloccano
  // (sparirebbe la scelta dell'utente).
  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { contracts: true },
    });
    if (!current) throw new BadRequestException('Impegno non trovato');
    await assertCanChange(this.accounting, current, true);
    const [{ n }] = await this.repo.query(MANUAL_SHARES_SQL, [id]);
    if (Number(n) > 0)
      throw new BadRequestException(`Impegno scelto a mano su ${Number(n)} fatture`);
    current.deleted = true;
    current.updated_by_user_id = userId;
    await this.repo.save(current);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
    await this.reconcile.reconcileSafe((current.contracts ?? []).map((c) => c.id));
  }

  // Esercizi distinti, in ordine; importo assente = null.
  private years(
    list: { fiscal_year: number; amount?: number | null }[] | undefined,
  ): { fiscal_year: number; amount: number | null }[] {
    if (!list?.length) throw new BadRequestException('Indicare almeno un esercizio');
    const years = list
      .map((y) => ({ fiscal_year: Number(y.fiscal_year), amount: y.amount ?? null }))
      .sort((a, b) => a.fiscal_year - b.fiscal_year);
    if (new Set(years.map((y) => y.fiscal_year)).size !== years.length) {
      throw new BadRequestException('Esercizio ripetuto nell’impegno');
    }
    return years;
  }

  private number(dto: {
    commitment_year?: number | null;
    commitment_num?: number | null;
    commitment_sub?: number | null;
  }): {
    commitment_year: number | null;
    commitment_num: number | null;
    commitment_sub: number | null;
  } {
    const year = dto.commitment_year ?? null;
    const num = dto.commitment_num ?? null;
    if ((year === null) !== (num === null)) {
      throw new BadRequestException('Anno e numero dell’impegno vanno indicati insieme');
    }
    return {
      commitment_year: year,
      commitment_num: num,
      commitment_sub: num === null ? null : (dto.commitment_sub ?? 1),
    };
  }

  private async ensureChapter(chapterId: number): Promise<void> {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
  }

  // Unico tra i non cancellati (nel service, non UNIQUE: le cancellate restano).
  private async ensureFreeNumber(
    n: {
      commitment_year: number | null;
      commitment_num: number | null;
      commitment_sub: number | null;
    },
    exceptId?: number,
  ): Promise<void> {
    if (n.commitment_num === null || n.commitment_year === null) return;
    const rows = await this.repo.find({
      where: {
        commitment_year: n.commitment_year,
        commitment_num: n.commitment_num,
        commitment_sub: n.commitment_sub ?? 1,
        deleted: false,
      },
    });
    if (rows.some((r) => r.id !== exceptId)) {
      throw new BadRequestException(
        `Impegno ${commitmentLabel(n.commitment_year, n.commitment_num, n.commitment_sub)} già presente`,
      );
    }
  }

  // I contratti già collegati restano validi anche se cancellati nel frattempo
  // (la scheda li rimanda tutti): solo i nuovi devono essere attivi.
  private async contracts(ids: number[], linked: number[] = []): Promise<Contract[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const kept = new Set(linked);
    const found = (await this.contractRepo.find({ where: { id: In(unique) } })).filter(
      (c) => !c.deleted || kept.has(c.id),
    );
    if (found.length !== unique.length) throw new BadRequestException('Contratto non trovato');
    return unique.map((id) => found.find((c) => c.id === id)!);
  }
}
