import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import {
  assertCanChange,
  assertCanCreate,
  changedFields,
} from '@apis/accounting-import/accounting-lock';
import { AccountingStateService } from '@apis/accounting-import/accounting-state.service';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { BudgetChapter } from './entity/budgetChapter.entity';
import { CreateBudgetChapterDto } from './dto/create-budget-chapters.dto';
import { UpdateBudgetChapterDto } from './dto/update-budget-chapters.dto';
import { UtilityType } from '@apis/utility-types/entity/utility_type.entity';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { SearchBudgetChapterDto } from '@apis/budget-chapters/dto/search-budget-chapter.dto';
import { BaseService } from '@apis/shared/base.service';
import { Utility } from '@apis/utility/entity/utility.entity';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { CONSUMPTION_UNIT } from '@apis/utility-consumptions/consumption-unit';
import { hardTypeLabel } from '@apis/utility-types/enum/hard-type-label';
import { SpendingDestination } from '@apis/spending-destinations/entity/spending-destination.entity';
import { ChapterDerivationService } from '@apis/spending-destinations/chapter-derivation.service';

export interface ChapterConsumptionSummaryRow {
  hard_type: HardTypeEnum;
  unit: string | null;
  utilities_count: number;
  estimated_sum: number;
  actual_sum: number;
}

const LIKE_FIELDS = ['chapter_code', 'description', 'pdc'];

const LOCKED_FIELDS = ['chapter_code', 'article', 'description'];

@Injectable()
export class BudgetChaptersService extends BaseService<
  BudgetChapter,
  CreateBudgetChapterDto,
  UpdateBudgetChapterDto
