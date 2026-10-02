import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { Plant } from './entity/plant.entity';
import { PlantThermal } from './entity/plant-thermal.entity';
import { PlantElevator } from './entity/plant-elevator.entity';
import { PlantInspection } from './entity/plant-inspection.entity';
import { PlantFireEquipment } from './entity/plant-fire-equipment.entity';
import { CreatePlantDto } from './dto/create-plant.dto';
import { UpdatePlantDto } from './dto/update-plant.dto';
import { SearchPlantDto } from './dto/search-plant.dto';
import { CreatePlantInspectionDto, UpdatePlantInspectionDto } from './dto/plant-inspection.dto';
import {
  CreatePlantFireEquipmentDto,
  UpdatePlantFireEquipmentDto,
} from './dto/plant-fire-equipment.dto';
import { PlantThermalDto } from './dto/plant-thermal.dto';
import { PlantElevatorDto } from './dto/plant-elevator.dto';
import { InspectionStatus, PlantType, PositionQuality } from './enum/plant.enum';
import { computeNextDate, inspectionStatus, resolvePlantPosition } from './plant.calc';
import { ThermalPlantObligations, thermalPlantObligations } from './thermal-plant-obligations';

export type PlantRow = Plant & {
  position_quality: PositionQuality;
  position: { lat: string; lng: string } | null;
  // La verifica messa peggio (scaduta > in scadenza > ok > senza data).
  inspection_status: InspectionStatus | null;
  obligations?: ThermalPlantObligations;
};

export interface PlantSummary {
  by_type: Partial<Record<PlantType, number>>;
  inspections_overdue: number;
  inspections_due_soon: number;
  without_position: number;
}

const SEVERITY = [
  InspectionStatus.OVERDUE,
  InspectionStatus.DUE_SOON,
  InspectionStatus.OK,
  InspectionStatus.NO_DATE,
];

const RELATIONS = {
  asset: true,
  utilities: true,
  thermal: true,
  elevator: true,
  fireEquipment: true,
  inspections: true,
  created_by: true,
  updated_by: true,
};

@Injectable()
export class PlantsService extends BaseService<Plant, CreatePlantDto, UpdatePlantDto> {
  protected readonly entityName = 'plants';
  protected readonly relations = Object.keys(RELATIONS);

