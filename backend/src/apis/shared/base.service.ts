import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  RequestTimeoutException,
} from '@nestjs/common';
import { FindOptionsRelations, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { DateHelper } from '@/helpers/date.helpers';

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
    try {
      return (await this.repo.save(item)) as unknown as TEntity;
    } catch (error) {
      this.manageErrors(error, `Errore durante la creazione di ${this.entityName}`);
    }
  }

  async update(id: number, updateDto: TUpdateDto, userId?: number): Promise<TEntity> {
    const entity = await this.repo.findOne({ where: { id } as never });
    if (!entity) {
      throw new BadRequestException('elemento non trovato');
    }
    Object.assign(entity, updateDto);
    if (userId !== undefined) {
      entity.updated_by_user_id = userId;
    }
    try {
      await this.repo.save(entity);
      return this.findOne(id);
    } catch (error) {
      this.manageErrors(error, `Errore durante l'aggiornamento di ${this.entityName}`);
    }
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
}
