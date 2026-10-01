import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { ThermalPlant } from './entity/thermal-plant.entity';
import { CreateThermalPlantDto } from './dto/create-thermal-plant.dto';
import { UpdateThermalPlantDto } from './dto/update-thermal-plant.dto';
import { ThermalPlantObligations, thermalPlantObligations } from './thermal-plant-obligations';

export type ThermalPlantRow = ThermalPlant & ThermalPlantObligations;

const toNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class ThermalPlantsService extends BaseService<
  ThermalPlant,
  CreateThermalPlantDto,
  UpdateThermalPlantDto
> {
  protected readonly entityName = 'thermal_plants';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(ThermalPlant)
    protected readonly repo: Repository<ThermalPlant>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility)
    private readonly utilityRepo: Repository<Utility>,
  ) {
    super();
  }

  // Vista dedicata: tutti gli impianti, raggruppati per immobile.
  async findAllRows(): Promise<ThermalPlantRow[]> {
    const rows = await this.repo.find({
      where: { deleted: false },
      relations: { asset: true, utility: true },
    });
    return rows
      .map((r) => this.toRow(r))
      .sort(
        (a, b) =>
          (a.asset?.asset_name ?? '').localeCompare(b.asset?.asset_name ?? '') || a.id - b.id,
      );
  }

  async findByAsset(assetId: number): Promise<ThermalPlantRow[]> {
    const rows = await this.repo.find({
      where: { asset_id_fk: assetId, deleted: false },
      relations: { utility: true },
      order: { id: 'ASC' },
    });
    return rows.map((r) => this.toRow(r));
  }

  async findByUtility(utilityId: number): Promise<ThermalPlantRow[]> {
    const rows = await this.repo.find({
      where: { utility_id_fk: utilityId, deleted: false },
      relations: { asset: true },
      order: { id: 'ASC' },
    });
    return rows.map((r) => this.toRow(r));
  }

  async createForAsset(
    assetId: number,
    dto: CreateThermalPlantDto,
    userId: number,
  ): Promise<ThermalPlant> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId, deleted: false } });
    if (!asset) throw new BadRequestException('Immobile non trovato');
    await this.ensureUtility(dto.utility_id_fk);
    return super.create({ ...dto, asset_id_fk: assetId } as never, userId);
  }

  async update(id: number, dto: UpdateThermalPlantDto, userId?: number): Promise<ThermalPlant> {
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Impianto non trovato');
    await this.ensureUtility(dto.utility_id_fk);
    return super.update(id, dto, userId);
  }

  private async ensureUtility(utilityId: number | null | undefined): Promise<void> {
    if (utilityId === null || utilityId === undefined) return;
    const utility = await this.utilityRepo.findOne({ where: { id: utilityId, deleted: false } });
    if (!utility) throw new BadRequestException('Utenza non trovata');
  }

  private toRow(r: ThermalPlant): ThermalPlantRow {
    const power = toNumber(r.power_kw);
    return {
      ...r,
      power_kw: power,
      served_area_sqm: toNumber(r.served_area_sqm),
      ...thermalPlantObligations(power),
    };
  }
}