  constructor(
    @InjectRepository(Plant) protected readonly repo: Repository<Plant>,
    @InjectRepository(PlantThermal) private readonly thermalRepo: Repository<PlantThermal>,
    @InjectRepository(PlantElevator) private readonly elevatorRepo: Repository<PlantElevator>,
    @InjectRepository(PlantInspection)
    private readonly inspectionRepo: Repository<PlantInspection>,
    @InjectRepository(PlantFireEquipment)
    private readonly fireRepo: Repository<PlantFireEquipment>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility) private readonly utilityRepo: Repository<Utility>,
  ) {
    super();
  }

  protected today(): string {
    return todayIso();
  }

  async findAll(filters: SearchPlantDto = {}): Promise<PlantRow[]> {
    const where: Record<string, unknown> = { deleted: false };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.asset_id) where.asset_id_fk = filters.asset_id;
    const today = this.today();
    let rows = (
      await this.repo.find({ where, relations: RELATIONS, order: { code: 'ASC' } })
    ).map((p) => this.toRow(p, today));
    if (filters.utility_id) {
      rows = rows.filter((p) => (p.utilities ?? []).some((u) => u.id === filters.utility_id));
    }
    if (filters.inspection) {
      const wanted =
        filters.inspection === 'overdue' ? InspectionStatus.OVERDUE : InspectionStatus.DUE_SOON;
      rows = rows.filter((p) => p.inspection_status === wanted);
    }
    if (filters.position) {
      const wanted = filters.position.toUpperCase();
      rows = rows.filter((p) => p.position_quality === wanted);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((p) =>
        [
          p.code,
          p.name,
          p.address,
          p.asset?.asset_name,
          ...(p.utilities ?? []).map((u) => u.utility_id),
        ].some((v) => (v ?? '').toLowerCase().includes(q)),
      );
    }
    return rows;
  }

  async findOne(id: number): Promise<PlantRow | null> {
    const p = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    return p ? this.toRow(p, this.today()) : null;
  }

  async summary(): Promise<PlantSummary> {
    const rows = await this.findAll({});
    const s: PlantSummary = {
      by_type: {},
      inspections_overdue: 0,
      inspections_due_soon: 0,
      without_position: 0,
    };
    for (const r of rows) {
      s.by_type[r.type] = (s.by_type[r.type] ?? 0) + 1;
      if (r.inspection_status === InspectionStatus.OVERDUE) s.inspections_overdue++;
      if (r.inspection_status === InspectionStatus.DUE_SOON) s.inspections_due_soon++;
      if (r.position_quality === PositionQuality.MISSING) s.without_position++;
    }
    return s;
  }

  async create(dto: CreatePlantDto, userId?: number): Promise<PlantRow> {
    const { thermal, elevator, utility_ids, ...rest } = dto;
    await this.assertCodeFree(rest.code, null);
    await this.assertAsset(rest.asset_id_fk);
    const utilities = await this.resolveUtilities(utility_ids ?? []);
    const saved = (await this.repo.save(
      this.repo.create({
        ...rest,
        code: rest.code.trim(),
        utilities,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      } as never),
    )) as unknown as Plant;
    await this.saveDetails(saved.id, rest.type, thermal, elevator);
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdatePlantDto, userId?: number): Promise<PlantRow> {
    const { thermal, elevator, utility_ids, ...rest } = dto;
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impianto non trovato');
    if (rest.code !== undefined && rest.code.trim() !== current.code) {
      await this.assertCodeFree(rest.code, id);
      rest.code = rest.code.trim();
    }
    if (rest.asset_id_fk !== undefined) await this.assertAsset(rest.asset_id_fk);
    const utilities = utility_ids === undefined ? undefined : await this.resolveUtilities(utility_ids);
    await super.update(id, rest as UpdatePlantDto, userId);
    // Cambio tipo: i dati specifici del tipo precedente non hanno più senso.
    const type = rest.type ?? current.type;
    if (type !== PlantType.THERMAL) await this.thermalRepo.delete({ plant_id: id });
    if (type !== PlantType.ELEVATOR) await this.elevatorRepo.delete({ plant_id: id });
    await this.saveDetails(id, type, thermal, elevator);
    if (utilities !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { utilities: true } });
      entity.utilities = utilities;
      await this.repo.save(entity);
    }
    return this.findOne(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, deleted: false } });
    if (!entity) throw new BadRequestException('Impianto non trovato');
    entity.deleted = true;
    entity.updated_by_user_id = userId;
    await this.repo.save(entity);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  async addInspection(
    plantId: number,
    dto: CreatePlantInspectionDto,
    userId: number,
  ): Promise<PlantInspection> {
    await this.assertPlant(plantId);
    const next_date =
      dto.next_date ?? computeNextDate(dto.last_date ?? null, dto.period_months ?? null);
    return this.inspectionRepo.save(
      this.inspectionRepo.create({
        ...dto,
        next_date,
        plant_id: plantId,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      }),
    );
  }

  async updateInspection(
    id: number,
    dto: UpdatePlantInspectionDto,
    userId: number,
  ): Promise<PlantInspection> {
    const current = await this.inspectionRepo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Verifica non trovata');
    const merged = { ...current, ...dto };
    // Ricalcolo solo se cambia ultima data/periodicità senza una prossima data esplicita.
    if (
      dto.next_date === undefined &&
      (dto.last_date !== undefined || dto.period_months !== undefined)
    ) {
      merged.next_date =
        computeNextDate(merged.last_date ?? null, merged.period_months ?? null) ??
        merged.next_date;
    }
    return this.inspectionRepo.save({ ...merged, updated_by_user_id: userId });
  }

  async removeInspection(id: number, userId: number): Promise<void> {
    const current = await this.inspectionRepo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Verifica non trovata');
    await this.inspectionRepo.save({ ...current, deleted: true, updated_by_user_id: userId });
  }

  async addFireEquipment(
    plantId: number,
    dto: CreatePlantFireEquipmentDto,
    userId: number,
  ): Promise<PlantFireEquipment> {
    const plant = await this.assertPlant(plantId);
    if (plant.type !== PlantType.FIRE_PROTECTION) {
      throw new BadRequestException('Presidi ammessi solo sugli impianti antincendio');
    }
    return this.fireRepo.save(
      this.fireRepo.create({
        ...dto,
        plant_id: plantId,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      }),
    );
  }

  async updateFireEquipment(
    id: number,
    dto: UpdatePlantFireEquipmentDto,
    userId: number,
  ): Promise<PlantFireEquipment> {
    const current = await this.fireRepo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Presidio non trovato');
    return this.fireRepo.save({ ...current, ...dto, updated_by_user_id: userId });
  }

  async removeFireEquipment(id: number, userId: number): Promise<void> {
    const current = await this.fireRepo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Presidio non trovato');
    await this.fireRepo.save({ ...current, deleted: true, updated_by_user_id: userId });
  }

  private async assertPlant(id: number): Promise<Plant> {
    const p = await this.repo.findOne({ where: { id, deleted: false } });
    if (!p) throw new BadRequestException('Impianto non trovato');
    return p;
  }

  private async assertCodeFree(code: string, exceptId: number | null): Promise<void> {
    const dup = await this.repo.find({ where: { code: code.trim(), deleted: false } });
    if (dup.some((p) => p.id !== exceptId)) {
      throw new BadRequestException(`Codice impianto ${code} già in uso.`);
    }
  }

  private async assertAsset(assetId: number | null | undefined): Promise<void> {
    if (assetId === null || assetId === undefined) return;
    if ((await this.assetRepo.count({ where: { id: assetId, deleted: false } })) === 0) {
      throw new BadRequestException('Immobile non trovato');
    }
  }

  private async resolveUtilities(ids: number[]): Promise<Utility[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.utilityRepo.count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) {
      throw new BadRequestException('Una o più utenze non esistono o sono state eliminate.');
    }
    return unique.map((id) => ({ id }) as Utility);
  }

  private async saveDetails(
    plantId: number,
    type: PlantType,
    thermal?: PlantThermalDto | null,
    elevator?: PlantElevatorDto | null,
  ): Promise<void> {
    if (type === PlantType.THERMAL && thermal) {
      await this.thermalRepo.save({ ...thermal, plant_id: plantId });
    }
    if (type === PlantType.ELEVATOR && elevator) {
      await this.elevatorRepo.save({ ...elevator, plant_id: plantId });
    }
  }

  private toRow(p: Plant, today: string): PlantRow {
    const pos = resolvePlantPosition({
      latitude: p.latitude,
      longitude: p.longitude,
      geocoded_latitude: p.geocoded_latitude,
      geocoded_longitude: p.geocoded_longitude,
      asset: p.asset ?? null,
    });
    const inspections = (p.inspections ?? []).filter((i) => !i.deleted);
    const statuses = inspections.map((i) => inspectionStatus(i.next_date, today));
    const row = {
      ...p,
      inspections,
      fireEquipment: (p.fireEquipment ?? []).filter((f) => !f.deleted),
      utilities: (p.utilities ?? []).filter((u) => !u.deleted),
      position: pos ? { lat: pos.lat, lng: pos.lng } : null,
      position_quality: pos?.quality ?? PositionQuality.MISSING,
      inspection_status: SEVERITY.find((s) => statuses.includes(s)) ?? null,
    } as PlantRow;
    if (p.type === PlantType.THERMAL) {
      // decimal MySQL arriva come stringa.
      const kw = p.thermal?.power_kw;
      row.obligations = thermalPlantObligations(kw === null || kw === undefined ? null : Number(kw));
    }
    return row;
  }
}
