import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Invoice } from './entity/invoice.entity';
import { InvoiceLine } from './entity/invoice-line.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SearchInvoiceDto } from './dto/search-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { BudgetCommitment } from '@apis/budget-commitments/entity/budget-commitment.entity';

// Confronto righe per l'audit: stessi valori normalizzati, stesso ordine.
const lineKey = (l: Partial<InvoiceLine>): string =>
  JSON.stringify([
    Number(l.amount).toFixed(2),
    l.utility_id_fk ?? null,
    l.commitment_id_fk ?? null,
    l.period_start ? String(l.period_start).slice(0, 10) : null,
    l.period_end ? String(l.period_end).slice(0, 10) : null,
    l.consumption === null || l.consumption === undefined ? null : Number(l.consumption).toFixed(3),
    l.supply_code ?? null,
    l.description ?? null,
  ]);
const sameLines = (a: Partial<InvoiceLine>[], b: Partial<InvoiceLine>[]): boolean =>
  a.length === b.length && a.every((l, i) => lineKey(l) === lineKey(b[i]));

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
  ) {
    super();
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
      this.applyFilters(qb, filters, 'Invoice', [
        'deleted',
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
    return saved;
  }

  async update(id: number, updateDto: UpdateInvoiceDto, userId?: number): Promise<Invoice> {
    const { lines, ...rest } = updateDto;
    const before = await this.repo.findOne({ where: { id } as never });
    if (!before) throw new BadRequestException('Fattura non trovata');
    const beforeSnapshot: Record<string, unknown> = { ...before };
    const contractId =
      rest.contratto_id_fk !== undefined ? rest.contratto_id_fk : before.contratto_id_fk;
    const header = await this.withSupplier({ ...rest, contratto_id_fk: contractId });
    let previousLines: InvoiceLine[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      if (lines !== undefined) {
        await this.checkLines(manager, lines, contractId ?? null);
        previousLines = await manager.find(InvoiceLine, { where: { invoice_id_fk: id } });
      }
      const entity = await manager.findOne(Invoice, { where: { id } });
      Object.assign(entity, header);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(Invoice, entity);
      if (lines !== undefined) {
        await manager.delete(InvoiceLine, { invoice_id_fk: id });
        if (lines.length) await manager.save(InvoiceLine, this.toRows(id, lines));
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
    const ids = [...new Set(lines.map((l) => l.commitment_id_fk).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const found = await manager.find(BudgetCommitment, { where: { id: In(ids), deleted: false } });
    lines.forEach((l, i) => {
      if (!l.commitment_id_fk) return;
      const c = found.find((f) => f.id === l.commitment_id_fk);
      if (!c) throw new BadRequestException(`L'impegno della riga ${i + 1} non esiste`);
      if (contractId && c.contract_id_fk !== contractId) {
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
      commitment_id_fk: l.commitment_id_fk ?? null,
      period_start: l.period_start ?? null,
      period_end: l.period_end ?? null,
      consumption: l.consumption ?? null,
      supply_code: l.supply_code?.trim() || null,
      description: l.description?.trim() || null,
    }));
  }
}