> {
  protected readonly entityName = 'budget_chapters';
  protected readonly relations = ['utilityTypes', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(BudgetChapter)
    protected readonly repo: Repository<BudgetChapter>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
    @Optional() private readonly accounting?: AccountingStateService,
    @Optional() private readonly chapterDerivation?: ChapterDerivationService,
  ) {
    super();
  }

  async findAll(filter?: SearchBudgetChapterDto): Promise<BudgetChapter[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.leftJoinAndSelect(`${alias}.utilityTypes`, 'utilityTypes', 'utilityTypes.deleted = 0');
    // La scheda aperta dalla riga mostra "Ultima modifica": findOne lo joina, findAll no.
    qb.leftJoinAndSelect(`${alias}.updated_by`, 'updated_by');
    qb.where(`${alias}.deleted = :deleted`, { deleted: filter?.deleted ?? false });

    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        if (key === 'deleted' || value === undefined || value === null || value === '') return;

        if (key === 'utility_type_id') {
          // EXISTS e non WHERE sul join: il capitolo restituito tiene tutti i suoi tipi.
          qb.andWhere(
            `EXISTS (SELECT 1 FROM budget_chapter_utility_types bcut WHERE bcut.budget_chapter_id = ${alias}.id AND bcut.utility_type_id = :utility_type_id)`,
            { utility_type_id: value },
          );
        } else if (LIKE_FIELDS.includes(key)) {
          qb.andWhere(`${alias}.${key} LIKE :${key}`, { [key]: `%${value}%` });
        } else {
          qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
        }
      });
    }

    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  // Destinazioni, collegamenti o capitoli cambiati: capitolo delle utenze ricalcolato.
  async create(dto: CreateBudgetChapterDto, userId?: number): Promise<BudgetChapter> {
    await this.chapterDerivation?.assertDestinationUsable(dto.spending_destination_id);
    const result = await this.createWithoutDerivation(dto, userId);
    await this.chapterDerivation?.requestAllSafe();
    return result;
  }

  private async createWithoutDerivation(
    dto: CreateBudgetChapterDto,
    userId?: number,
  ): Promise<BudgetChapter> {
    await assertCanCreate(this.accounting);
    await this.assertDestinationFree(dto, null);
    const { utility_type_ids, ...rest } = dto;
    const entity = this.repo.create({
      ...rest,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      utilityTypes: this.toTypeRefs(utility_type_ids ?? []),
    });
    let saved: BudgetChapter;
    try {
      saved = await this.repo.save(entity);
    } catch (error) {
      this.manageErrors(error, 'Errore durante la creazione del capitolo di spesa');
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return (await this.findOne(saved.id)) ?? saved;
  }

  // Destinazioni, collegamenti o capitoli cambiati: capitolo delle utenze ricalcolato.
  async update(id: number, dto: UpdateBudgetChapterDto, userId?: number): Promise<BudgetChapter> {
    await this.chapterDerivation?.assertDestinationUsable(dto.spending_destination_id);
    const result = await this.updateWithoutDerivation(id, dto, userId);
    await this.chapterDerivation?.requestAllSafe();
    return result;
  }

  private async updateWithoutDerivation(
    id: number,
    dto: UpdateBudgetChapterDto,
    userId?: number,
  ): Promise<BudgetChapter> {
    const current = await this.repo.findOne({ where: { id } });
    if (current) {
      await assertCanChange(
        this.accounting,
        current,
        changedFields(current, dto, LOCKED_FIELDS).length > 0,
      );
      if (dto.spending_destination_id !== undefined || dto.hard_type !== undefined) {
        await this.assertDestinationFree(
          {
            spending_destination_id:
              dto.spending_destination_id !== undefined
                ? dto.spending_destination_id
                : current.spending_destination_id,
            hard_type: dto.hard_type !== undefined ? dto.hard_type : current.hard_type,
          },
          id,
        );
      }
    }
    const { utility_type_ids, ...rest } = dto;
    const result = await super.update(id, rest as UpdateBudgetChapterDto, userId);
    if (utility_type_ids === undefined) return result;

    const entity = await this.repo.findOne({ where: { id }, relations: { utilityTypes: true } });
    entity.utilityTypes = this.toTypeRefs(utility_type_ids);
    await this.repo.save(entity);
    return this.findOne(id);
  }

  // Destinazioni, collegamenti o capitoli cambiati: capitolo delle utenze ricalcolato.
  async remove(id: number, updatedByUserId: number): Promise<void> {
    await this.removeWithoutDerivation(id, updatedByUserId);
    await this.chapterDerivation?.requestAllSafe();
  }

  private async removeWithoutDerivation(id: number, updatedByUserId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id } });
    if (current) await assertCanChange(this.accounting, current, true);
    return super.remove(id, updatedByUserId);
  }

  // Una sola coppia destinazione + natura tra i capitoli non cancellati (natura
  // assente = tutte le nature della destinazione, anch'essa unica).
  async assertDestinationFree(
    v: { spending_destination_id?: number | null; hard_type?: HardTypeEnum | null },
    selfId: number | null,
  ): Promise<void> {
    if (v.spending_destination_id == null) return;
    const other = await this.repo.findOne({
      where: {
        spending_destination_id: v.spending_destination_id,
        hard_type: v.hard_type ?? IsNull(),
        deleted: false,
        ...(selfId !== null && { id: Not(selfId) }),
      },
    });
    if (!other || other.id === selfId) return;
    const destination = await this.repo.manager.findOne(SpendingDestination, {
      where: { id: v.spending_destination_id },
    });
    throw new BadRequestException(
      `Esiste già un capitolo ${other.chapter_code}/${other.article} per ${destination?.name ?? 'questa destinazione'} · ${hardTypeLabel(v.hard_type)}`,
    );
  }

  private toTypeRefs(ids: number[]): UtilityType[] {
    return [...new Set(ids)].map((tid) => ({ id: tid }) as UtilityType);
  }

  // Totali presunto/effettivo 12 mesi delle utenze del capitolo, uno per
  // tipo (unità diverse non si sommano: un capitolo SPRAR può contenere
  // luce, gas e acqua). SUM sui valori già persistiti dal ricalcolo.
  async getConsumptionSummary(chapterId: number): Promise<ChapterConsumptionSummaryRow[]> {
    const rows: {
      hard_type: HardTypeEnum;
      utilities_count: string;
      estimated_sum: string | null;
      actual_sum: string | null;
    }[] = await this.utilityRepo
      .createQueryBuilder('u')
      .innerJoin('u.utilityType', 'ut')
      .select('ut.hard_type', 'hard_type')
      .addSelect('COUNT(u.id)', 'utilities_count')
      .addSelect('SUM(u.estimated_annual_consumption)', 'estimated_sum')
      .addSelect('SUM(u.actual_consumption)', 'actual_sum')
      .where('u.deleted = 0')
      .andWhere('u.budget_chapter_code_fk = :chapterId', { chapterId })
      .andWhere('ut.hard_type <> :internet', { internet: HardTypeEnum.INTERNET })
      .groupBy('ut.hard_type')
      .orderBy('ut.hard_type', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      hard_type: r.hard_type,
      unit: CONSUMPTION_UNIT[r.hard_type] ?? null,
      utilities_count: Number(r.utilities_count),
      estimated_sum: Number(r.estimated_sum ?? 0),
      actual_sum: Number(r.actual_sum ?? 0),
    }));
  }
}
