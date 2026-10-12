import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { ActType } from '@apis/act-types/entity/act-type.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Contract } from '@apis/contracts/entity/contract.entity';
import { partyName } from '@apis/third-parties/third-party.name';
import { AttachmentsService } from '@apis/attachments/attachments.service';
import { AttachmentEntityType } from '@apis/attachments/enum/attachment-entity-type.enum';
import { Act } from './entity/act.entity';
import { CreateActDto } from './dto/create-act.dto';
import { UpdateActDto } from './dto/update-act.dto';
import { SearchActDto } from './dto/search-act.dto';
import { ActLinkEntity, LINK_ENTITIES, LINKS } from './act-links';

// Contratto di fornitura nella risposta: id, CIG e nome del fornitore (il
// soggetto può essere una persona fisica: CF e telefono restano riservati).
export type ActContractRef = { id: number; cig_contract: string | null; supplier_name: string };
export type ActRow = Act & { file_count: number; link_count: number };

const RELATIONS = {
  actType: true,
  assets: true,
  plants: true,
  utilizerGrants: true,
  contracts: { supplier: true },
} as const;
const LINK_FIELDS: string[] = LINK_ENTITIES.map((e) => LINKS[e].idsField);

const alive = <X extends { deleted?: boolean | number }>(xs: X[] | undefined): X[] =>
  (xs ?? []).filter((x) => !x.deleted);

@Injectable()
export class ActsService extends BaseService<Act, CreateActDto, UpdateActDto> {
  protected readonly entityName = 'acts';
  protected readonly relations = ['actType', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(Act) protected readonly repo: Repository<Act>,
    @InjectRepository(ActType) private readonly typeRepo: Repository<ActType>,
    @InjectRepository(Asset) private readonly assetRepo: Repository<Asset>,
    @InjectRepository(Plant) private readonly plantRepo: Repository<Plant>,
    @InjectRepository(UtilizerGrant) private readonly grantRepo: Repository<UtilizerGrant>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly attachments: AttachmentsService,
  ) {
    super();
  }

  private targetRepo(entity: ActLinkEntity): Repository<{ id: number; deleted: boolean }> {
    const repos = {
      asset: this.assetRepo,
      plant: this.plantRepo,
      utilizer_grant: this.grantRepo,
      contract: this.contractRepo,
    };
    return repos[entity] as unknown as Repository<{ id: number; deleted: boolean }>;
  }

  // Collegamenti senza i cancellati, conteggi di file e collegamenti.
  private async toRows(list: Act[]): Promise<ActRow[]> {
    const files = await this.attachments.countByEntity(
      AttachmentEntityType.ACT,
      list.map((a) => a.id),
    );
    return list.map((a) => {
      const cleaned = { ...a } as Record<string, unknown>;
      let links = 0;
      for (const e of LINK_ENTITIES) {
        const rel = LINKS[e].relation;
        const kept = alive((a as never)[rel]);
        cleaned[rel] = kept;
        links += kept.length;
      }
      cleaned.contracts = (cleaned.contracts as Contract[]).map((c): ActContractRef => ({
        id: c.id,
        cig_contract: c.cig_contract ?? null,
        supplier_name: partyName(c.supplier),
      }));
      return {
        ...(cleaned as unknown as ActRow),
        file_count: files.get(a.id) ?? 0,
        link_count: links,
      };
    });
  }

  async findAll(filters: SearchActDto = {}): Promise<ActRow[]> {
    const rows = await this.toRows(
      await this.repo.find({
        where: { deleted: !!filters.deleted },
        relations: RELATIONS,
        order: { act_date: 'DESC', id: 'DESC' },
      }),
    );
    return rows.filter((a) => {
      if (filters.act_type_id && a.act_type_id !== filters.act_type_id) return false;
      if (filters.year && (a.act_date ?? '').slice(0, 4) !== String(filters.year)) return false;
      if (filters.without_files && a.file_count > 0) return false;
      if (filters.linked_to === 'none' && a.link_count > 0) return false;
      if (filters.linked_to && filters.linked_to !== 'none') {
        const rel = LINKS[filters.linked_to as ActLinkEntity].relation;
        if (!((a as never)[rel] as unknown[]).length) return false;
      }
      return true;
    });
  }

  async findOneOrFail(id: number): Promise<ActRow> {
    const a = await this.repo.findOne({
      where: { id, deleted: false },
      relations: { ...RELATIONS, created_by: true, updated_by: true },
    });
    if (!a) throw new BadRequestException('Atto non trovato');
    return (await this.toRows([a]))[0];
  }

  async byEntity(entity: ActLinkEntity, entityId: number): Promise<ActRow[]> {
    const rel = LINKS[entity].relation;
    return this.toRows(
      await this.repo.find({
        where: { deleted: false, [rel]: { id: entityId } },
        relations: RELATIONS,
        order: { act_date: 'DESC', id: 'DESC' },
      }),
    );
  }

  private withoutLinks<D extends object>(dto: D): Partial<D> {
    const rest: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
    for (const f of LINK_FIELDS) delete rest[f];
    return rest as Partial<D>;
  }

