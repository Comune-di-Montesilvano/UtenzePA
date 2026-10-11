import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { displayStatus, todayIso } from '@apis/utilizer-grant/real-estate-contract.calc';
import { DisplayStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { Complex } from './entity/complex.entity';
import { CreateComplexDto } from './dto/create-complex.dto';
import { UpdateComplexDto } from './dto/update-complex.dto';
import { SearchComplexDto } from './dto/search-complex.dto';

export type ComplexCounts = {
  asset_count: number;
  utility_count: number;
  plant_count: number;
  active_grant_count: number;
};
export type ComplexRow = Complex & ComplexCounts;

const ACTIVE_DISPLAY = new Set([DisplayStatus.ACTIVE, DisplayStatus.EXPIRING]);

// Collegati (utenze, impianti, contratti) raggruppati per complesso tramite
// i loro immobili: un collegato su due immobili dello stesso complesso conta una volta.
type Linked = { id: number; assets?: { complex_id: number | null; deleted?: boolean }[] };
function idsByComplex<T extends Linked>(rows: T[], keep: (r: T) => boolean = () => true) {
  const out = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!keep(r)) continue;
    for (const a of r.assets ?? []) {
      if (a.complex_id == null || a.deleted) continue;
      const set = out.get(a.complex_id) ?? new Set<number>();
      set.add(r.id);
      out.set(a.complex_id, set);
    }
  }
  return out;
}

@Injectable()
export class ComplexesService extends BaseService<Complex, CreateComplexDto, UpdateComplexDto> {
  protected readonly entityName = 'complexes';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(Complex) protected readonly repo: Repository<Complex>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Utility) private readonly utilityRepo: Repository<Utility>,
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
    @InjectRepository(UtilizerGrant) private readonly grantRepo: Repository<UtilizerGrant>,
  ) {
    super();
  }

  protected today(): string {
    return todayIso();
  }

  async findAll(filters: SearchComplexDto = {}): Promise<ComplexRow[]> {
    let rows = await this.repo.find({
      where: { deleted: false, ...(filters.complex_type ? { complex_type: filters.complex_type } : {}) },
      relations: { assets: true },
      order: { name: 'ASC' },
    });
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((c) =>
        [c.name, c.address, c.toponym].some((v) => (v ?? '').toLowerCase().includes(q)),
      );
    }
    return this.withCounts(rows);
  }

  async findOne(id: number): Promise<ComplexRow | null> {
    const c = await this.repo.findOne({
      where: { id, deleted: false },
      relations: {
        assets: { assetNature: true, assetFunction: true },
        created_by: true,
        updated_by: true,
      },
    });
    if (!c) return null;
    c.assets = (c.assets ?? []).filter((a) => !a.deleted);
    return (await this.withCounts([c]))[0];
  }

  private linkedWhere(id: number) {
    return { deleted: false, assets: { complex_id: id, deleted: false } };
  }

  // Righe dei tab di sola lettura: TypeORM carica nella relazione assets solo
  // gli immobili del complesso (colonna "Immobile" del tab).
  utilities(id: number): Promise<Utility[]> {
    return this.utilityRepo.find({
      where: this.linkedWhere(id),
      relations: { assets: true, utilityType: true },
      order: { utility_id: 'ASC' },
    });
  }

  plants(id: number): Promise<Plant[]> {
    return this.plantRepo.find({
      where: this.linkedWhere(id),
      relations: { assets: true },
      order: { code: 'ASC' },
    });
  }

  async grants(id: number): Promise<(UtilizerGrant & { computed_status: DisplayStatus })[]> {
    const today = this.today();
    const rows = await this.grantRepo.find({
      where: this.linkedWhere(id),
      relations: { assets: true, parties: true },
      order: { start_date: 'DESC' },
    });
    return rows.map((g) => ({ ...g, computed_status: displayStatus(g as never, today) }));
  }

  private async withCounts(complexes: Complex[]): Promise<ComplexRow[]> {
    const ids = complexes.map((c) => c.id);
    if (!ids.length) return [];
    const linked = { deleted: false, assets: { complex_id: In(ids), deleted: false } };
    const [utilities, plants, grants] = await Promise.all([
      this.utilityRepo.find({ where: linked, relations: { assets: true } }),
      this.plantRepo.find({ where: linked, relations: { assets: true } }),
      this.grantRepo.find({ where: linked, relations: { assets: true } }),
    ]);
    const today = this.today();
    const u = idsByComplex(utilities as unknown as Linked[]);
    const p = idsByComplex(plants as unknown as Linked[]);
    const g = idsByComplex(grants as unknown as (Linked & UtilizerGrant)[], (gr) =>
      ACTIVE_DISPLAY.has(displayStatus(gr as never, today)),
    );
    return complexes.map((c) => ({
      ...c,
      asset_count: (c.assets ?? []).filter((a) => !a.deleted).length,
      utility_count: u.get(c.id)?.size ?? 0,
      plant_count: p.get(c.id)?.size ?? 0,
      active_grant_count: g.get(c.id)?.size ?? 0,
    }));
  }

  async create(dto: CreateComplexDto, userId: number): Promise<ComplexRow> {
    const { asset_ids, ...rest } = dto;
    if (asset_ids !== undefined) await this.assertAssets(asset_ids);
    const saved = (await this.repo.save(
      this.repo.create({
        ...rest,
        name: rest.name.trim(),
        created_by_user_id: userId,
        updated_by_user_id: userId,
      } as never),
    )) as unknown as Complex;
    if (asset_ids?.length) {
      await this.assetRepo.update({ id: In(asset_ids) }, { complex_id: saved.id });
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateComplexDto, userId: number): Promise<ComplexRow> {
    const { asset_ids, ...rest } = dto;
    const current = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { assets: true },
    });
    if (!current) throw new BadRequestException('Complesso non trovato');
    if (rest.name !== undefined) rest.name = rest.name.trim();
    if (asset_ids !== undefined) await this.assertAssets(asset_ids);
    await super.update(id, rest as UpdateComplexDto, userId);
    if (asset_ids !== undefined) {
      const before = (current.assets ?? []).filter((a) => !a.deleted).map((a) => a.id);
      const removed = before.filter((a) => !asset_ids.includes(a));
      if (removed.length) await this.assetRepo.update({ id: In(removed) }, { complex_id: null });
      if (asset_ids.length) await this.assetRepo.update({ id: In(asset_ids) }, { complex_id: id });
      const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b).join(',');
      if (sorted(before) !== sorted(asset_ids)) {
        await this.recordAudit(AuditAction.UPDATE, id, userId, [
          { fieldName: 'asset_ids', oldValue: sorted(before), newValue: sorted(asset_ids) },
        ]);
      }
    }
    return this.findOne(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const entity = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { assets: true },
    });
    if (!entity) throw new BadRequestException('Complesso non trovato');
    const linked = (entity.assets ?? []).filter((a) => !a.deleted).length;
    if (linked > 0) {
      throw new BadRequestException(
        `Il complesso ha ${linked} immobili collegati: scollegali prima di eliminarlo`,
      );
    }
    delete (entity as Partial<Complex>).assets;
    await this.repo.save({ ...entity, deleted: true, updated_by_user_id: userId });
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  private async assertAssets(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.assetRepo.count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) throw new BadRequestException('Uno o più immobili non esistono');
  }
}
