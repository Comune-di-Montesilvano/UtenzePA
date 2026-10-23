import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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

// Confronto righe per l'audit: stessi valori normalizzati, stesso ordine.
const lineKey = (l: Partial<InvoiceLine>): string =>
  JSON.stringify([
    Number(l.amount).toFixed(2),
    l.utility_id_fk ?? null,
    l.commitment_auto === false ? (l.commitment_id_fk ?? null) : 'auto',
    l.period_start ? String(l.period_start).slice(0, 10) : null,
    l.period_end ? String(l.period_end).slice(0, 10) : null,
    l.consumption === null || l.consumption === undefined ? null : Number(l.consumption).toFixed(3),
    l.supply_code ?? null,
    l.description ?? null,
  ]);
// Impegno automatico se dichiarato, altrimenti se la riga non ne indica uno.
const isAuto = (l: { commitment_auto?: boolean | null; commitment_id_fk?: number | null }): boolean =>
  l.commitment_auto ?? !l.commitment_id_fk;
const sameLines = (a: Partial<InvoiceLine>[], b: Partial<InvoiceLine>[]): boolean =>
  a.length === b.length && a.every((l, i) => lineKey(l) === lineKey(b[i]));

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
    'lines.commitment',
    'lines.commitment.budgetChapter',
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
    const utilityIds = await this.dataSource.transaction((manager) => this.linker.unlink(manager, id));
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
        console.error(`[InvoicesService] Ricalcolo consumi dell'utenza ${utilityId} non riuscito`, error);
      }
    }
  }

  async findAll(filters?: Partial<SearchInvoiceDto>): Promise<Invoice[]> {
    const qb = this.repo.createQueryBuilder('Invoice');
    qb.leftJoinAndSelect('Invoice.contratto', 'contratto', 'contratto.deleted = 0');
    qb.leftJoinAndSelect('contratto.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect('Invoice.supplier', 'invoiceSupplier');
    qb.leftJoinAndSelect('Invoice.lines', 'lines');
    qb.leftJoinAndSelect('lines.commitment', 'commitment');
    qb.leftJoinAndSelect('commitment.budgetChapter', 'commitmentChapter');

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
          'EXISTS (SELECT 1 FROM invoice_lines fl JOIN budget_commitments fc ON fc.id = fl.commitment_id_fk WHERE fl.invoice_id_fk = Invoice.id AND fc.budget_chapter_id_fk IN (:...chapterIds))',
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
      this.applyFilters(qb, filters, 'Invoice', [
        'deleted',
        'sdi_status',
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
    return qb.getMany();
  }

  async create(dto: CreateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, ...rest } = dto;
    checkCreditNote(rest.total_amount, rest.net_amount_excl_vat);
    const header = await this.withSupplier(rest);
    const saved = await this.dataSource.transaction(async (manager) => {
      if (lines?.length) await this.checkLines(manager, lines, header.contratto_id_fk ?? null);
      const entity = manager.create(Invoice, {
        ...header,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      } as never);
      const savedEntity = await manager.save(Invoice, entity);
      if (lines?.length) await manager.save(InvoiceLine, this.toRows(savedEntity.id, lines));
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
    const { lines, ...rest } = updateDto;
    const before = await this.repo.findOne({ where: { id } as never });
    if (!before) throw new BadRequestException('Fattura non trovata');
    checkCreditNote(
      rest.total_amount !== undefined ? rest.total_amount : before.total_amount,
      rest.net_amount_excl_vat !== undefined ? rest.net_amount_excl_vat : before.net_amount_excl_vat,
    );
    const beforeSnapshot: Record<string, unknown> = { ...before };
    const contractId =
      rest.contratto_id_fk !== undefined ? rest.contratto_id_fk : before.contratto_id_fk;
    const header = await this.withSupplier({ ...rest, contratto_id_fk: contractId });
    let previousLines: InvoiceLine[] = [];
    let utilityIds: number[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      if (lines !== undefined) {
        await this.checkLines(manager, lines, contractId ?? null);
        previousLines = await manager.find(InvoiceLine, { where: { invoice_id_fk: id } });
      } else if ((contractId ?? null) !== (before.contratto_id_fk ?? null)) {
        // Contratto cambiato senza reinviare le righe: gli impegni esistenti
        // devono restare coerenti col nuovo contratto.
        const existing = await manager.find(InvoiceLine, { where: { invoice_id_fk: id } });
        await this.checkLines(manager, existing as unknown as InvoiceLineDto[], contractId ?? null);
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
        changes.push({ fieldName: 'lines', oldValue: previousLines.length, newValue: lines.length });
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
    return contract?.supplier_id_fk ? { ...header, supplier_id_fk: contract.supplier_id_fk } : header;
  }

  private async checkLines(
    manager: EntityManager,
    lines: InvoiceLineDto[],
    contractId: number | null,
  ): Promise<void> {
    lines.forEach((l, i) => {
      if (l.period_start && l.period_end && l.period_end < l.period_start) {
        throw new BadRequestException(`Riga ${i + 1}: la fine del periodo è prima dell’inizio`);
      }
    });
    // Solo le righe con impegno scelto a mano: le automatiche le assegna il ricalcolo.
    const manual = (l: InvoiceLineDto) => !isAuto(l) && !!l.commitment_id_fk;
    const ids = [...new Set(lines.filter(manual).map((l) => l.commitment_id_fk!))];
    if (!ids.length) return;
    // Senza contratto l'impegno non ha un contratto con cui essere coerente.
    if (!contractId) {
      const i = lines.findIndex(manual);
      throw new BadRequestException(
        `La riga ${i + 1} ha un impegno ma la fattura non ha un contratto`,
      );
    }
    const found = await manager.find(BudgetCommitment, {
      where: { id: In(ids), deleted: false },
      relations: { contracts: true },
    });
    lines.forEach((l, i) => {
      if (!manual(l)) return;
      const c = found.find((f) => f.id === l.commitment_id_fk);
      if (!c) throw new BadRequestException(`L'impegno della riga ${i + 1} non esiste`);
      if (!(c.contracts ?? []).some((k) => k.id === contractId)) {
        throw new BadRequestException(
          `L'impegno della riga ${i + 1} non è del contratto della fattura`,
        );
      }
    });
  }

  private toRows(invoiceId: number, lines: InvoiceLineDto[]): Partial<InvoiceLine>[] {
    return lines.map((l) => ({
      invoice_id_fk: invoiceId,
      amount: l.amount,
      utility_id_fk: l.utility_id_fk ?? null,
      commitment_id_fk: isAuto(l) ? null : (l.commitment_id_fk ?? null),
      commitment_auto: isAuto(l),
      period_start: l.period_start ?? null,
      period_end: l.period_end ?? null,
      consumption: l.consumption ?? null,
      supply_code: l.supply_code?.trim() || null,
      description: l.description?.trim() || null,
    }));
  }
}