  async create(dto: CreateActDto, userId: number): Promise<ActRow> {
    await this.assertType(dto.act_type_id);
    const subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    const saved = await this.repo.save(
      this.repo.create({
        ...this.withoutLinks(dto),
        subject,
        ...links,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      } as never),
    );
    const id = (saved as unknown as Act).id;
    await this.recordAudit(AuditAction.CREATE, id, userId, this.linkAudit({}, links));
    return this.findOneOrFail(id);
  }

  async update(id: number, dto: UpdateActDto, userId: number): Promise<ActRow> {
    const current = await this.repo.findOne({
      where: { id, deleted: false },
      relations: RELATIONS,
    });
    if (!current) throw new BadRequestException('Atto non trovato');
    if (dto.act_type_id !== undefined) await this.assertType(dto.act_type_id);
    if (dto.subject !== undefined) dto.subject = this.assertSubject(dto.subject);
    const links = await this.resolveLinks(dto);
    await super.update(id, this.withoutLinks(dto) as UpdateActDto, userId);
    if (Object.keys(links).length) {
      await this.repo.save({ id, ...links, updated_by_user_id: userId } as never);
      const changes = this.linkAudit(current, links);
      if (changes.length) await this.recordAudit(AuditAction.UPDATE, id, userId, changes);
    }
    return this.findOneOrFail(id);
  }

  async remove(id: number, userId: number): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false } });
    if (!a) throw new BadRequestException('Atto non trovato');
    await this.repo.save({ id, deleted: true, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.DELETE, id, userId, []);
  }

  async restore(id: number, userId: number): Promise<ActRow> {
    const a = await this.repo.findOne({ where: { id, deleted: true } });
    if (!a) throw new BadRequestException('Atto non trovato tra gli eliminati');
    await this.repo.save({ id, deleted: false, updated_by_user_id: userId } as never);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      { fieldName: 'deleted', oldValue: true, newValue: false },
    ]);
    return this.findOneOrFail(id);
  }

  link(id: number, entity: ActLinkEntity, entityId: number, userId: number): Promise<void> {
    return this.changeLink(id, entity, entityId, userId, true);
  }

  unlink(id: number, entity: ActLinkEntity, entityId: number, userId: number): Promise<void> {
    return this.changeLink(id, entity, entityId, userId, false);
  }

  private async changeLink(
    id: number,
    entity: ActLinkEntity,
    entityId: number,
    userId: number,
    add: boolean,
  ): Promise<void> {
    const a = await this.repo.findOne({ where: { id, deleted: false }, relations: RELATIONS });
    if (!a) throw new BadRequestException('Atto non trovato');
    const rel = LINKS[entity].relation;
    const before = ((a as never)[rel] as { id: number }[]).map((x) => x.id);
    if (add === before.includes(entityId)) return;
    if (add) await this.assertTargets(entity, [entityId]);
    const after = add ? [...before, entityId] : before.filter((x) => x !== entityId);
    await this.repo.save({
      id,
      [rel]: after.map((x) => ({ id: x })),
      updated_by_user_id: userId,
    } as never);
    await this.recordAudit(AuditAction.UPDATE, id, userId, [
      {
        fieldName: LINKS[entity].idsField,
        oldValue: this.sorted(before),
        newValue: this.sorted(after),
      },
    ]);
  }

  private sorted(ids: number[]): string {
    return [...ids].sort((a, b) => a - b).join(',');
  }

  private async assertType(typeId: number): Promise<void> {
    const t = await this.typeRepo.findOne({ where: { id: typeId, deleted: false } });
    if (!t) throw new BadRequestException('Tipo di atto non trovato');
  }

  private assertSubject(subject: string | undefined): string {
    const s = (subject ?? '').trim();
    if (!s) throw new BadRequestException("L'oggetto è obbligatorio");
    return s;
  }

  private async assertTargets(entity: ActLinkEntity, ids: number[]): Promise<void> {
    if (!ids.length) return;
    const unique = [...new Set(ids)];
    const found = await this.targetRepo(entity).count({
      where: { id: In(unique), deleted: false },
    });
    if (found !== unique.length)
      throw new BadRequestException(`${LINKS[entity].label} non trovato`);
  }

  // Solo i campi *_ids presenti nel DTO diventano relazioni da salvare.
  private async resolveLinks(
    dto: Partial<CreateActDto>,
  ): Promise<Record<string, { id: number }[]>> {
    const out: Record<string, { id: number }[]> = {};
    for (const e of LINK_ENTITIES) {
      const ids = (dto as Record<string, unknown>)[LINKS[e].idsField] as number[] | undefined;
      if (ids === undefined) continue;
      await this.assertTargets(e, ids);
      out[LINKS[e].relation] = [...new Set(ids)].map((id) => ({ id }));
    }
    return out;
  }

  private linkAudit(current: Partial<Act>, links: Record<string, { id: number }[]>) {
    const changes: { fieldName: string; oldValue: unknown; newValue: unknown }[] = [];
    for (const e of LINK_ENTITIES) {
      const rel = LINKS[e].relation;
      if (!(rel in links)) continue;
      const before = this.sorted(
        (((current as never)[rel] as { id: number }[]) ?? []).map((x) => x.id),
      );
      const after = this.sorted(links[rel].map((x) => x.id));
      if (before !== after) {
        changes.push({ fieldName: LINKS[e].idsField, oldValue: before, newValue: after });
      }
    }
    return changes;
  }
}
