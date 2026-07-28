import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice } from './entity/invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { SearchInvoiceDto } from './dto/search-invoice.dto';
import { BudgetChapter } from '../budget-chapters/entity/budgetChapter.entity';
import { BaseService } from '@apis/shared/base.service';
import { InvoiceBudgetChapter } from '@apis/invoices/entity/invoice_budget_chapter.entity';

@Injectable()
export class InvoicesService extends BaseService<Invoice, CreateInvoiceDto, UpdateInvoiceDto> {
  protected readonly entityName = 'Invoice';
  protected readonly relations = [
    'utility',
    'supplier',
    'budget_chapters',
    'created_by',
    'updated_by',
  ];

  constructor(
    @InjectRepository(Invoice)
    protected readonly repo: Repository<Invoice>,
    @InjectRepository(BudgetChapter)
    private readonly budgetChapterRepo: Repository<BudgetChapter>,
    @InjectRepository(InvoiceBudgetChapter)
    private readonly invoiceBudgetChapterRepo: Repository<InvoiceBudgetChapter>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  async findAll(filters?: Partial<SearchInvoiceDto>): Promise<Invoice[]> {
    const qb = this.repo.createQueryBuilder('Invoice');

    qb.leftJoinAndSelect('Invoice.utility', 'utility', 'utility.deleted = 0');
    qb.leftJoinAndSelect('Invoice.supplier', 'supplier', 'supplier.deleted = 0');
    qb.leftJoinAndSelect(
      'Invoice.budget_chapters',
      'budget_chapters',
      'budget_chapters.deleted = 0',
    );

    if (filters?.deleted !== undefined && filters.deleted !== null) {
      const deletedValue = filters.deleted.toString();
      qb.where('Invoice.deleted = :deleted_filter', {
        deleted_filter: deletedValue === 'true' || deletedValue === '1' ? 1 : 0,
      });
    } else {
      qb.where('Invoice.deleted = :deleted_default', { deleted_default: 0 });
    }

    if (filters) {
      if (filters.budget_chapter_ids && filters.budget_chapter_ids.length > 0) {
        qb.innerJoin(
          'Invoice.budget_chapters',
          'filtered_chapters',
          'filtered_chapters.id IN (:...chapterIds)',
          { chapterIds: filters.budget_chapter_ids },
        );
      }

      if (filters.budget_chapter_id) {
        qb.andWhere('budget_chapters.id = :chapterId', {
          chapterId: filters.budget_chapter_id,
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
        'budget_chapter_ids',
        'budget_chapter_id',
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
    const { budget_chapters, ...rest } = dto as CreateInvoiceDto & {
      budget_chapter_ids?: number[];
    };

    return this.dataSource.transaction(async (manager) => {
      const entity = manager.create(Invoice, {
        ...rest,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      });
      const saved = await manager.save(Invoice, entity);

      if (budget_chapters && budget_chapters.length > 0) {
        const rows = budget_chapters.map((budgetChapterId: number) =>
          manager.create(InvoiceBudgetChapter, {
            invoice_id: saved.id,
            budget_chapter_id: budgetChapterId,
          }),
        );
        try {
          await manager.save(InvoiceBudgetChapter, rows);
        } catch (error) {
          throw new BadRequestException(
            'Errore durante il salvataggio dei capitoli di spesa: ' +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      return manager.findOne(Invoice, {
        where: { id: saved.id },
        relations: this.relations,
      });
    });
  }

  async update(id: number, updateDto: UpdateInvoiceDto, userId?: number): Promise<Invoice> {
    const { budget_chapters, ...rest } = updateDto;

    return this.dataSource.transaction(async (manager) => {
      const entity = await this.repo.findOne({ where: { id } as never });
      if (!entity) throw new Error('elemento non trovato');
      Object.assign(entity, rest);
      if (userId !== undefined) entity.updated_by_user_id = userId;
      await manager.save(Invoice, entity);

      if (budget_chapters !== undefined) {
        await manager.delete(InvoiceBudgetChapter, { invoice_id: id });
        if (budget_chapters.length > 0) {
          const rows = budget_chapters.map((budgetChapterId) =>
            manager.create(InvoiceBudgetChapter, {
              invoice_id: id,
              budget_chapter_id: budgetChapterId,
            }),
          );
          await manager.save(InvoiceBudgetChapter, rows);
        }
      }

      return manager.findOne(Invoice, {
        where: { id },
        relations: this.relations,
      });
    });
  }

  async getMonthlyCosts(): Promise<number> {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const row = await this.repo
      .createQueryBuilder('Invoice')
      .select('SUM(Invoice.net_amount_excl_vat)', 'total_net_amount')
      .where('Invoice.deleted = :deleted', { deleted: false })
      .andWhere('MONTH(Invoice.invoice_date) = :month', { month: currentMonth })
      .andWhere('YEAR(Invoice.invoice_date) = :year', { year: currentYear })
      .getRawOne<{ total_net_amount: string }>();

    return Number(row?.total_net_amount ?? 0);
  }
}
