import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { Invoice } from './entity/invoice.entity';
import { NOT_REJECTED_SQL, SDI_STATUS_NONE } from './sdi-status';
import { InvoiceLine } from './entity/invoice-line.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SearchInvoiceDto } from './dto/search-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';
import { SdiMessage } from '@apis/invoice-import/entity/sdi-message.entity';
import { ConsumptionLinker } from '@apis/invoice-import/consumption-linker.service';
import { ConsumptionRecalcService } from '@apis/utility-consumptions/consumption-recalc.service';
import { CommitmentReconcileService } from '@apis/budget-commitments/commitment-reconcile.service';
import { annualityFor } from '@apis/budget-commitments/annuality';
import { commitmentLabel } from '@apis/budget-commitments/commitment-label';
import { invoiceCompetenceYear } from '@apis/spending/line-year';
import { dbDay } from '@/helpers/date.helpers';
import { InvoiceCommitmentShare } from './entity/invoice-commitment-share.entity';
import { CommitmentShareSource } from './entity/commitment-share-source.enum';
import { InvoiceCommitmentShareDto } from './dto/invoice-commitment-share.dto';

// Confronto righe per l'audit: stessi valori normalizzati, stesso ordine.
const lineKey = (l: Partial<InvoiceLine>): string =>
  JSON.stringify([
    Number(l.amount).toFixed(2),
    l.utility_id_fk ?? null,
    l.period_start ? String(l.period_start).slice(0, 10) : null,
    l.period_end ? String(l.period_end).slice(0, 10) : null,
    l.consumption === null || l.consumption === undefined ? null : Number(l.consumption).toFixed(3),
    l.supply_code ?? null,
    l.description ?? null,
  ]);
const sameLines = (a: Partial<InvoiceLine>[], b: Partial<InvoiceLine>[]): boolean =>
  a.length === b.length && a.every((l, i) => lineKey(l) === lineKey(b[i]));

// Confronto quote per l'audit: l'ordine non conta.
type ShareRow = Pick<InvoiceCommitmentShare, 'commitment_id_fk' | 'fiscal_year' | 'amount'>;
const sharesKey = (shares: ShareRow[]): string =>
  JSON.stringify(
    shares
      .map((s) => [Number(s.commitment_id_fk), Number(s.fiscal_year), Number(s.amount).toFixed(2)])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );

// Colonne della testata nell'elenco fatture (findList).
const LIST_FIELDS = [
  'id',
  'invoice_id',
  'invoice_date',
  'protocol_number',
  'net_amount_excl_vat',
  'total_amount',
  'supplier_id_fk',
  'last_invoice_arrears',
  'notes_on_invoices',
  'update_date',
  'source',
  'sdi_identifier',
  'sdi_status',
  'sdi_outcome_discarded',
  'contratto_id_fk',
  'payment_status',
  'paid_on',
] as const;

const PARTY_FIELDS = ['id', 'type', 'company_name', 'last_name', 'first_name'] as const;

// Aggregati delle righe e capitoli dalle quote, per fattura (elenco leggero).
const LINES_AGG_SQL =
  'SELECT invoice_id_fk AS id, COUNT(DISTINCT utility_id_fk) AS utilities, SUM(amount) AS total, ' +
  'MIN(period_start) AS period_start, MAX(period_end) AS period_end, ' +
  "GROUP_CONCAT(DISTINCT supply_code SEPARATOR ' ') AS supply_codes FROM invoice_lines GROUP BY invoice_id_fk";
const CHAPTERS_AGG_SQL =
  "SELECT s.invoice_id_fk AS id, GROUP_CONCAT(DISTINCT CONCAT(c.chapter_code, '/', COALESCE(c.article, 0)) " +
  "ORDER BY c.chapter_code, c.article SEPARATOR ', ') AS chapters FROM invoice_commitment_shares s " +
  'JOIN budget_commitments b ON b.id = s.commitment_id_fk ' +
  'JOIN budget_chapters c ON c.id = b.budget_chapter_id_fk GROUP BY s.invoice_id_fk';

export interface InvoicePayment {
  liquidation_number: string | null;
  commitment: string;
  amount: number;
  mandate_number: string | null;
  mandate_date: string | null;
  paid_date: string | null;
  paid_amount: number | null;
}

export type InvoiceListRow = Invoice & {
  utilities_count: number;
  lines_total: number | null;
  period_start: string | null;
  period_end: string | null;
  chapters: string;
  supply_codes: string;
};

