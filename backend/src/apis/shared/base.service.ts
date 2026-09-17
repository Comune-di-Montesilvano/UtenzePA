import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  RequestTimeoutException,
} from '@nestjs/common';
import { FindOptionsRelations, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { DateHelper } from '@/helpers/date.helpers';
import { AuditLogService, AuditFieldChange } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';

export interface BaseEntity extends ObjectLiteral {
  id: number;
  deleted: boolean;
  updated_by_user_id: number;
}

// TypeORM 1.0 non accetta più un array di stringhe per `relations` (solo
// l'oggetto FindOptionsRelations). Le sottoclassi di BaseService continuano a
// dichiarare `relations` come string[] (nessuna modifica richiesta lì): questo
// helper converte al confine con la query, negli unici punti che passano
// `this.relations` a TypeORM (qui e in InvoicesService, che ha un findOne
// custom).
export function toFindOptionsRelations<T extends ObjectLiteral>(
  relations: string[],
): FindOptionsRelations<T> {
  const result: Record<string, unknown> = {};
  for (const relation of relations) {
    const parts = relation.split('.');
    let node = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        // Non sovrascrivere un nodo annidato già costruito da un'altra entry
        // (es. 'contratto.supplier' processata prima di un eventuale 'contratto' da solo).
        if (typeof node[part] !== 'object') node[part] = true;
      } else {
        if (typeof node[part] !== 'object') node[part] = {};
        node = node[part] as Record<string, unknown>;
      }
    }
  }
  return result as FindOptionsRelations<T>;
}

export abstract class BaseService<TEntity extends BaseEntity, TCreateDto, TUpdateDto> {
  protected abstract readonly repo: Repository<TEntity>;
  protected abstract readonly entityName: string;
  protected abstract readonly relations: string[];

  @Inject(AuditLogService)
  @Optional()
  protected auditLogService?: AuditLogService;

  // Campi extra da escludere dal diff, oltre a quelli sempre esclusi
  // (GLOBAL_AUDIT_BLOCKLIST sotto). Es. system-users: password_hash/otp.
  protected auditBlocklist: string[] = [];

  // Mappa esplicita campo → { repo, field } per risolvere un id FK a
  // un'etichetta leggibile nel diff — MAI euristica automatica (vedi nota
  // CLAUDE.md sul bug AssetAggregator.description vs .code). Campi non
  // mappati restano con solo il valore grezzo (id).
  protected auditLabelResolvers?: Partial<
    Record<string, { repo: Repository<ObjectLiteral>; field: string }>
  >;

  private static readonly GLOBAL_AUDIT_BLOCKLIST = [
    'id',
    'create_date',
    'update_date',
    'deleted',
    'created_by_user_id',
    'updated_by_user_id',
  ];

  async findAll(): Promise<TEntity[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.where(`${alias}.deleted = :deleted`, { deleted: false });
    return qb.orderBy(`${alias}.id`, 'ASC').getMany();
  }

  findOne(id: number): Promise<TEntity | null> {
    return this.repo.findOne({
      where: { id } as never,
      relations: toFindOptionsRelations<TEntity>(this.relations),
    });
  }

  async create(dto: TCreateDto, userId?: number): Promise<TEntity> {
    const payload: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
    if (userId !== undefined) {
      payload.created_by_user_id = userId;
      payload.updated_by_user_id = userId;
    }
    const item = this.repo.create(payload as never);
    let saved: TEntity;
    try {
      saved = (await this.repo.save(item)) as unknown as TEntity;
    } catch (error) {
      this.manageErrors(error, `Errore durante la creazione di ${this.entityName}`);
    }
    // Fuori dal try/catch di persistenza: un fallimento nella scrittura audit
    // (best-effort, vedi recordAudit) non deve mai mascherare l'esito
    // dell'operazione primaria già andata a buon fine.
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return saved;
  }

