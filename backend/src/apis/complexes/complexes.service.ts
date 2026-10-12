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
      where: {
        deleted: false,
        ...(filters.complex_type ? { complex_type: filters.complex_type } : {}),
      },
      relations: { assets: true },
      order: { name: 'ASC' },
    });
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((c) =>
        [c.name, c.address, c.toponym].some((v) => (v ?? '').toLowerCase().includes(q)),
      );
    }
    // Elenco: basta il conteggio, non serve l'anagrafica di ogni immobile.
    return (await this.withCounts(rows)).map((r) => ({ ...r, assets: undefined }));
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

  async findOneOrFail(id: number): Promise<ComplexRow> {
    const c = await this.findOne(id);
    if (!c) throw new BadRequestException('Complesso non trovato');
    return c;
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
    await this.assertMefFree(rest.mef_compendium_id, null);
    const saved = (await this.repo.save(
      this.repo.create({
        ...rest,
        name: rest.name.trim(),
        created_by_user_id: userId,
        updated_by_user_id: userId,
      } as never),
    )) as unknown as Complex;
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    if (asset_ids?.length) await this.moveAssets(saved.id, asset_ids, [], userId);
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
    await this.assertMefFree(rest.mef_compendium_id, id);
    await super.update(id, rest as UpdateComplexDto, userId);
    if (asset_ids !== undefined) {
      const before = (current.assets ?? []).filter((a) => !a.deleted).map((a) => a.id);
      await this.moveAssets(id, asset_ids, before, userId);
    }
    return this.findOne(id);
  }

  // Collega gli immobili al complesso (togliendoli da quello di prima) e
  // scollega quelli non più in elenco. Audit sul complesso, sui complessi di
  // provenienza e su ogni immobile spostato.
  private async moveAssets(
    id: number,
    assetIds: number[],
    before: number[],
    userId: number,
  ): Promise<void> {
    const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b).join(',');
    const incoming = assetIds.length
      ? await this.assetRepo.find({ where: { id: In(assetIds), deleted: false } })
      : [];
    const moved = incoming.filter((a) => a.complex_id != null && a.complex_id !== id);
    const origins = [...new Set(moved.map((a) => a.complex_id as number))];
    const originBefore = new Map<number, number[]>();
    for (const o of origins) {
      const rows = await this.assetRepo.find({ where: { complex_id: o, deleted: false } });
      originBefore.set(
        o,
        rows.map((a) => a.id),
      );
    }
    const removed = before.filter((a) => !assetIds.includes(a));
    if (removed.length) {
      await this.assetRepo.update(
        { id: In(removed) },
        { complex_id: null, updated_by_user_id: userId },
      );
    }
    if (assetIds.length) {
      await this.assetRepo.update(
        { id: In(assetIds) },
        { complex_id: id, updated_by_user_id: userId },
      );
    }
    if (sorted(before) !== sorted(assetIds)) {
      await this.recordAudit(AuditAction.UPDATE, id, userId, [
        { fieldName: 'asset_ids', oldValue: sorted(before), newValue: sorted(assetIds) },
      ]);
    }
    for (const o of origins) {
      const was = originBefore.get(o) ?? [];
      const now = was.filter((a) => !assetIds.includes(a));
      await this.auditOn('complexes', o, userId, [
        { fieldName: 'asset_ids', oldValue: sorted(was), newValue: sorted(now) },
      ]);
    }
    const prev = new Map(incoming.map((a) => [a.id, a.complex_id ?? null]));
    for (const a of assetIds.filter((x) => (prev.get(x) ?? null) !== id)) {
      await this.auditOn('assets', a, userId, [
        { fieldName: 'complex_id', oldValue: prev.get(a) ?? null, newValue: id },
      ]);
    }
    for (const a of removed) {
      await this.auditOn('assets', a, userId, [
        { fieldName: 'complex_id', oldValue: id, newValue: null },
      ]);
    }
  }

  // Audit su un'altra entità (best-effort, come recordAudit).
  private async auditOn(
    entityName: string,
    entityId: number,
    userId: number,
    fields: { fieldName: string; oldValue: unknown; newValue: unknown }[],
  ): Promise<void> {
    try {
      await this.auditLogService?.record({
        entityName,
        entityId,
        action: AuditAction.UPDATE,
        userId,
        fields,
      });
    } catch (error) {
      console.error(`[ComplexesService] Errore audit su ${entityName} ${entityId}`, error);
    }
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

  // Indice unico anche tra i cancellati: errore leggibile invece del 500 del DB.
  private async assertMefFree(
    mefId: number | null | undefined,
    selfId: number | null,
  ): Promise<void> {
    if (mefId === null || mefId === undefined) return;
    const other = await this.repo.findOne({ where: { mef_compendium_id: mefId } });
    if (other && other.id !== selfId) {
      throw new BadRequestException(
        `Id compendio MEF ${mefId} già usato dal complesso «${other.name}»`,
      );
    }
  }

  private async assertAssets(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.assetRepo.count({ where: { id: In(unique), deleted: false } });
    if (found !== unique.length) throw new BadRequestException('Uno o più immobili non esistono');
  }
}