const OTHER_CONTRACT_SHARES =
  "Le quote d'impegno sono di un altro contratto: aggiornale nel tab Impegni";

// Competenza della fattura: periodo complessivo delle righe, altrimenti data fattura.
function invoiceFiscalYear(
  lines: { period_start?: unknown; period_end?: unknown }[],
  invoiceDate: unknown,
): number {
  return invoiceCompetenceYear(
    lines.map((l) => ({ period_start: dbDay(l.period_start), period_end: dbDay(l.period_end) })),
    dbDay(invoiceDate) ?? '',
  );
}

// Nota di credito = totale documento negativo: solo lì l'imponibile può
// essere negativo. Le decimal arrivano da mysql2 come stringa.
function checkCreditNote(total: unknown, net: unknown): void {
  const isSet = (v: unknown) => v !== null && v !== undefined && v !== '';
  if (isSet(net) && Number(net) < 0 && !(isSet(total) && Number(total) < 0)) {
    throw new BadRequestException(
      "L'imponibile può essere negativo solo in una nota di credito (totale documento negativo).",
    );
  }
}

@Injectable()
export class InvoicesService extends BaseService<Invoice, CreateInvoiceDto, UpdateInvoiceDto> {
  protected readonly entityName = 'Invoice';
  protected readonly relations = [
    'contratto',
    'contratto.supplier',
    'supplier',
    'lines',
    'lines.utility',
    'lines.utility.utilityType',
    'commitmentShares',
    'commitmentShares.commitment',
    'commitmentShares.commitment.budgetChapter',
    'created_by',
    'updated_by',
  ];

  constructor(
    @InjectRepository(Invoice)
    protected readonly repo: Repository<Invoice>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    private readonly dataSource: DataSource,
    private readonly linker: ConsumptionLinker,
    private readonly recalc: ConsumptionRecalcService,
    private readonly reconcile: CommitmentReconcileService,
  ) {
    super();
  }

  // Eliminata la fattura, i suoi consumi da fattura non contano più.
  override async remove(id: number, updatedByUserId: number): Promise<void> {
    const before = await this.repo.findOne({ where: { id } as never });
    await super.remove(id, updatedByUserId);
    const utilityIds = await this.dataSource.transaction((manager) =>
      this.linker.unlink(manager, id),
    );
    await this.recalcUtilities(utilityIds);
    await this.reconcileContracts(before?.contratto_id_fk);
  }

  // Consumo degli impegni: le righe automatiche seguono fattura e contratto.
  private async reconcileContracts(...ids: (number | null | undefined)[]): Promise<void> {
    const contracts = [...new Set(ids.filter((id): id is number => !!id))];
    if (contracts.length) await this.reconcile.reconcileSafe(contracts);
  }

  private async recalcUtilities(utilityIds: number[]): Promise<void> {
    for (const utilityId of utilityIds) {
      try {
        await this.recalc.recalcUtility(utilityId);
      } catch (error) {
        console.error(
          `[InvoicesService] Ricalcolo consumi dell'utenza ${utilityId} non riuscito`,
          error,
        );
      }
    }
  }

  async findAll(filters?: Partial<SearchInvoiceDto>): Promise<Invoice[]> {
    const qb = this.repo.createQueryBuilder('Invoice');
    qb.leftJoinAndSelect('Invoice.contratto', 'contratto', 'contratto.deleted = 0');
    qb.leftJoinAndSelect('contratto.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('Invoice.supplier', 'invoiceSupplier');
    qb.leftJoinAndSelect('Invoice.lines', 'lines');
    qb.leftJoinAndSelect('Invoice.commitmentShares', 'commitmentShares');
    qb.leftJoinAndSelect('commitmentShares.commitment', 'shareCommitment');
    qb.leftJoinAndSelect('shareCommitment.budgetChapter', 'commitmentChapter');
    this.applySearch(qb, filters);
    return qb.getMany();
  }

  // Liquidazioni della fattura dalla contabilità (passo payments), per la scheda.
  async findPayments(id: number): Promise<InvoicePayment[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      'SELECT liquidation_number, commitment_year, commitment_num, commitment_sub, amount, mandate_number, ' +
        "DATE_FORMAT(mandate_date, '%Y-%m-%d') AS mandate_date, DATE_FORMAT(paid_date, '%Y-%m-%d') AS paid_date, " +
        'paid_amount FROM acc_liquidations WHERE invoice_id_fk = ? AND cancelled = 0 ' +
        'ORDER BY liquidation_number, id',
      [id],
    );
    return rows.map((r) => ({
      liquidation_number: (r.liquidation_number as string | null) ?? null,
      commitment: commitmentLabel(
        Number(r.commitment_year),
        Number(r.commitment_num),
        Number(r.commitment_sub),
      ),
      amount: Number(r.amount),
      mandate_number: (r.mandate_number as string | null) ?? null,
      mandate_date: (r.mandate_date as string | null) ?? null,
      paid_date: (r.paid_date as string | null) ?? null,
      paid_amount: r.paid_amount === null ? null : Number(r.paid_amount),
    }));
  }