  async update(id: number, updateDto: TUpdateDto, userId?: number): Promise<TEntity> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) {
      throw new BadRequestException('elemento non trovato');
    }
    const before: Record<string, unknown> = { ...(entity as unknown as Record<string, unknown>) };
    Object.assign(entity, updateDto);
    if (userId !== undefined) {
      entity.updated_by_user_id = userId;
    }
    let result: TEntity;
    try {
      await this.repo.save(entity);
      result = await this.findOne(id);
    } catch (error) {
      this.manageErrors(error, `Errore durante l'aggiornamento di ${this.entityName}`);
    }
    // Fuori dal try/catch di persistenza, con la propria gestione errori
    // (dentro diffFields/recordAudit) che non tocca manageErrors: il calcolo
    // del diff/la scrittura audit sono best-effort, non devono far fallire
    // un update già persistito correttamente.
    try {
      const changes = await this.diffFields(
        before,
        entity as unknown as Record<string, unknown>,
        updateDto as Record<string, unknown>,
      );
      await this.recordAudit(AuditAction.UPDATE, id, userId ?? entity.updated_by_user_id, changes);
    } catch (error) {
      console.error(
        `[BaseService] Errore durante il calcolo/registrazione audit per ${this.entityName}`,
        error,
      );
    }
    return result;
  }

  async count(): Promise<number> {
    const alias = this.entityName;
    return this.repo
      .createQueryBuilder(alias)
      .where(`${alias}.deleted = :deleted`, { deleted: false })
      .getCount();
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new BadRequestException('elemento non trovato');
    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
    // Best-effort: un fallimento della scrittura audit non deve propagarsi e
    // apparire come un delete fallito, mentre la entity è già stata salvata.
    try {
      await this.recordAudit(AuditAction.DELETE, id, updatedByUserId, []);
    } catch (error) {
      console.error(`[BaseService] Errore durante la registrazione audit per ${this.entityName}`, error);
    }
  }

  protected applyFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    filters: Record<string, any>,
    alias: string,
    exclude: string[] = [],
  ): void {
    for (const [key, value] of Object.entries(filters)) {
      if (exclude.includes(key)) continue;
      if (value === undefined || value === null) continue;

      if (key.endsWith('_range')) {
        const range = value as (string | null)[];
        const column = key.replace(/_range$/, '');
        if (range[0]) {
          qb.andWhere(`${alias}.${column} >= :${column}_range_start`, {
            [`${column}_range_start`]: DateHelper.mysqlDate(new Date(range[0])),
          });
        }
        if (range[1]) {
          qb.andWhere(`${alias}.${column} <= :${column}_range_end`, {
            [`${column}_range_end`]: DateHelper.mysqlDate(new Date(range[1])),
          });
        }
        continue;
      }

      if (typeof value === 'boolean') {
        qb.andWhere(`${alias}.${key} = :filter_${key}`, { [`filter_${key}`]: value ? 1 : 0 });
        continue;
      }

      if (value instanceof Date) {
        qb.andWhere(`DATE(${alias}.${key}) = DATE(:filter_${key})`, {
          [`filter_${key}`]: DateHelper.mysqlDate(value),
        });
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        qb.andWhere(`${alias}.${key} LIKE :filter_${key}`, {
          [`filter_${key}`]: `%${trimmed}%`,
        });
        continue;
      }

      if (typeof value === 'number') {
        qb.andWhere(`${alias}.${key} = :filter_${key}`, { [`filter_${key}`]: value });
      }
    }
  }

  manageErrors(error: any, message: string): never {
    const code = error?.code ?? error?.driverError?.code;
    const errno = error?.errno ?? error?.driverError?.errno;
    if (code === 'ER_DUP_ENTRY' || errno === 1062) {
      throw new ConflictException(
        'Elemento duplicato: esiste già un elemento con gli stessi dati.',
      );
    }
    switch (code) {
      case 'ECONNREFUSED':
        throw new RequestTimeoutException();
      default:
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
    }
  }

  protected async diffFields(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    patch: Record<string, unknown>,
  ): Promise<AuditFieldChange[]> {
    const blocklist = new Set([...BaseService.GLOBAL_AUDIT_BLOCKLIST, ...this.auditBlocklist]);
    const changes: AuditFieldChange[] = [];

    for (const key of Object.keys(patch)) {
      if (blocklist.has(key)) continue;

      const oldValue = before[key] ?? null;
      const newValue = after[key] ?? null;
      // Colonne date/timestamp: mysql2 idrata `before` (letto via repo.findOne)
      // come istanza Date, mentre `after` (dopo Object.assign del DTO) resta
      // tipicamente una stringa ISO del client — String(Date) vs String(string
      // ISO) non coincidono mai anche a valore invariato, producendo un diff
      // spurio ad ogni update che rimanda l'intero record (pattern comune in
      // questa codebase). Normalizza le sole istanze Date a ISO prima del
      // confronto, il resto usa il confronto testuale esistente.
      if (BaseService.toComparableValue(oldValue) === BaseService.toComparableValue(newValue)) continue;

      const resolver = this.auditLabelResolvers?.[key];
      let oldLabel: string | null = null;
      let newLabel: string | null = null;
      if (resolver) {
        [oldLabel, newLabel] = await Promise.all([
          this.resolveLabel(resolver, oldValue),
          this.resolveLabel(resolver, newValue),
        ]);
      }

      changes.push({ fieldName: key, oldValue, newValue, oldLabel, newLabel });
    }

    return changes;
  }

  private async resolveLabel(
    resolver: { repo: Repository<ObjectLiteral>; field: string },
    id: unknown,
  ): Promise<string | null> {
    if (id === null || id === undefined) return null;
    const row = await resolver.repo.findOne({ where: { id } as never });
    if (!row) return null;
    const value = (row as unknown as Record<string, unknown>)[resolver.field];
    return value === null || value === undefined ? null : String(value);
  }

  protected async recordAudit(
    action: AuditAction,
    entityId: number,
    userId: number | undefined,
    fields: AuditFieldChange[],
  ): Promise<void> {
    if (!this.auditLogService || userId === undefined) return;
    if (action === AuditAction.UPDATE && fields.length === 0) return;
    try {
      await this.auditLogService.record({ entityName: this.entityName, entityId, action, userId, fields });
    } catch (error) {
      // Audit è best-effort: un fallimento qui non deve mai propagarsi e far
      // fallire/mascherare l'esito dell'operazione primaria già eseguita.
      console.error(`[BaseService] Errore durante la registrazione audit per ${this.entityName}`, error);
    }
  }

  private static toComparableValue(value: unknown): string {
    return value instanceof Date ? value.toISOString() : String(value);
  }
}
