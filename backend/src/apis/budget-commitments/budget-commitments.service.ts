import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetChapter } from '@apis/budget-chapters/entity/budgetChapter.entity';
import { NOT_REJECTED_SQL } from '@apis/invoices/sdi-status';
import { BudgetCommitment } from './entity/budget-commitment.entity';
import { CreateBudgetCommitmentDto } from './dto/create-budget-commitment.dto';
import { UpdateBudgetCommitmentDto } from './dto/update-budget-commitment.dto';
import { SearchBudgetCommitmentDto } from './dto/search-budget-commitment.dto';
import { CommitmentReconcileService } from './commitment-reconcile.service';
import { commitmentLabel } from './commitment-label';

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CommitmentRow {
  id: number;
  commitment_year: number | null;
  commitment_num: number | null;
  commitment_sub: number | null;
  label: string;
  budget_chapter_id_fk: number;
  chapter_label: string;
  chapter_description: string | null;
  fiscal_year: number;
  amount: number | null;
  spent: number;
  remaining: number | null;
  supplier_id_fk: number | null;
  supplier_name: string | null;
  contract_ids: number[];
  notes: string | null;
  deleted: boolean;
}

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

// Speso = righe di fattura assegnate, fatture non cancellate e non rifiutate.
const ROWS_SQL = (where: string) => `/* c_rows */ SELECT bc.id, bc.commitment_year, bc.commitment_num,
    bc.commitment_sub, bc.budget_chapter_id_fk, CONCAT(ch.chapter_code, '/', ch.article) AS chapter_label,
    ch.description AS chapter_description, bc.fiscal_year, bc.amount, bc.supplier_id_fk,
    COALESCE(tp.company_name, TRIM(CONCAT(COALESCE(tp.last_name, ''), ' ', COALESCE(tp.first_name, '')))) AS supplier_name,
    bc.notes, bc.deleted,
    (SELECT GROUP_CONCAT(bcc.contract_id ORDER BY bcc.contract_id) FROM budget_commitment_contracts bcc
      WHERE bcc.commitment_id = bc.id) AS contract_ids,
    (SELECT COALESCE(SUM(il.amount), 0) FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
      WHERE il.commitment_id_fk = bc.id) AS spent
  FROM budget_commitments bc
  JOIN budget_chapters ch ON ch.id = bc.budget_chapter_id_fk
  LEFT JOIN third_parties tp ON tp.id = bc.supplier_id_fk
  WHERE ${where}
  ORDER BY bc.fiscal_year DESC, bc.commitment_num IS NULL, bc.commitment_year, bc.commitment_num, bc.commitment_sub, bc.id`;

const MANUAL_LINES_SQL =
  '/* c_manual */ SELECT COUNT(*) AS n FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 ' +
  'WHERE il.commitment_id_fk = ? AND il.commitment_auto = 0';

const LINES_SQL = `/* c_lines */ SELECT il.id AS line_id, i.id AS invoice_id, i.invoice_id AS invoice_number,
    i.invoice_date, il.period_start, il.period_end, il.utility_id_fk AS utility_id, u.utility_id AS utility_code,
    il.amount, il.commitment_auto AS auto
  FROM invoice_lines il
  JOIN invoices i ON i.id = il.invoice_id_fk AND i.deleted = 0 AND ${NOT_REJECTED_SQL('i')}
  LEFT JOIN utilities u ON u.id = il.utility_id_fk
  WHERE il.commitment_id_fk = ?
  ORDER BY i.invoice_date, i.id, il.id`;

const day = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
};