  // Elenco fatture: testata, contratto e nome del fornitore, senza righe né
  // quote (con migliaia di fatture la risposta completa pesava decine di MB).
  // Capitoli, utenze, totale e periodo delle righe li calcola il server; la
  // scheda ricarica la fattura completa con findOne.
  async findList(filters?: Partial<SearchInvoiceDto>): Promise<InvoiceListRow[]> {
    const party = (alias: string) => PARTY_FIELDS.map((f) => `${alias}.${f} AS ${alias}_${f}`);
    // Una sola query con righe grezze: le entità TypeORM di migliaia di fatture
    // costavano più della query stessa.
    const qb = this.repo.createQueryBuilder('Invoice');
    qb.leftJoin('Invoice.contratto', 'contratto', 'contratto.deleted = 0');
    qb.leftJoin('contratto.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoin('Invoice.supplier', 'invoiceSupplier');
    qb.leftJoin(`(${LINES_AGG_SQL})`, 'agg', 'agg.id = Invoice.id');
    qb.leftJoin(`(${CHAPTERS_AGG_SQL})`, 'chap', 'chap.id = Invoice.id');
    qb.select([
      ...LIST_FIELDS.map((f) => `Invoice.${f} AS ${f}`),
      'contratto.id AS contratto_id',
      'contratto.cig_contract AS contratto_cig_contract',
      ...party('supplier'),
      ...party('invoiceSupplier'),
      'agg.utilities AS agg_utilities',
      'agg.total AS agg_total',
      'agg.period_start AS agg_period_start',
      'agg.period_end AS agg_period_end',
      'agg.supply_codes AS agg_supply_codes',
      'chap.chapters AS chap_chapters',
    ]);
    this.applySearch(qb, filters);
    const rows: Record<string, unknown>[] = await qb.getRawMany();
    return rows.map((r) => {
      const pick = (alias: string) =>
        r[`${alias}_id`] == null
          ? null
          : Object.fromEntries(PARTY_FIELDS.map((f) => [f, r[`${alias}_${f}`]]));
      const invoice = Object.fromEntries(LIST_FIELDS.map((f) => [f, r[f]])) as Record<
        string,
        unknown
      >;
      return {
        ...invoice,
        invoice_date: dbDay(r.invoice_date),
        paid_on: dbDay(r.paid_on),
        sdi_outcome_discarded: !!Number(r.sdi_outcome_discarded),
        contratto:
          r.contratto_id == null
            ? null
            : {
                id: Number(r.contratto_id),
                cig_contract: r.contratto_cig_contract,
                supplier: pick('supplier'),
              },
        supplier: pick('invoiceSupplier'),
        utilities_count: Number(r.agg_utilities ?? 0),
        lines_total: r.agg_total == null ? null : Number(r.agg_total),
        period_start: dbDay(r.agg_period_start),
        period_end: dbDay(r.agg_period_end),
        chapters: String(r.chap_chapters ?? ''),
        // Per la ricerca libera dell'elenco (un POD trova le sue fatture).
        supply_codes: String(r.agg_supply_codes ?? ''),
      } as unknown as InvoiceListRow;
    });
  }

  private applySearch(qb: SelectQueryBuilder<Invoice>, filters?: Partial<SearchInvoiceDto>): void {
    if (filters?.deleted !== undefined && filters.deleted !== null) {
      const deletedValue = filters.deleted.toString();
      qb.where('Invoice.deleted = :deleted_filter', {
        deleted_filter: deletedValue === 'true' || deletedValue === '1' ? 1 : 0,
      });
    } else {
      qb.where('Invoice.deleted = :deleted_default', { deleted_default: 0 });
    }

    if (filters) {
      // Filtri sulle righe con EXISTS: un join filtrato toglierebbe dalla
      // risposta le altre righe della stessa fattura.
      if (filters.utility_id) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM invoice_lines fl WHERE fl.invoice_id_fk = Invoice.id AND fl.utility_id_fk = :utilityId)',
          { utilityId: filters.utility_id },
        );
      }
      if (filters.budget_chapter_ids && filters.budget_chapter_ids.length > 0) {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM invoice_commitment_shares fs JOIN budget_commitments fc ON fc.id = fs.commitment_id_fk WHERE fs.invoice_id_fk = Invoice.id AND fc.budget_chapter_id_fk IN (:...chapterIds))',
          { chapterIds: filters.budget_chapter_ids },
        );
      }
      if (filters.supplier_id_fk) {
        qb.andWhere('Invoice.supplier_id_fk = :supplierId', {
          supplierId: filters.supplier_id_fk,
        });
      }
      if (filters.invoice_date_from) {
        qb.andWhere('Invoice.invoice_date >= :invoice_date_from', {
          invoice_date_from: filters.invoice_date_from,
        });
      }
      if (filters.invoice_date_to) {
        qb.andWhere('Invoice.invoice_date <= :invoice_date_to', {
          invoice_date_to: filters.invoice_date_to,
        });
      }
      if (filters.sdi_status === SDI_STATUS_NONE) {
        qb.andWhere('Invoice.sdi_status IS NULL');
      } else if (filters.sdi_status) {
        qb.andWhere('Invoice.sdi_status = :sdiStatus', { sdiStatus: filters.sdi_status });
      }
      if (filters.payment_status)
        qb.andWhere('Invoice.payment_status = :paymentStatus', {
          paymentStatus: filters.payment_status,
        });
      this.applyFilters(qb, filters, 'Invoice', [
        'deleted',
        'sdi_status',
        'payment_status',
        'utility_id',
        'supplier_id_fk',
        'budget_chapter_ids',
        'invoice_date_from',
        'invoice_date_to',
        'orderBy',
        'orderDirection',
      ]);
    }

    const orderByField = filters?.orderBy || 'id';
    const orderDirection = filters?.orderDirection || 'ASC';
    qb.orderBy(`Invoice.${orderByField}`, orderDirection.toUpperCase() as 'ASC' | 'DESC');
  }

  async create(dto: CreateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, commitment_shares: shares, ...rest } = dto;
    checkCreditNote(rest.total_amount, rest.net_amount_excl_vat);
    const header = await this.withSupplier(rest);
    const saved = await this.dataSource.transaction(async (manager) => {
      if (lines?.length) this.checkLines(lines);
      const shareRows = shares?.length
        ? await this.checkShares(manager, shares, header.contratto_id_fk ?? null, () =>
            invoiceFiscalYear(lines ?? [], rest.invoice_date),
          )
        : [];
      const entity = manager.create(Invoice, {
        ...header,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      } as never);
      const savedEntity = await manager.save(Invoice, entity);
      if (lines?.length) await manager.save(InvoiceLine, this.toRows(savedEntity.id, lines));
      if (shareRows.length) await this.saveShares(manager, savedEntity.id, shareRows);
      return manager.findOne(Invoice, {
        where: { id: savedEntity.id },
        relations: toFindOptionsRelations<Invoice>(this.relations),
      });
    });
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    await this.reconcileContracts(header.contratto_id_fk);
    return saved;
  }

  async update(id: number, updateDto: UpdateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, commitment_shares: shares, ...rest } = updateDto;
    const before = await this.repo.findOne({ where: { id } as never });
    if (!before) throw new BadRequestException('Fattura non trovata');
    checkCreditNote(
      rest.total_amount !== undefined ? rest.total_amount : before.total_amount,
      rest.net_amount_excl_vat !== undefined
        ? rest.net_amount_excl_vat
        : before.net_amount_excl_vat,
    );
    const beforeSnapshot: Record<string, unknown> = { ...before };
    const contractId =
      rest.contratto_id_fk !== undefined ? rest.contratto_id_fk : before.contratto_id_fk;
    const contractChanged = (contractId ?? null) !== (before.contratto_id_fk ?? null);
    const header = await this.withSupplier({ ...rest, contratto_id_fk: contractId });
    let previousLines: InvoiceLine[] = [];
    let previousShares: InvoiceCommitmentShare[] = [];
    let shareRows: ShareRow[] = [];
    let utilityIds: number[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      if (lines !== undefined) {
        this.checkLines(lines);
        previousLines = await manager.find(InvoiceLine, { where: { invoice_id_fk: id } });
      }
      if (
        shares !== undefined &&
        (await manager.count(InvoiceCommitmentShare, {
          where: { invoice_id_fk: id, source: CommitmentShareSource.ACCOUNTING },
        }))
      ) {
        throw new BadRequestException('Le quote della ragioneria non si modificano.');
      }
      if (shares !== undefined || contractChanged) {
        previousShares = await manager.find(InvoiceCommitmentShare, {
          where: { invoice_id_fk: id, source: CommitmentShareSource.MANUAL },
        });
      }
      if (shares?.length) {
        shareRows = await this.checkShares(manager, shares, contractId ?? null, async () =>
          invoiceFiscalYear(
            lines ?? (await manager.find(InvoiceLine, { where: { invoice_id_fk: id } })),
            rest.invoice_date ?? before.invoice_date,
          ),
        );
      } else if (shares === undefined && contractChanged && previousShares.length) {
        // Contratto cambiato senza reinviare le quote: quelle a mano devono
        // restare coerenti col nuovo contratto.
        await this.checkKeptShares(manager, previousShares, contractId ?? null);
      }
      const entity = await manager.findOne(Invoice, { where: { id } });
      Object.assign(entity, header);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      // Fattura nata o arricchita dall'import: dopo una modifica a mano non si rielabora.
      if (await manager.count(SdiMessage, { where: { invoice_id_fk: id } })) {
        entity.import_locked = true;
      }
      await manager.save(Invoice, entity);
      if (lines !== undefined) {
        await manager.delete(InvoiceLine, { invoice_id_fk: id });
        if (lines.length) await manager.save(InvoiceLine, this.toRows(id, lines));
        utilityIds = await this.linker.follow(manager, id, previousLines);
      }
      if (shares !== undefined) {
        // Mai quote miste: le quote a mano sostituiscono anche l'automatica;
        // [] toglie quelle a mano e l'automatica la rimette il ricalcolo.
        await manager.delete(
          InvoiceCommitmentShare,
          shareRows.length
            ? {
                invoice_id_fk: id,
                source: In([CommitmentShareSource.AUTO, CommitmentShareSource.MANUAL]),
              }
            : { invoice_id_fk: id, source: CommitmentShareSource.MANUAL },
        );
        if (shareRows.length) await this.saveShares(manager, id, shareRows);
      }
      return manager.findOne(Invoice, {
        where: { id },
        relations: toFindOptionsRelations<Invoice>(this.relations),
      });
    });

    try {
      const changes = await this.diffFields(
        beforeSnapshot,
        result as unknown as Record<string, unknown>,
        rest as Record<string, unknown>,
      );
      // Righe reinviate identiche (Salva senza modifiche) non sono un cambiamento.
      if (lines !== undefined && !sameLines(previousLines, this.toRows(id, lines))) {
        changes.push({
          fieldName: 'lines',
          oldValue: previousLines.length,
          newValue: lines.length,
        });
      }
      if (shares !== undefined && sharesKey(previousShares) !== sharesKey(shareRows)) {
        changes.push({
          fieldName: 'commitment_shares',
          oldValue: previousShares.length,
          newValue: shareRows.length,
        });
      }
      await this.recordAudit(AuditAction.UPDATE, id, userId ?? result.updated_by_user_id, changes);
    } catch (error) {
      console.error(`[InvoicesService] Errore durante il calcolo/registrazione audit`, error);
    }
    await this.recalcUtilities(utilityIds);
    await this.reconcileContracts(before.contratto_id_fk, contractId);
    return result;
  }

  // Costi del mese corrente per la dashboard: totale documento se c'è,
  // altrimenti imponibile (fatture inserite prima del totale documento).
  async getMonthlyCosts(): Promise<number> {
    const now = new Date();
    const row = await this.repo
      .createQueryBuilder('Invoice')
      .select('SUM(COALESCE(Invoice.total_amount, Invoice.net_amount_excl_vat))', 'total')
      .where('Invoice.deleted = :deleted', { deleted: false })
      .andWhere('MONTH(Invoice.invoice_date) = :month', { month: now.getMonth() + 1 })
      .andWhere('YEAR(Invoice.invoice_date) = :year', { year: now.getFullYear() })
      .andWhere(NOT_REJECTED_SQL('Invoice'))
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  // Fornitore assente: dal contratto, se c'è.
  private async withSupplier<
    T extends { supplier_id_fk?: number | null; contratto_id_fk?: number | null },
  >(header: T): Promise<T> {
    if (header.supplier_id_fk || !header.contratto_id_fk) return header;
    const contract = await this.contractRepo.findOne({ where: { id: header.contratto_id_fk } });
    return contract?.supplier_id_fk
      ? { ...header, supplier_id_fk: contract.supplier_id_fk }
      : header;
  }

  private checkLines(lines: InvoiceLineDto[]): void {
    lines.forEach((l, i) => {
      if (l.period_start && l.period_end && l.period_end < l.period_start) {
        throw new BadRequestException(`Riga ${i + 1}: la fine del periodo è prima dell’inizio`);
      }
    });
  }

  // Quote a mano: impegno del contratto della fattura, esercizio tra le sue
  // annualità (assente = annualità per la competenza della fattura).
  private async checkShares(
    manager: EntityManager,
    shares: InvoiceCommitmentShareDto[],
    contractId: number | null,
    competence: () => number | Promise<number>,
  ): Promise<ShareRow[]> {
    // Senza contratto l'impegno non ha un contratto con cui essere coerente.
    if (!contractId) {
      throw new BadRequestException("Le quote d'impegno richiedono un contratto sulla fattura");
    }
    const ids = [...new Set(shares.map((s) => s.commitment_id_fk))];
    const found = await manager.find(BudgetCommitment, {
      where: { id: In(ids), deleted: false },
      relations: { contracts: true, years: true },
    });
    const year = shares.some((s) => s.fiscal_year === null || s.fiscal_year === undefined)
      ? await competence()
      : null;
    return shares.map((s, i) => {
      const c = found.find((f) => f.id === s.commitment_id_fk);
      if (!c) throw new BadRequestException(`L'impegno della quota ${i + 1} non esiste`);
      if (!(c.contracts ?? []).some((k) => k.id === contractId)) {
        throw new BadRequestException(
          `L'impegno della quota ${i + 1} non è del contratto della fattura`,
        );
      }
      const years = (c.years ?? []).map((y) => Number(y.fiscal_year));
      const label = commitmentLabel(c.commitment_year, c.commitment_num, c.commitment_sub);
      const name = label === '—' ? `della quota ${i + 1}` : label;
      const fiscalYear = s.fiscal_year ?? annualityFor(years, year!);
      if (fiscalYear === null) throw new BadRequestException(`L'impegno ${name} non ha annualità`);
      if (!years.includes(fiscalYear)) {
        throw new BadRequestException(`L'impegno ${name} non ha l'esercizio ${fiscalYear}`);
      }
      return { commitment_id_fk: c.id, fiscal_year: fiscalYear, amount: Number(s.amount) };
    });
  }

  // Quote a mano rimaste: tutte su impegni del (nuovo) contratto della fattura.
  private async checkKeptShares(
    manager: EntityManager,
    shares: InvoiceCommitmentShare[],
    contractId: number | null,
  ): Promise<void> {
    const ids = [...new Set(shares.map((s) => s.commitment_id_fk))];
    const found = contractId
      ? await manager.find(BudgetCommitment, {
          where: { id: In(ids) },
          relations: { contracts: true },
        })
      : [];
    const ok = ids.every((id) =>
      (found.find((c) => c.id === id)?.contracts ?? []).some((k) => k.id === contractId),
    );
    if (!ok) throw new BadRequestException(OTHER_CONTRACT_SHARES);
  }

  private async saveShares(
    manager: EntityManager,
    invoiceId: number,
    rows: ShareRow[],
  ): Promise<void> {
    await manager.save(
      InvoiceCommitmentShare,
      rows.map((r) => ({ invoice_id_fk: invoiceId, ...r, source: CommitmentShareSource.MANUAL })),
    );
  }

  private toRows(invoiceId: number, lines: InvoiceLineDto[]): Partial<InvoiceLine>[] {
    return lines.map((l) => ({
      invoice_id_fk: invoiceId,
      amount: l.amount,
      utility_id_fk: l.utility_id_fk ?? null,
      period_start: l.period_start ?? null,
      period_end: l.period_end ?? null,
      consumption: l.consumption ?? null,
      supply_code: l.supply_code?.trim() || null,
      description: l.description?.trim() || null,
    }));
  }
}
