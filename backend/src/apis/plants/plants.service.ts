import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { GeocodingService } from '@apis/geocoding/geocoding.service';
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
import {
  PLANTS_MUNICIPALITY,
  computeNextDate,
  firstLocatedAsset,
  inspectionStatus,
  resolvePlantPosition,
} from './plant.calc';
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

const isSet = (v: string | null | undefined): boolean => v != null && v.trim() !== '';

const SEVERITY = [
  InspectionStatus.OVERDUE,
  InspectionStatus.DUE_SOON,
  InspectionStatus.OK,
  InspectionStatus.NO_DATE,
];

const RELATIONS = {
  assets: true,
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
    private readonly geocodingService: GeocodingService,
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
    const today = this.today();
    let rows = (
      await this.repo.find({ where, relations: RELATIONS, order: { code: 'ASC' } })
    ).map((p) => this.toRow(p, today));
    if (filters.asset_id) {
      rows = rows.filter((p) => (p.assets ?? []).some((a) => a.id === filters.asset_id));
    }
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
          ...(p.assets ?? []).map((a) => a.asset_name),
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
    const { thermal, elevator, utility_ids, asset_ids, ...rest } = dto;
    await this.assertCodeFree(rest.code, null);
    const assets = await this.resolveAssets(asset_ids ?? []);
    const utilities = await this.resolveUtilities(utility_ids ?? []);
    const saved = (await this.repo.save(
      this.repo.create({
        ...rest,
        code: rest.code.trim(),
        assets,
        utilities,
        ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      } as never),
    )) as unknown as Plant;
    await this.saveDetails(saved.id, rest.type, thermal, elevator);
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    if (!isSet(rest.latitude) || !isSet(rest.longitude)) {
      await this.geocode(saved.id, rest.address ?? null, rest.civic_number ?? null).catch(() => undefined);
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdatePlantDto, userId?: number): Promise<PlantRow> {
    const { thermal, elevator, utility_ids, asset_ids, ...rest } = dto;
    const current = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { utilities: true },
    });
    if (!current) throw new BadRequestException('Impianto non trovato');
    if (rest.code !== undefined && rest.code.trim() !== current.code) {
      await this.assertCodeFree(rest.code, id);
      rest.code = rest.code.trim();
    }
    const assets = asset_ids === undefined ? undefined : await this.resolveAssets(asset_ids);
    const utilities = utility_ids === undefined ? undefined : await this.resolveUtilities(utility_ids);
    if (utilities !== undefined) {
      const kept = new Set(utilities.map((u) => u.id));
      await this.assertNoOrphanUtilities(
        id,
        (current.utilities ?? []).map((u) => u.id).filter((uid) => !kept.has(uid)),
      );
    }
    // Indirizzo cambiato: la vecchia geocodifica non vale più (come per gli immobili).
    const addressChanged =
      (rest.address !== undefined && (rest.address ?? null) !== (current.address ?? null)) ||
      (rest.civic_number !== undefined && (rest.civic_number ?? null) !== (current.civic_number ?? null));
    const payload: Record<string, unknown> = { ...rest };
    if (addressChanged) {
      Object.assign(payload, { geocoded_latitude: null, geocoded_longitude: null, geocoded_at: null });
    }
    await super.update(id, payload as UpdatePlantDto, userId);
    // Cambio tipo: i dati specifici del tipo precedente non hanno più senso.
    const type = rest.type ?? current.type;
    if (type !== PlantType.THERMAL) await this.thermalRepo.delete({ plant_id: id });
    if (type !== PlantType.ELEVATOR) await this.elevatorRepo.delete({ plant_id: id });
    await this.saveDetails(id, type, thermal, elevator);
    if (utilities !== undefined || assets !== undefined) {
      const entity = await this.repo.findOne({
        where: { id },
        relations: { utilities: true, assets: true },
      });
      if (utilities !== undefined) entity.utilities = utilities;
      if (assets !== undefined) entity.assets = assets;
      await this.repo.save(entity);
    }
    if (addressChanged) {
      const lat = rest.latitude !== undefined ? rest.latitude : current.latitude;
      const lng = rest.longitude !== undefined ? rest.longitude : current.longitude;
      if (!isSet(lat) || !isSet(lng)) {
        await this.geocode(
          id,
          rest.address !== undefined ? rest.address : current.address,
          rest.civic_number !== undefined ? rest.civic_number : current.civic_number,
        ).catch(() => undefined);
      }
    }
    return this.findOne(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const entity = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { utilities: true },
    });
    if (!entity) throw new BadRequestException('Impianto non trovato');
    await this.assertNoOrphanUtilities(id, (entity.utilities ?? []).map((u) => u.id));
    delete (entity as Partial<Plant>).utilities;
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
    // Prossima data svuotata dall'utente (null): si ricalcola da ultima +
    // periodicità, o resta vuota. Non inviata: si ricalcola solo se cambiano
    // ultima data/periodicità, altrimenti resta quella salvata.
    if (dto.next_date === null) {
      merged.next_date = computeNextDate(merged.last_date ?? null, merged.period_months ?? null);
    } else if (
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

  // Un'utenza deve restare collegata ad almeno un immobile o un impianto:
  // togliendola da questo impianto (o eliminandolo) non deve restare orfana.
  private async assertNoOrphanUtilities(plantId: number, utilityIds: number[]): Promise<void> {
    if (utilityIds.length === 0) return;
    const affected = await this.utilityRepo.find({
      where: { id: In(utilityIds), deleted: false },
      relations: { assets: true, plants: true },
    });
    const orphans = affected.filter(
      (u) =>
        (u.assets ?? []).filter((a) => !a.deleted).length +
          (u.plants ?? []).filter((p) => !p.deleted && p.id !== plantId).length ===
        0,
    );
    if (orphans.length > 0) {
      throw new BadRequestException(
        `Le utenze ${orphans.map((u) => u.utility_id).join(', ')} sono collegate solo a questo impianto: ` +
          'collegale prima a un immobile o a un altro impianto.',
      );
    }
  }

  private async geocode(id: number, address: string | null, civic: string | null): Promise<void> {
    const query = this.geocodingService.buildQuery({
      address,
      civic_number: civic,
      zip_code: null,
      municipality: PLANTS_MUNICIPALITY,
    });
    if (!query) return;
    const result = await this.geocodingService.geocode(query);
    if (!result) return;
    await this.repo.update(id, {
      geocoded_latitude: result.lat,
      geocoded_longitude: result.lon,
      geocoded_at: new Date(),
    } as never);
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

  private async resolveAssets(ids: number[]): Promise<Asset[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.assetRepo.count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) {
      throw new BadRequestException('Uno o più immobili non esistono o sono stati eliminati.');
    }
    return unique.map((id) => ({ id }) as Asset);
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
      asset: firstLocatedAsset(p.assets),
    });
    const inspections = (p.inspections ?? []).filter((i) => !i.deleted);
    const statuses = inspections.map((i) => inspectionStatus(i.next_date, today));
    const row = {
      ...p,
      inspections,
      fireEquipment: (p.fireEquipment ?? []).filter((f) => !f.deleted),
      utilities: (p.utilities ?? []).filter((u) => !u.deleted),
      assets: (p.assets ?? []).filter((a) => !a.deleted),
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