function toRow(r: Record<string, unknown>): CommitmentRow {
  const amount = toNumber(r.amount);
  const spent = round2(Number(r.spent ?? 0));
  return {
    id: Number(r.id),
    commitment_year: toNumber(r.commitment_year),
    commitment_num: toNumber(r.commitment_num),
    commitment_sub: toNumber(r.commitment_sub),
    label: commitmentLabel(toNumber(r.commitment_year), toNumber(r.commitment_num), toNumber(r.commitment_sub)),
    budget_chapter_id_fk: Number(r.budget_chapter_id_fk),
    chapter_label: String(r.chapter_label ?? ''),
    chapter_description: (r.chapter_description as string | null) ?? null,
    fiscal_year: Number(r.fiscal_year),
    amount,
    spent,
    remaining: amount === null ? null : round2(amount - spent),
    supplier_id_fk: toNumber(r.supplier_id_fk),
    supplier_name: (r.supplier_name as string | null) || null,
    contract_ids: r.contract_ids ? String(r.contract_ids).split(',').map(Number) : [],
    notes: (r.notes as string | null) ?? null,
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
  protected readonly relations = ['budgetChapter', 'contracts', 'supplier', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetCommitment)
    protected readonly repo: Repository<BudgetCommitment>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @InjectRepository(BudgetChapter)
    private readonly chapterRepo: Repository<BudgetChapter>,
    private readonly reconcile: CommitmentReconcileService,
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
    if (search.fiscal_year) add('bc.fiscal_year = ?', search.fiscal_year);
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
    const rows: Record<string, unknown>[] = await this.repo.query(ROWS_SQL(where.join(' AND ')), params);
    return rows.map(toRow);
  }

  async getRow(id: number): Promise<CommitmentRow> {
    const rows: Record<string, unknown>[] = await this.repo.query(ROWS_SQL('bc.id = ?'), [id]);
    if (!rows.length) throw new BadRequestException('Impegno non trovato');
    return toRow(rows[0]);
  }

  async lines(id: number): Promise<CommitmentLine[]> {
    const rows: Record<string, unknown>[] = await this.repo.query(LINES_SQL, [id]);
    let progressive = 0;
    return rows.map((r) => {
      progressive = round2(progressive + Number(r.amount));
      return {
        line_id: Number(r.line_id),
        invoice_id: Number(r.invoice_id),
        invoice_number: String(r.invoice_number ?? ''),
        invoice_date: day(r.invoice_date) ?? '',
        period_start: day(r.period_start),
        period_end: day(r.period_end),
        utility_id: toNumber(r.utility_id),
        utility_code: (r.utility_code as string | null) ?? null,
        amount: Number(r.amount),
        auto: Number(r.auto) === 1,
        progressive,
      };
    });
  }

  async createForContract(contractId: number, dto: CreateBudgetCommitmentDto, userId: number): Promise<CommitmentRow> {
    const saved = await this.create({ ...dto, contract_ids: [...new Set([contractId, ...(dto.contract_ids ?? [])])] }, userId);
    return this.getRow(saved.id);
  }

  async create(dto: CreateBudgetCommitmentDto, userId?: number): Promise<BudgetCommitment> {
    const number = this.number(dto);
    await this.ensureChapter(dto.budget_chapter_id_fk);
    await this.ensureFreeNumber(number);
    const contracts = await this.contracts(dto.contract_ids ?? []);
    const fields: Partial<CreateBudgetCommitmentDto> = { ...dto };
    delete fields.contract_ids;
    const item = this.repo.create({
      ...fields,
      ...number,
      contracts,
      created_by_user_id: userId,
      updated_by_user_id: userId,
    } as never);
    const saved = (await this.repo.save(item)) as unknown as BudgetCommitment;
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    await this.reconcile.reconcileSafe(contracts.map((c) => c.id));
    return saved;
  }

  async update(id: number, dto: UpdateBudgetCommitmentDto, userId?: number): Promise<BudgetCommitment> {
    if (dto.deleted === false) return this.restore(id, userId);
    delete dto.deleted;
    delete dto.updated_by_user_id;
    const current = await this.repo.findOne({ where: { id, deleted: false }, relations: { contracts: true } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const merged = { ...current, ...dto };
    const number = this.number(merged);
    if (dto.budget_chapter_id_fk !== undefined) await this.ensureChapter(merged.budget_chapter_id_fk);
    await this.ensureFreeNumber(number, id);
    const before = (current.contracts ?? []).map((c) => c.id);
    const { contract_ids, ...fields } = dto;
    const changes: { fieldName: string; oldValue: unknown; newValue: unknown }[] = [];
    if (contract_ids !== undefined) {
      const contracts = await this.contracts(contract_ids);
      const after = contracts.map((c) => c.id);
      if (before.join(',') !== [...after].sort((a, b) => a - b).join(',')) {
        changes.push({ fieldName: 'contract_ids', oldValue: before.join(', '), newValue: after.join(', ') });
      }
      current.contracts = contracts;
      await this.repo.save(current);
    }
    const result = await super.update(id, { ...fields, ...number } as UpdateBudgetCommitmentDto, userId);
    if (changes.length) await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    await this.reconcile.reconcileSafe([...new Set([...before, ...(contract_ids ?? before)])]);
    return result;
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

  // Le righe assegnate in automatico si riassegnano; quelle scelte a mano
  // bloccano (sparirebbe la scelta dell'utente).
  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false }, relations: { contracts: true } });
    if (!current) throw new BadRequestException('Impegno non trovato');
    const [{ n }] = await this.repo.query(MANUAL_LINES_SQL, [id]);
    if (Number(n) > 0) throw new BadRequestException(`Impegno scelto a mano su ${Number(n)} righe fattura`);
    current.deleted = true;
    current.updated_by_user_id = userId;
    await this.repo.save(current);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
    await this.reconcile.reconcileSafe((current.contracts ?? []).map((c) => c.id));
  }

  private number(dto: {
    commitment_year?: number | null;
    commitment_num?: number | null;
    commitment_sub?: number | null;
  }): { commitment_year: number | null; commitment_num: number | null; commitment_sub: number | null } {
    const year = dto.commitment_year ?? null;
    const num = dto.commitment_num ?? null;
    if ((year === null) !== (num === null)) {
      throw new BadRequestException('Anno e numero dell’impegno vanno indicati insieme');
    }
    return { commitment_year: year, commitment_num: num, commitment_sub: num === null ? null : (dto.commitment_sub ?? 1) };
  }

  private async ensureChapter(chapterId: number): Promise<void> {
    const chapter = await this.chapterRepo.findOne({ where: { id: chapterId, deleted: false } });
    if (!chapter) throw new BadRequestException('Capitolo non trovato');
  }

  // Unico tra i non cancellati (nel service, non UNIQUE: le cancellate restano).
  private async ensureFreeNumber(
    n: { commitment_year: number | null; commitment_num: number | null; commitment_sub: number | null },
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

  private async contracts(ids: number[]): Promise<Contract[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const found = await this.contractRepo.find({ where: { id: In(unique), deleted: false } });
    if (found.length !== unique.length) throw new BadRequestException('Contratto non trovato');
    return unique.map((id) => found.find((c) => c.id === id)!);
  }
}
