import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { ThirdParty } from './entity/third-party.entity';
import { PartyRole } from './enum/third-party.enum';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';
import { SearchThirdPartyDto } from './dto/search-third-party.dto';
import { PartyFields, partyName } from './third-party.name';
import { normalizeParty, touchesIdentity, validateThirdParty } from './third-party.validation';
import { matchesRoles, partyRoles, RoleIndex } from './third-party.roles';

export type ThirdPartyRow = ThirdParty & { roles: PartyRole[] };

const UNIQUE_FIELDS: { field: 'vat_number' | 'tax_code'; message: string }[] = [
  { field: 'vat_number', message: 'Partita IVA già usata da' },
  { field: 'tax_code', message: 'Codice fiscale già usato da' },
];

@Injectable()
export class ThirdPartiesService extends BaseService<
  ThirdParty,
  CreateThirdPartyDto,
  UpdateThirdPartyDto
> {
  protected readonly entityName = 'third_parties';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(ThirdParty)
    protected readonly repo: Repository<ThirdParty>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  // Con un tipo di contratto restano solo le parti di almeno un contratto
  // immobiliare di quel tipo; le chip si applicano ai ruoli calcolati su quel tipo.
  async findAll(filters: SearchThirdPartyDto = {}): Promise<ThirdPartyRow[]> {
    const qb = this.repo.createQueryBuilder('tp');
    qb.leftJoinAndSelect('tp.updated_by', 'updated_by');
    qb.where('tp.deleted = :deleted', { deleted: filters.deleted ? 1 : 0 });
    if (filters.type) qb.andWhere('tp.type = :type', { type: filters.type });
    if (filters.q?.trim()) {
      qb.andWhere(
        '(tp.company_name LIKE :q OR tp.last_name LIKE :q OR tp.first_name LIKE :q OR tp.vat_number LIKE :q OR tp.tax_code LIKE :q)',
        { q: `%${filters.q.trim()}%` },
      );
    }
    const [parties, index] = await Promise.all([qb.getMany(), this.roleIndex()]);
    const wanted = filters.roles ?? [];
    return parties
      .filter((p) => {
        const roles = partyRoles(p.id, index, filters.kind);
        if (filters.kind && !roles.some((r) => r !== PartyRole.SUPPLIER)) return false;
        return matchesRoles(roles, wanted);
      })
      .map((p) => ({ ...p, roles: partyRoles(p.id, index) }))
      .sort((a, b) => partyName(a).localeCompare(partyName(b), 'it'));
  }

  async findOne(id: number): Promise<ThirdPartyRow | null> {
    const p = await super.findOne(id);
    return p ? { ...p, roles: partyRoles(p.id, await this.roleIndex()) } : null;
  }

  async create(dto: CreateThirdPartyDto, userId?: number): Promise<ThirdParty> {
    const clean = normalizeParty(dto);
    this.assertValid(clean);
    await this.assertUnique(clean, null);
    return super.create(clean, userId);
  }

  async update(id: number, dto: UpdateThirdPartyDto, userId?: number): Promise<ThirdParty> {
    const current = await this.repo.findOne({ where: { id } });
    if (!current) throw new BadRequestException('Soggetto non trovato');
    const clean = normalizeParty(dto);
    if (touchesIdentity(clean)) {
      const merged = { ...current, ...clean };
      this.assertValid(merged);
      await this.assertUnique(merged, id);
    }
    return super.update(id, clean, userId);
  }

  private assertValid(p: PartyFields): void {
    const error = validateThirdParty(p);
    if (error) throw new BadRequestException(error);
  }

  // Controllo esplicito per un messaggio leggibile; il vincolo unique del DB
  // resta la garanzia (ER_DUP_ENTRY → 400 in BaseService.manageErrors).
  private async assertUnique(p: PartyFields, id: number | null): Promise<void> {
    for (const { field, message } of UNIQUE_FIELDS) {
      const value = p[field];
      if (!value) continue;
      const other = await this.repo.findOne({ where: { [field]: value } });
      if (other && other.id !== id) {
        throw new BadRequestException(
          `${message} ${partyName(other)}${other.deleted ? ' (eliminato)' : ''}.`,
        );
      }
    }
  }

  private async roleIndex(): Promise<RoleIndex> {
    const suppliers: { id: number }[] = await this.dataSource.query(
      `SELECT supplier_id_fk AS id FROM contracts WHERE deleted = 0 AND supplier_id_fk IS NOT NULL
       UNION SELECT supplier_id AS id FROM consip_agreement WHERE deleted = 0`,
    );
    const grants: RoleIndex['grants'] = await this.dataSource.query(
      `SELECT gp.third_party_id AS party_id, g.direction, g.kind
         FROM utilizer_grant_parties gp
         JOIN utilizer_grant g ON g.id = gp.utilizer_grant_id AND g.deleted = 0`,
    );
    return {
      suppliers: new Set(suppliers.map((s) => Number(s.id))),
      grants: grants.map((g) => ({ ...g, party_id: Number(g.party_id) })),
    };
  }
}
