import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { UtilizerGrant } from './entity/utilizer-grant.entity';
import { CreateUtilizerGrantDto } from './dto/create-utilizer-grant.dto';
import { UpdateUtilizerGrantDto } from './dto/update-utilizer-grant.dto';
import { SearchUtilizerGrantDto } from './dto/search-utilizer-grant.dto';
import { ContractDirection, DisplayStatus } from './enum/real-estate-contract.enum';
import {
  annualRent,
  CalcInput,
  contractAlerts,
  displayStatus,
  effectiveEndDate,
  noticeDeadline,
  todayIso,
} from './real-estate-contract.calc';
import { validateContract } from './real-estate-contract.validation';

export type ContractRow = UtilizerGrant & {
  annual_rent: number | null;
  effective_end_date: string | null;
  notice_deadline: string | null;
  computed_status: DisplayStatus;
};

export interface ContractSummary {
  notice: number;
  expiring: number;
  expired_active: number;
  without_assets: number;
  annual_income: number;
  annual_expense: number;
}

const FILTERS_HANDLED_HERE = [
  'deleted',
  'asset_id',
  'alert',
  'computed_status',
  'q',
  'direction',
  'kind',
];

@Injectable()
export class UtilizerGrantService extends BaseService<
  UtilizerGrant,
  CreateUtilizerGrantDto,
  UpdateUtilizerGrantDto
