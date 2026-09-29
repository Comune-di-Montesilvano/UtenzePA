import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Utility } from '@apis/utility/entity/utility.entity';
import { findMeterConflict } from '@apis/utility/meter-number.helper';
import { HardTypeEnum } from '@apis/utility-types/enum/hard-type.enum';
import { UtilityConsumption } from './entity/utility-consumption.entity';
import { CreateUtilityConsumptionDto } from './dto/create-utility-consumption.dto';
import { UpdateUtilityConsumptionDto } from './dto/update-utility-consumption.dto';
import { ConsumptionRecalcService } from './consumption-recalc.service';
import { ConsumptionKind } from './enum/consumption-kind.enum';
import { EstimateSource } from './enum/estimate-source.enum';
import { CONSUMPTION_UNIT } from './consumption-unit';
import {
  buildDailyConsumption,
  computeMonthlySeries,
  ConsumptionRecord,
  manualValidUntil,
  MonthlyPoint,
  normalizeByKind,
  normalizeMeter,
  readingDeltas,
  sortedReadings,
  todayDay,
  validateConsumption,
} from './consumption-calculator';

export type UtilityConsumptionRow = UtilityConsumption & { computed_consumption: number | null };

export interface UtilityConsumptionSummary {
  unit: string | null;
  actual_consumption: number;
  coverage_days: number;
  estimated_annual_consumption: number;
  estimated_source: EstimateSource;
  estimated_valid_until: string | null;
  monthly: MonthlyPoint[];
}

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const toLocalIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable()
export class UtilityConsumptionsService extends BaseService<
  UtilityConsumption,
  CreateUtilityConsumptionDto,
  UpdateUtilityConsumptionDto
> {
  protected readonly entityName = 'utility_consumptions';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilityConsumption)
    protected readonly repo: Repository<UtilityConsumption>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
    private readonly recalc: ConsumptionRecalcService,
  ) {
    super();
  }

  async findByUtility(utilityId: number): Promise<UtilityConsumptionRow[]> {
    const rows = await this.repo.find({ where: { utility_id_fk: utilityId, deleted: false } });
    const deltas = readingDeltas(rows);
    const sortKey = (r: UtilityConsumption) => r.reading_date ?? r.period_end ?? '';
    return rows
      .map((r) => ({
        ...r,
        reading_value: toNumber(r.reading_value),
        consumption: toNumber(r.consumption),
        computed_consumption:
          r.kind === ConsumptionKind.PERIOD ? toNumber(r.consumption) : (deltas.get(r.id) ?? null),
      }))
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id - a.id);
  }

  async getSummary(utilityId: number): Promise<UtilityConsumptionSummary> {
    const utility = await this.loadUtility(utilityId);
    const records = await this.repo.find({ where: { utility_id_fk: utilityId, deleted: false } });
    const setAt = utility.estimated_consumption_set_at ? new Date(utility.estimated_consumption_set_at) : null;
    return {
      unit: CONSUMPTION_UNIT[utility.utilityType?.hard_type] ?? null,
      actual_consumption: Number(utility.actual_consumption ?? 0),
      coverage_days: Number(utility.actual_consumption_coverage_days ?? 0),
      estimated_annual_consumption: Number(utility.estimated_annual_consumption ?? 0),
      estimated_source: utility.estimated_consumption_source,
      estimated_valid_until:
        utility.estimated_consumption_source === EstimateSource.MANUAL && setAt
          ? toLocalIsoDate(manualValidUntil(setAt))
          : null,
      monthly: computeMonthlySeries(buildDailyConsumption(records), todayDay()),
    };
  }

  async createForUtility(
    utilityId: number,
    dto: CreateUtilityConsumptionDto,
    userId: number,
  ): Promise<UtilityConsumption> {
    const utility = await this.loadUtility(utilityId);
    const candidate = normalizeByKind(dto as ConsumptionRecord & { notes?: string | null });
    await this.validate(utility, candidate);
    const saved = await super.create({ ...candidate, utility_id_fk: utilityId } as never, userId);
    await this.afterChange(utility);
    return saved;
  }

  async update(id: number, dto: UpdateUtilityConsumptionDto, userId?: number): Promise<UtilityConsumption> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Rilevazione non trovata');
    const utility = await this.loadUtility(current.utility_id_fk);
    const merged = normalizeByKind({ ...current, ...dto } as ConsumptionRecord & { notes?: string | null });
    await this.validate(utility, { ...merged, id });
    const saved = await super.update(id, merged as never, userId);
    await this.afterChange(utility);
    return saved;
  }

  async remove(id: number, userId: number): Promise<void> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Rilevazione non trovata');
    await super.remove(id, userId);
    await this.recalc.recalcUtility(current.utility_id_fk);
  }

  private async loadUtility(utilityId: number): Promise<Utility> {
    const utility = await this.utilityRepo.findOne({
      where: { id: utilityId, deleted: false },
      relations: { utilityType: true },
    });
    if (!utility) throw new BadRequestException('Utenza non trovata');
    return utility;
  }

  private async validate(utility: Utility, candidate: ConsumptionRecord): Promise<void> {
    if (utility.utilityType?.hard_type === HardTypeEnum.INTERNET) {
      throw new BadRequestException('Le utenze Internet non hanno consumi.');
    }
    const others = await this.repo.find({ where: { utility_id_fk: utility.id, deleted: false } });
    const error = validateConsumption(candidate, others, todayDay());
    if (error) throw new BadRequestException(error);
    if (candidate.kind === ConsumptionKind.READING) {
      const conflict = await findMeterConflict(this.utilityRepo, candidate.meter_number, utility.id);
      if (conflict) {
        throw new BadRequestException(
          `Matricola ${candidate.meter_number} già associata all'utenza ${conflict.utility_id}.`,
        );
      }
    }
  }

  // Matricola attuale = quella dell'ultima lettura; poi ricalcolo valori.
  private async afterChange(utility: Utility): Promise<void> {
    const records = await this.repo.find({ where: { utility_id_fk: utility.id, deleted: false } });
    const latest = sortedReadings(records).slice(-1)[0];
    if (latest && normalizeMeter(latest.meter_number) !== normalizeMeter(utility.meter_number)) {
      await this.utilityRepo.update(utility.id, { meter_number: latest.meter_number.trim() });
    }
    await this.recalc.recalcUtility(utility.id);
  }
}