> {
  protected readonly entityName = 'utilizer_grant';
  protected readonly relations = [
    'assets',
    'utilizer',
    'parent',
    'parent.utilizer',
    'children',
    'children.utilizer',
    'created_by',
    'updated_by',
  ];

  constructor(
    @InjectRepository(UtilizerGrant)
    protected readonly repo: Repository<UtilizerGrant>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  // Isolato per i test.
  protected today(): string {
    return todayIso();
  }

  async findAll(filters: SearchUtilizerGrantDto = {}): Promise<ContractRow[]> {
    const qb = this.repo.createQueryBuilder('UtilizerGrant');
    qb.leftJoinAndSelect('UtilizerGrant.assets', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('UtilizerGrant.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('UtilizerGrant.parent', 'parent', 'parent.deleted = 0');
    qb.where('UtilizerGrant.deleted = :deleted', { deleted: filters.deleted ? 1 : 0 });
    if (filters.asset_id) {
      qb.andWhere(
        'UtilizerGrant.id IN (SELECT uga.utilizer_grant_id FROM utilizer_grant_assets uga WHERE uga.asset_id = :fAsset)',
        { fAsset: filters.asset_id },
      );
    }
    // Enum: uguaglianza esatta (applyFilters userebbe LIKE).
    if (filters.direction)
      qb.andWhere('UtilizerGrant.direction = :fDir', { fDir: filters.direction });
    if (filters.kind) qb.andWhere('UtilizerGrant.kind = :fKind', { fKind: filters.kind });
    if (filters.q) {
      qb.andWhere(
        '(utilizer.name LIKE :q OR UtilizerGrant.subject LIKE :q OR UtilizerGrant.concession_act LIKE :q OR UtilizerGrant.registration_ref LIKE :q OR asset.asset_name LIKE :q)',
        { q: `%${filters.q}%` },
      );
    }
    this.applyFilters(qb, filters, 'UtilizerGrant', FILTERS_HANDLED_HERE);
    const today = this.today();
    let rows = (await qb.orderBy('UtilizerGrant.id', 'ASC').getMany()).map((g) =>
      this.toRow(g, today),
    );
    if (filters.computed_status)
      rows = rows.filter((r) => r.computed_status === filters.computed_status);
    if (filters.alert) {
      rows = rows.filter((r) => {
        if (filters.alert === 'without_assets') return (r.assets ?? []).length === 0;
        const a = contractAlerts(this.calcInput(r), today);
        return filters.alert === 'notice'
          ? a.notice
          : filters.alert === 'expiring'
            ? a.expiring
            : a.expiredActive;
      });
    }
    return rows;
  }

  async summary(): Promise<ContractSummary> {
    const rows = await this.findAll({});
    const today = this.today();
    const s: ContractSummary = {
      notice: 0,
      expiring: 0,
      expired_active: 0,
      without_assets: 0,
      annual_income: 0,
      annual_expense: 0,
    };
    for (const r of rows) {
      const a = contractAlerts(this.calcInput(r), today);
      if (a.notice) s.notice++;
      if (a.expiring) s.expiring++;
      if (a.expiredActive) s.expired_active++;
      if ((r.assets ?? []).length === 0) s.without_assets++;
      if (
        r.annual_rent &&
        [DisplayStatus.ACTIVE, DisplayStatus.EXPIRING].includes(r.computed_status)
      ) {
        if (r.direction === ContractDirection.PASSIVE) s.annual_expense += r.annual_rent;
        else s.annual_income += r.annual_rent;
      }
    }
    s.annual_income = Math.round(s.annual_income * 100) / 100;
    s.annual_expense = Math.round(s.annual_expense * 100) / 100;
    return s;
  }

  async findOne(id: number): Promise<ContractRow | null> {
    const g = await this.repo.findOne({
      where: { id },
      relations: toFindOptionsRelations<UtilizerGrant>(this.relations),
    });
    return g ? this.toRow(g, this.today()) : null;
  }

  async create(dto: CreateUtilizerGrantDto, userId?: number): Promise<ContractRow> {
    const { asset_ids, ...rest } = dto;
    await this.assertValid({ ...rest }, null);
    const assets = await this.resolveAssets(asset_ids ?? []);
    const entity = this.repo.create({
      ...rest,
      assets,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
    } as never);
    let saved: UtilizerGrant;
    try {
      saved = (await this.repo.save(entity)) as unknown as UtilizerGrant;
    } catch (error) {
      this.manageErrors(error, 'Errore durante la creazione del contratto');
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateUtilizerGrantDto, userId?: number): Promise<ContractRow> {
    const { asset_ids, ...rest } = dto;
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Contratto non trovato');
    await this.assertValid({ ...current, ...rest }, id);
    await super.update(id, rest as UpdateUtilizerGrantDto, userId);
    if (asset_ids !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { assets: true } });
      entity.assets = await this.resolveAssets(asset_ids);
      await this.repo.save(entity);
    }
    return this.findOne(id);
  }

  // BaseService.remove usa this.findOne, che qui restituisce la riga con i
  // campi calcolati e le relazioni: salvarla persisterebbe parent/children.
  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new BadRequestException('Contratto non trovato');
    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
    await this.recordAudit(AuditAction.DELETE, id, updatedByUserId, []);
  }

  private async assertValid(c: Record<string, unknown>, id: number | null): Promise<void> {
    const parentId = (c.parent_contract_id as number | null | undefined) ?? null;
    const parent = parentId ? await this.repo.findOne({ where: { id: parentId } }) : null;
    if (parentId && !parent) throw new BadRequestException('Contratto padre non trovato');
    const error = validateContract({
      id,
      start_date: (c.start_date as string) ?? null,
      end_date: (c.end_date as string) ?? null,
      rent_amount:
        c.rent_amount === null || c.rent_amount === undefined ? null : Number(c.rent_amount),
      rent_period: (c.rent_period as never) ?? null,
      tacit_renewal: !!c.tacit_renewal,
      renewal_months: (c.renewal_months as number) ?? null,
      notice_months: (c.notice_months as number) ?? null,
      parent_contract_id: parentId,
      parentHasParent: !!parent?.parent_contract_id,
    });
    if (error) throw new BadRequestException(error);
  }

  private async resolveAssets(assetIds: number[]): Promise<Asset[]> {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) return [];
    const found = await this.assetRepo.count({ where: { id: In(ids), deleted: false } });
    if (found !== ids.length)
      throw new BadRequestException('Uno o più immobili non esistono o sono stati eliminati.');
    return ids.map((assetId) => ({ id: assetId }) as Asset);
  }

  private calcInput(g: UtilizerGrant): CalcInput {
    return {
      end_date: g.end_date ?? null,
      tacit_renewal: !!g.tacit_renewal,
      renewal_months: g.renewal_months ?? null,
      notice_months: g.notice_months ?? null,
      status: g.status,
    };
  }

  private toRow(g: UtilizerGrant, today: string): ContractRow {
    const c = this.calcInput(g);
    return {
      ...g,
      rent_amount:
        g.rent_amount === null || g.rent_amount === undefined ? null : Number(g.rent_amount),
      annual_rent: annualRent(g.rent_amount, g.rent_period),
      effective_end_date: effectiveEndDate(c, today),
      notice_deadline: noticeDeadline(c, today),
      computed_status: displayStatus(c, today),
    } as ContractRow;
  }
}
