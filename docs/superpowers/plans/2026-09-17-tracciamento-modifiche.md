# Tracciamento modifiche (audit log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tracciare create/update/delete su tutte le entity gestite da `BaseService`, esporle come widget storico nei dettagli (immobile/utenza/ecc.) e come log globale admin-only, con retention 60gg sui diff.

**Architecture:** Hook centralizzato in `BaseService.create/update/remove` (non subscriber TypeORM globale) che scrive righe in una nuova tabella `audit_logs` tramite `AuditLogService` iniettato via property injection (`@Inject`) — così i 14 service esistenti non cambiano firma. Un endpoint generico `GET /audit-log` serve sia il widget (per singolo record) sia il log globale (solo Admin). Cronjob giornaliero (pattern imperativo `SchedulerRegistry`) elimina i diff con più di 60 giorni.

**Tech Stack:** NestJS 11 + TypeORM (MySQL) backend, Angular 22 + Material standalone components frontend, Jest per i test backend.

**Spec:** `docs/superpowers/specs/2026-09-17-tracciamento-modifiche-design.md`

## Global Constraints

- Retention: righe di diff (`field_name` valorizzato) più vecchie di 60 giorni vengono eliminate da un cronjob giornaliero. Le righe CREATE/DELETE non hanno questo vincolo nello schema (nessun `field_name`), ma la query di purge le lascia intatte per ora (fuori scope ridurle ulteriormente).
- Cronjob: SEMPRE pattern imperativo `SchedulerRegistry.addCronJob()` in `onModuleInit()`, mai `@Cron()` — `@nestjs/schedule@12` è ESM-only e rompe jest se importato staticamente in un file coperto da spec.
- Blocklist campi mai loggati: `id`, `create_date`, `update_date`, `deleted`, `created_by_user_id`, `updated_by_user_id` sempre esclusi dal diff (globale, in `BaseService`); più `password_hash`, `otp`, `otp_expiry` su `system-users` (blocklist specifica).
- Risoluzione label FK: SEMPRE tramite mappa esplicita `{ campo: { repo, field } }` dichiarata dal service — mai euristica automatica su nomi colonna (vedi bug reale `AssetAggregator.description` vs `code` in CLAUDE.md).
- Endpoint unico generico `GET /api/v1/audit-log`, non uno per modulo.
- Log globale (query senza `entityId`) accessibile solo a `role === 'Admin'`; storico di un singolo record (`entityId` presente) accessibile a qualunque utente autenticato.

---

## File Structure

**Backend — nuovo modulo `audit-log`:**
- `backend/src/apis/audit-log/entity/audit-log.entity.ts` — entity `AuditLog` + enum `AuditAction`
- `backend/src/database/migrations/<timestamp>-CreateAuditLogs.ts` — migration tabella
- `backend/src/apis/audit-log/audit-log.service.ts` — scrittura righe + query paginata + purge retention
- `backend/src/apis/audit-log/dto/query-audit-log.dto.ts` — DTO validazione query params
- `backend/src/apis/audit-log/audit-log.controller.ts` — endpoint generico + guardia admin-only sul log globale
- `backend/src/apis/audit-log/audit-log.module.ts` — `@Global()`, registra cronjob retention
- `backend/src/apis/audit-log/audit-log.service.spec.ts`, `audit-log.controller.spec.ts` — test

**Backend — modifiche a file esistenti:**
- `backend/src/apis/shared/base.service.ts` — hook audit in create/update/remove, diff, blocklist, label resolver
- `backend/src/apis/shared/base.service.spec.ts` — nuovi test per il diff/audit
- `backend/src/apis/system-users/system-users.service.ts` — blocklist campi sensibili, `create()` delega a `super.create()`
- `backend/src/apis/asset/assets.service.ts` + `assets.module.ts` — mappa label per `asset_type_id` (esempio di riferimento)
- `backend/src/app.module.ts` — import `AuditLogModule`

**Frontend — nuovi file:**
- `frontend/src/app/core/entities/audit-log-entry.entity.ts` — interfaccia risposta API
- `frontend/src/app/services/audit-log.service.ts` — chiamate HTTP (pattern `PhotosService`, non estende `AbstractService`)
- `frontend/src/app/core/components/entity-history.component.ts` (+ `.html`, `.scss`) — widget riusabile
- `frontend/src/app/pages/audit-log/audit-log-page.component.ts` (+ `.html`) — pagina log globale (Impostazioni)

**Frontend — modifiche a file esistenti:**
- `frontend/src/app/pages/assets/asset-edit-dialog.component.ts` + `.html` — nuovo tab "Storico"
- `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts` + `.html` — nuovo tab "Storico"
- `frontend/src/app/app.routes.ts` — route `/audit-log`
- `frontend/src/app/comp/sidebar/sidebar.component.ts` — voce menu in "Impostazioni"

---

### Task 1: Entity `AuditLog` + migration

**Files:**
- Create: `backend/src/apis/audit-log/entity/audit-log.entity.ts`
- Create: `backend/src/database/migrations/<timestamp>-CreateAuditLogs.ts`

**Interfaces:**
- Produces: `AuditLog` entity (colonne: `id, entity_name, entity_id, action, field_name, old_value, new_value, old_label, new_label, user_id, created_at, user` relation), `AuditAction` enum (`CREATE`, `UPDATE`, `DELETE`).

- [ ] **Step 1: Creare l'entity**

```ts
// backend/src/apis/audit-log/entity/audit-log.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

@Entity('audit_logs')
@Index(['entity_name', 'entity_id'])
@Index(['entity_name', 'user_id'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 100 })
  entity_name: string;

  @Column({ type: 'int' })
  entity_id: number;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ length: 100, nullable: true })
  field_name: string | null;

  @Column({ type: 'text', nullable: true })
  old_value: string | null;

  @Column({ type: 'text', nullable: true })
  new_value: string | null;

  @Column({ type: 'text', nullable: true })
  old_label: string | null;

  @Column({ type: 'text', nullable: true })
  new_label: string | null;

  @Column({ type: 'int' })
  user_id: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'user_id' })
  user: SystemUser;
}
```

- [ ] **Step 2: Generare la migration (dentro il container, sempre — vedi CLAUDE.md)**

Con i container dev su (`docker compose up -d`), da root repo:

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate src/database/migrations/CreateAuditLogs -d src/database/data-source.ts
```

Verificare che il file generato contenga **solo** la creazione di `audit_logs` (colonne/indici come sopra) — nessun drift su altre tabelle (vedi nota CLAUDE.md: se presente drift preesistente, rigenerare con l'entity nuova isolata, confrontare, tenere solo lo statement `CREATE TABLE audit_logs` + i due indici). Atteso, per confronto (non da copiare a mano — verifica che l'output generato sia equivalente):

```sql
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entity_name` varchar(100) NOT NULL,
  `entity_id` int NOT NULL,
  `action` enum ('CREATE','UPDATE','DELETE') NOT NULL,
  `field_name` varchar(100) NULL,
  `old_value` text NULL,
  `new_value` text NULL,
  `old_label` text NULL,
  `new_label` text NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX `IDX_entity_name_entity_id` (`entity_name`, `entity_id`),
  INDEX `IDX_entity_name_user_id` (`entity_name`, `user_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB
```

- [ ] **Step 3: Riavviare il container `api` per applicare la migration**

```bash
docker restart utenzepa-api-1
```

Verifica: `docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD>' mydatabase -e "SHOW TABLES LIKE 'audit_logs';"` mostra la tabella.

- [ ] **Step 4: Commit**

```bash
git add backend/src/apis/audit-log/entity/audit-log.entity.ts backend/src/database/migrations/
git commit -m "feat(audit-log): aggiungi entity e migration audit_logs"
```

---

### Task 2: `AuditLogService` — scrittura, query, retention

**Files:**
- Create: `backend/src/apis/audit-log/audit-log.service.ts`
- Test: `backend/src/apis/audit-log/audit-log.service.spec.ts`

**Interfaces:**
- Consumes: `AuditLog`, `AuditAction` da Task 1.
- Produces: `AuditLogService.record(input: RecordChangeInput): Promise<void>`, `AuditLogService.query(filters: QueryFilters): Promise<{items, total, page, pageSize}>`, `AuditLogService.purgeOlderThan(days: number): Promise<number>`, tipo esportato `AuditFieldChange { fieldName: string; oldValue: unknown; newValue: unknown; oldLabel?: string | null; newLabel?: string | null }` — usato da `BaseService` in Task 5.

- [ ] **Step 1: Scrivere il test per `record()` (evento CREATE/DELETE, senza campi)**

```ts
// backend/src/apis/audit-log/audit-log.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditAction } from './entity/audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: { create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditLogService, { provide: getRepositoryToken(AuditLog), useValue: repo }],
    }).compile();
    service = moduleRef.get(AuditLogService);
  });

  it('registra un evento CREATE come riga singola senza diff', async () => {
    await service.record({ entityName: 'assets', entityId: 42, action: AuditAction.CREATE, userId: 1 });

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        entity_name: 'assets',
        entity_id: 42,
        action: AuditAction.CREATE,
        field_name: null,
        user_id: 1,
      }),
    ]);
  });

  it('registra un evento UPDATE come una riga per campo cambiato', async () => {
    await service.record({
      entityName: 'assets',
      entityId: 42,
      action: AuditAction.UPDATE,
      userId: 1,
      fields: [
        { fieldName: 'asset_name', oldValue: 'A', newValue: 'B' },
        { fieldName: 'asset_type_id', oldValue: 1, newValue: 2, oldLabel: 'SCUOLE', newLabel: 'UFFICI' },
      ],
    });

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({ field_name: 'asset_name', old_value: 'A', new_value: 'B' }),
      expect.objectContaining({
        field_name: 'asset_type_id',
        old_value: '1',
        new_value: '2',
        old_label: 'SCUOLE',
        new_label: 'UFFICI',
      }),
    ]);
  });

  it('non scrive nulla per un UPDATE senza campi', async () => {
    await service.record({ entityName: 'assets', entityId: 42, action: AuditAction.UPDATE, userId: 1, fields: [] });

    expect(repo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test, verificare che fallisca**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/audit-log/audit-log.service.spec.ts --maxWorkers=2
```
Atteso: FAIL, `Cannot find module './audit-log.service'`.

- [ ] **Step 3: Implementare `AuditLogService`**

```ts
// backend/src/apis/audit-log/audit-log.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entity/audit-log.entity';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

export interface AuditFieldChange {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  oldLabel?: string | null;
  newLabel?: string | null;
}

export interface RecordChangeInput {
  entityName: string;
  entityId: number;
  action: AuditAction;
  userId: number;
  fields?: AuditFieldChange[];
}

export interface AuditLogQueryResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async record(input: RecordChangeInput): Promise<void> {
    if (input.action === AuditAction.UPDATE) {
      if (!input.fields || input.fields.length === 0) return;
      const rows = input.fields.map((f) =>
        this.repo.create({
          entity_name: input.entityName,
          entity_id: input.entityId,
          action: input.action,
          field_name: f.fieldName,
          old_value: this.stringify(f.oldValue),
          new_value: this.stringify(f.newValue),
          old_label: f.oldLabel ?? null,
          new_label: f.newLabel ?? null,
          user_id: input.userId,
        }),
      );
      await this.repo.save(rows);
      return;
    }

    await this.repo.save([
      this.repo.create({
        entity_name: input.entityName,
        entity_id: input.entityId,
        action: input.action,
        field_name: null,
        old_value: null,
        new_value: null,
        old_label: null,
        new_label: null,
        user_id: input.userId,
      }),
    ]);
  }

  async query(filters: QueryAuditLogDto): Promise<AuditLogQueryResult> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 10;

    const qb = this.repo
      .createQueryBuilder('audit_logs')
      .leftJoinAndSelect('audit_logs.user', 'user')
      .where('audit_logs.entity_name = :entityName', { entityName: filters.entity });

    if (filters.entityId !== undefined) {
      qb.andWhere('audit_logs.entity_id = :entityId', { entityId: filters.entityId });
    }
    if (filters.userId !== undefined) {
      qb.andWhere('audit_logs.user_id = :userId', { userId: filters.userId });
    }
    if (filters.dateFrom) {
      qb.andWhere('audit_logs.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('audit_logs.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    qb.orderBy('audit_logs.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  private stringify(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }
}
```

- [ ] **Step 4: Eseguire il test, verificare che passi**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/audit-log/audit-log.service.spec.ts --maxWorkers=2
```
Atteso: PASS (3 test).

- [ ] **Step 5: Test per `purgeOlderThan`**

Aggiungere al file di test:

```ts
describe('purgeOlderThan', () => {
  it('esegue la delete con il cutoff calcolato e ritorna il numero di righe rimosse', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 5 });
    const qb = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute,
    };
    repo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.purgeOlderThan(60);

    expect(qb.where).toHaveBeenCalledWith('created_at < :cutoff', { cutoff: expect.any(Date) });
    expect(result).toBe(5);
  });
});
```

Eseguire di nuovo lo stesso comando jest — atteso PASS (4 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/audit-log/audit-log.service.ts backend/src/apis/audit-log/audit-log.service.spec.ts
git commit -m "feat(audit-log): AuditLogService (record/query/purge)"
```

---

### Task 3: DTO + `AuditLogController`

**Files:**
- Create: `backend/src/apis/audit-log/dto/query-audit-log.dto.ts`
- Create: `backend/src/apis/audit-log/audit-log.controller.ts`
- Test: `backend/src/apis/audit-log/audit-log.controller.spec.ts`

**Interfaces:**
- Consumes: `AuditLogService` (Task 2).
- Produces: `GET /api/v1/audit-log` — `entity` (obbligatorio), `entityId`/`userId`/`dateFrom`/`dateTo`/`page`/`pageSize` opzionali. 403 se `entityId` assente e utente non Admin.

- [ ] **Step 1: DTO**

```ts
// backend/src/apis/audit-log/dto/query-audit-log.dto.ts
import { Transform } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

const toOptionalInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class QueryAuditLogDto {
  @IsString()
  entity: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  entityId?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
```

- [ ] **Step 2: Test del controller (guardia sul log globale)**

```ts
// backend/src/apis/audit-log/audit-log.controller.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: { query: jest.Mock };

  beforeEach(() => {
    service = { query: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }) };
    controller = new AuditLogController(service as unknown as AuditLogService);
  });

  it('consente a un Operatore di leggere lo storico di un singolo record (entityId presente)', async () => {
    await controller.find({ entity: 'assets', entityId: 42 } as any, { id: 5, role: 'Operatore' } as any);
    expect(service.query).toHaveBeenCalled();
  });

  it('blocca un Operatore che prova a leggere il log globale (entityId assente)', async () => {
    await expect(
      controller.find({ entity: 'assets' } as any, { id: 5, role: 'Operatore' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('consente a un Admin di leggere il log globale', async () => {
    await controller.find({ entity: 'assets' } as any, { id: 5, role: 'Admin' } as any);
    expect(service.query).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Eseguire il test, verificare che fallisca**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/audit-log/audit-log.controller.spec.ts --maxWorkers=2
```
Atteso: FAIL, `Cannot find module './audit-log.controller'`.

- [ ] **Step 4: Implementare il controller**

```ts
// backend/src/apis/audit-log/audit-log.controller.ts
import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { CurrentUser, ICurrentUser } from '@core/auth/decorators/current-user.decorator';
import { AuditLogService, AuditLogQueryResult } from './audit-log.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Controller('audit-log')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(private readonly service: AuditLogService) {}

  @Get()
  async find(@Query() query: QueryAuditLogDto, @CurrentUser() user: ICurrentUser): Promise<AuditLogQueryResult> {
    // entityId presente = storico di un singolo record: stesso livello di
    // accesso del GET sull'entity stessa (qualunque utente autenticato).
    // entityId assente = log globale (sfoglia tutte le righe di una
    // tabella): solo Admin. @Roles()/RolesGuard non si applica qui perché
    // la stessa route serve entrambi i casi con permessi diversi a seconda
    // del query param, non del solo handler.
    if (query.entityId === undefined && user.role !== 'Admin') {
      throw new ForbiddenException('Solo un amministratore può consultare il log globale');
    }
    return this.service.query(query);
  }
}
```

- [ ] **Step 5: Eseguire il test, verificare che passi**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/audit-log/audit-log.controller.spec.ts --maxWorkers=2
```
Atteso: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/audit-log/dto/query-audit-log.dto.ts backend/src/apis/audit-log/audit-log.controller.ts backend/src/apis/audit-log/audit-log.controller.spec.ts
git commit -m "feat(audit-log): endpoint GET /audit-log con guardia admin sul log globale"
```

---

### Task 4: `AuditLogModule` (cronjob retention) + wiring in `AppModule`

**Files:**
- Create: `backend/src/apis/audit-log/audit-log.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `AuditLogService`, `AuditLogController`, `AuditLog` (Task 1-3).
- Produces: modulo `@Global()` — `AuditLogService` disponibile ovunque senza import esplicito nei 14 moduli di dominio (usato da `BaseService`, Task 5).

- [ ] **Step 1: Creare il modulo**

```ts
// backend/src/apis/audit-log/audit-log.module.ts
import { Global, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { AuditLog } from './entity/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';

const RETENTION_DAYS = 60;

// Registrazione programmatica invece di @Cron sul service — stesso motivo
// documentato in cronjobs.module.ts/backup.module.ts: @nestjs/schedule@12 è
// ESM puro, un import statico in un file coperto da spec Jest rompe la
// suite ("SyntaxError: Unexpected token export"). L'import qui resta
// confinato al .module.ts, mai caricato dagli spec.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService],
  controllers: [AuditLogController],
  exports: [AuditLogService],
})
export class AuditLogModule implements OnModuleInit {
  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit() {
    const job = new CronJob(CronExpression.EVERY_DAY_AT_MIDNIGHT, () =>
      this.auditLogService.purgeOlderThan(RETENTION_DAYS),
    );
    this.schedulerRegistry.addCronJob('audit-log-retention', job);
    job.start();
  }
}
```

- [ ] **Step 2: Importare in `AppModule`**

In `backend/src/app.module.ts`, aggiungere l'import in cima:

```ts
import { AuditLogModule } from '@apis/audit-log/audit-log.module';
```

E aggiungere `AuditLogModule,` nell'array `imports` (subito dopo `MySqlModule,`, coerente con l'ordine "infrastruttura prima dei moduli di dominio"):

```ts
    MySqlModule,
    AuditLogModule,
    // CsvCheckerModule,
```

- [ ] **Step 3: Verifica di avvio**

```bash
docker compose up -d --build api
docker logs utenzepa-api-1 --tail 50
```
Atteso: nessun errore di risoluzione DI, container non in crash-loop (vedi nota CLAUDE.md su `HOME`/permessi se dovesse ripresentarsi il crash-loop SQLite — non atteso qui, non tocchiamo quella parte).

- [ ] **Step 4: Commit**

```bash
git add backend/src/apis/audit-log/audit-log.module.ts backend/src/app.module.ts
git commit -m "feat(audit-log): modulo globale + cronjob retention 60gg"
```

---

### Task 5: Hook audit in `BaseService` (diff, blocklist, label resolver)

**Files:**
- Modify: `backend/src/apis/shared/base.service.ts`
- Modify: `backend/src/apis/shared/base.service.spec.ts`

**Interfaces:**
- Consumes: `AuditLogService`, `AuditFieldChange`, `AuditAction` (Task 2, 1).
- Produces: `BaseService` scrive automaticamente in `audit_logs` da `create/update/remove` per QUALSIASI sottoclasse (i 14 service esistenti, zero modifiche alle loro firme). Proprietà opzionali che una sottoclasse può sovrascrivere: `protected auditBlocklist: string[]`, `protected auditLabelResolvers?: Partial<Record<string, { repo: Repository<ObjectLiteral>; field: string }>>`.

- [ ] **Step 1: Scrivere i test per il nuovo comportamento**

Aggiungere a `backend/src/apis/shared/base.service.spec.ts` (dopo l'import esistente, aggiungere `AuditAction`):

```ts
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
```

Nuovo blocco di test, dopo `describe('BaseService', ...)`:

```ts
describe('BaseService — audit', () => {
  let service: TestService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
      create: jest.fn((x) => x),
    };
    auditLogService = { record: jest.fn() };
    service = new TestService(repo as unknown as Repository<TestEntity>);
    (service as any).auditLogService = auditLogService;
  });

  it('registra un CREATE con lo userId passato', async () => {
    repo.save.mockResolvedValueOnce({ id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 });

    await service.create({ name: 'Mario' } as any, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'test', entityId: 1, action: AuditAction.CREATE, userId: 9 }),
    );
  });

  it('registra un diff per ogni campo cambiato in update, escludendo i campi in blocklist', async () => {
    const existing = { id: 1, name: 'Mario', active: true, deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue({ ...existing, name: 'Luigi' } as any);

    await service.update(1, { name: 'Luigi', updated_by_user_id: 9 } as any, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        userId: 9,
        fields: [expect.objectContaining({ fieldName: 'name', oldValue: 'Mario', newValue: 'Luigi' })],
      }),
    );
  });

  it('non registra nulla se nessun campo tracciabile è cambiato', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    repo.findOne.mockResolvedValue(existing);
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await service.update(1, { name: 'Mario' } as any, 9);

    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('registra un DELETE', async () => {
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await service.remove(1, 9);

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.DELETE, entityId: 1, userId: 9 }),
    );
  });

  it('non lancia se auditLogService non è impostato (property injection assente, es. test esistenti)', async () => {
    (service as any).auditLogService = undefined;
    const existing = { id: 1, name: 'Mario', deleted: false, updated_by_user_id: 9 };
    jest.spyOn(service, 'findOne').mockResolvedValue(existing as any);

    await expect(service.remove(1, 9)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Eseguire i test, verificare che falliscano**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/shared/base.service.spec.ts --maxWorkers=2
```
Atteso: FAIL sui nuovi test (`auditLogService.record` mai chiamato — comportamento non ancora implementato).

- [ ] **Step 3: Implementare l'hook in `base.service.ts`**

Aggiungere gli import in cima al file (dopo gli import esistenti):

```ts
import { Inject, Optional } from '@nestjs/common';
import { AuditLogService, AuditFieldChange } from '@apis/audit-log/audit-log.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
```

Nella classe `BaseService`, subito dopo le dichiarazioni `protected abstract` esistenti, aggiungere:

```ts
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
```

Sostituire il metodo `create` esistente con:

```ts
  async create(dto: TCreateDto, userId?: number): Promise<TEntity> {
    const payload: Record<string, unknown> = { ...(dto as Record<string, unknown>) };
    if (userId !== undefined) {
      payload.created_by_user_id = userId;
      payload.updated_by_user_id = userId;
    }
    const item = this.repo.create(payload as never);
    try {
      const saved = (await this.repo.save(item)) as unknown as TEntity;
      await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
      return saved;
    } catch (error) {
      this.manageErrors(error, `Errore durante la creazione di ${this.entityName}`);
    }
  }
```

Sostituire il metodo `update` esistente con:

```ts
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
    try {
      await this.repo.save(entity);
      const result = await this.findOne(id);
      const changes = await this.diffFields(
        before,
        entity as unknown as Record<string, unknown>,
        updateDto as Record<string, unknown>,
      );
      await this.recordAudit(AuditAction.UPDATE, id, userId ?? entity.updated_by_user_id, changes);
      return result;
    } catch (error) {
      this.manageErrors(error, `Errore durante l'aggiornamento di ${this.entityName}`);
    }
  }
```

Sostituire il metodo `remove` esistente con:

```ts
  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.findOne(id);
    if (!entity) throw new BadRequestException('elemento non trovato');
    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
    await this.recordAudit(AuditAction.DELETE, id, updatedByUserId, []);
  }
```

Aggiungere i tre metodi privati in fondo alla classe (prima della chiusura `}`, dopo `manageErrors`):

```ts
  private async diffFields(
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
      if (String(oldValue) === String(newValue)) continue;

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

  private async recordAudit(
    action: AuditAction,
    entityId: number,
    userId: number | undefined,
    fields: AuditFieldChange[],
  ): Promise<void> {
    if (!this.auditLogService || userId === undefined) return;
    if (action === AuditAction.UPDATE && fields.length === 0) return;
    await this.auditLogService.record({ entityName: this.entityName, entityId, action, userId, fields });
  }
```

- [ ] **Step 4: Eseguire i test, verificare che passino**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/shared/base.service.spec.ts --maxWorkers=2
```
Atteso: PASS (tutti i test, esistenti + nuovi).

- [ ] **Step 5: Eseguire l'intera suite unit interessata per regressioni**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/asset apis/utility apis/system-users --maxWorkers=2
```
Atteso: PASS — i 14 service che estendono `BaseService` non cambiano firma, `auditLogService` è `undefined` nei loro test esistenti (nessuna DI reale nei test unitari) quindi `recordAudit` fa solo `return` senza effetti.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/shared/base.service.ts backend/src/apis/shared/base.service.spec.ts
git commit -m "feat(audit-log): hook diff/audit in BaseService.create/update/remove"
```

---

### Task 6: `system-users` — blocklist campi sensibili + `create()` via `super.create()`

**Files:**
- Modify: `backend/src/apis/system-users/system-users.service.ts`
- Test: `backend/src/apis/system-users/system-users.service.spec.ts` (creare se non esiste, altrimenti estendere)

**Interfaces:**
- Consumes: `BaseService` con `auditBlocklist` (Task 5).
- Produces: nessuna nuova interfaccia pubblica — `SystemUsersService.create()` ora passa da `BaseService.create()` (prima bypassava con `repo.save` diretto, quindi l'evento CREATE non sarebbe mai stato tracciato).

- [ ] **Step 1: Verificare se esiste già uno spec file**

```bash
ls backend/src/apis/system-users/system-users.service.spec.ts 2>/dev/null || echo "non esiste"
```

- [ ] **Step 2: Scrivere/estendere il test**

Se il file non esiste, crearlo con questo contenuto minimo (se esiste già, aggiungere solo i due blocchi `describe` sotto ai test esistenti, riusando eventuali mock/setup già presenti):

```ts
// backend/src/apis/system-users/system-users.service.spec.ts
import { SystemUsersService } from './system-users.service';
import { Repository } from 'typeorm';
import { SystemUser } from './entity/system-user.entity';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

describe('SystemUsersService — audit', () => {
  let service: SystemUsersService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (x) => ({ id: 1, ...x })),
      create: jest.fn((x) => x),
    };
    service = new SystemUsersService(repo as unknown as Repository<SystemUser>);
    auditLogService = { record: jest.fn() };
    (service as any).auditLogService = auditLogService;
  });

  it('esclude password_hash/otp/otp_expiry dalla blocklist audit', () => {
    expect((service as any).auditBlocklist).toEqual(
      expect.arrayContaining(['password_hash', 'otp', 'otp_expiry']),
    );
  });

  it('create() registra un evento CREATE (passa da BaseService.create)', async () => {
    await service.create(
      { email: 'a@b.it', password: 'pwd', firstName: 'A', lastName: 'B', role: 'Operatore' } as any,
      9,
    );

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'user', action: 'CREATE', userId: 9 }),
    );
  });
});
```

- [ ] **Step 3: Eseguire il test, verificare che fallisca**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/system-users/system-users.service.spec.ts --maxWorkers=2
```
Atteso: FAIL (blocklist vuota, `create()` non chiama ancora `super.create()`).

- [ ] **Step 4: Aggiungere la blocklist e correggere `create()`**

In `backend/src/apis/system-users/system-users.service.ts`, aggiungere subito dopo `protected readonly relations: string[] = [];`:

```ts
  // password_hash/otp/otp_expiry non vanno mai nel diff audit, anche se
  // presenti nel payload di update — dati sensibili, mai testo in chiaro
  // nella storia modifiche.
  protected readonly auditBlocklist: string[] = ['password_hash', 'otp', 'otp_expiry'];
```

Sostituire il metodo `create` esistente (che ora bypassa `BaseService.create()` con un `repo.save` diretto, quindi l'evento CREATE non viene mai tracciato) con:

```ts
  async create(dto: CreateSystemUserDto, userId?: number): Promise<SystemUser> {
    const existing = await this.repo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email già registrata');
    }

    const { password, ...rest } = dto;
    const passwordHash = await bcrypt.hash(password, 10);

    return super.create({ ...rest, passwordHash } as unknown as CreateSystemUserDto, userId);
  }
```

- [ ] **Step 5: Eseguire il test, verificare che passi**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/system-users/system-users.service.spec.ts --maxWorkers=2
```
Atteso: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/system-users/system-users.service.ts backend/src/apis/system-users/system-users.service.spec.ts
git commit -m "fix(system-users): blocklist audit su campi sensibili, create() via BaseService"
```

---

### Task 7: `assets` — risoluzione label per `asset_type_id` (esempio di riferimento)

**Files:**
- Modify: `backend/src/apis/asset/assets.module.ts`
- Modify: `backend/src/apis/asset/assets.service.ts`
- Modify: `backend/src/apis/asset/assets.service.spec.ts`

**Interfaces:**
- Consumes: `auditLabelResolvers` (Task 5), `AssetAggregator` entity (`code` è la label corretta — MAI `description`, quasi sempre vuoto, vedi CLAUDE.md).

- [ ] **Step 1: Scrivere il test**

Aggiungere a `backend/src/apis/asset/assets.service.spec.ts` (adattare ai mock/setup già presenti nel file esistente — se il file istanzia già `AssetsService` con un repo mockato, riusare quel pattern):

```ts
describe('AssetsService — audit label resolver', () => {
  it('mappa asset_type_id su AssetAggregator.code, non su description', () => {
    // service costruito come nel resto del file, con assetAggregatorRepo mockato
    const resolver = (service as any).auditLabelResolvers?.asset_type_id;
    expect(resolver).toBeDefined();
    expect(resolver.field).toBe('code');
  });
});
```

(Il blocco `beforeEach`/costruzione di `service` nel file esistente va esteso per passare anche un `assetAggregatorRepo` mockato al costruttore — stesso pattern del mock esistente per `repo`/`geocodingService`.)

- [ ] **Step 2: Eseguire il test, verificare che fallisca**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/asset/assets.service.spec.ts --maxWorkers=2
```
Atteso: FAIL — `AssetsService` non accetta ancora un quarto parametro nel costruttore / `auditLabelResolvers` non definito.

- [ ] **Step 3: Iniettare il repo `AssetAggregator` e mappare la label**

In `backend/src/apis/asset/assets.module.ts`, aggiungere l'import dell'entity e registrarla in `forFeature`:

```ts
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
```

```ts
  imports: [TypeOrmModule.forFeature([Asset, AssetAggregator]), GeocodingModule],
```

In `backend/src/apis/asset/assets.service.ts`, aggiungere gli import:

```ts
import { AssetAggregator } from '@apis/asset-aggregators/entity/asset-aggregator.entity';
```

Modificare il costruttore:

```ts
  constructor(
    @InjectRepository(Asset)
    protected readonly repo: Repository<Asset>,
    private readonly geocodingService: GeocodingService,
    @InjectRepository(AssetAggregator)
    private readonly assetAggregatorRepo: Repository<AssetAggregator>,
  ) {
    super();
    // code è la label breve corretta mostrata ovunque (icone mappa/filtri);
    // description è una nota libera quasi sempre vuota — MAI usarla come
    // label (bug reale corretto altrove nel progetto, vedi
    // asset-filter-dialog.component.ts).
    this.auditLabelResolvers = {
      asset_type_id: { repo: this.assetAggregatorRepo, field: 'code' },
    };
  }
```

- [ ] **Step 4: Eseguire il test, verificare che passi**

```bash
docker exec utenzepa-api-1 pnpm exec jest apis/asset/assets.service.spec.ts --maxWorkers=2
```
Atteso: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/asset/assets.module.ts backend/src/apis/asset/assets.service.ts backend/src/apis/asset/assets.service.spec.ts
git commit -m "feat(audit-log): risoluzione label asset_type_id -> AssetAggregator.code"
```

---

### Task 8: Frontend — `AuditLogEntry` + `AuditLogService`

**Files:**
- Create: `frontend/src/app/core/entities/audit-log-entry.entity.ts`
- Create: `frontend/src/app/services/audit-log.service.ts`

**Interfaces:**
- Produces: `AuditLogService.list(entity: string, entityId: number, pageSize?: number): Observable<AuditLogPage>`, `AuditLogService.search(filters): Observable<AuditLogPage>` — usati da Task 9 e Task 12.

- [ ] **Step 1: Entity**

```ts
// frontend/src/app/core/entities/audit-log-entry.entity.ts
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLogEntry {
  id: number;
  entity_name: string;
  entity_id: number;
  action: AuditAction;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  old_label: string | null;
  new_label: string | null;
  user_id: number;
  user: { id: number; firstName: string; lastName: string } | null;
  created_at: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Service**

Servizio custom (NON estende `AbstractService` — stesso motivo di `PhotosService`: query cross-entity, non CRUD su una singola risorsa). Deve allegare esplicitamente l'header `Authorization` — nessun interceptor globale lo fa per i servizi fuori da `AbstractService` (vedi nota CLAUDE.md sul bug `BrandingService.update()`).

```ts
// frontend/src/app/services/audit-log.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AuditLogPage } from '../core/entities/audit-log-entry.entity';

export interface AuditLogFilters {
  entity: string;
  entityId?: number;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly BASE_URL = `${environment.apiUrl}/audit-log`;

  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken() || ''}` });
  }

  search(filters: AuditLogFilters): Observable<AuditLogPage> {
    let params = new HttpParams().set('entity', filters.entity);
    if (filters.entityId !== undefined) params = params.set('entityId', String(filters.entityId));
    if (filters.userId !== undefined) params = params.set('userId', String(filters.userId));
    if (filters.dateFrom) params = params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params = params.set('dateTo', filters.dateTo);
    if (filters.page !== undefined) params = params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params = params.set('pageSize', String(filters.pageSize));

    return this.http.get<AuditLogPage>(this.BASE_URL, { headers: this.getAuthHeaders(), params });
  }
}
```

- [ ] **Step 3: Verifica di compilazione**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```
Atteso: build passa (nessun consumatore ancora, ma il file deve compilare senza errori di tipo).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/entities/audit-log-entry.entity.ts frontend/src/app/services/audit-log.service.ts
git commit -m "feat(audit-log): entity e service frontend per /audit-log"
```

---

### Task 9: `EntityHistoryComponent` (widget storico riusabile)

**Files:**
- Create: `frontend/src/app/core/components/entity-history.component.ts`
- Create: `frontend/src/app/core/components/entity-history.component.html`
- Create: `frontend/src/app/core/components/entity-history.component.scss`

**Interfaces:**
- Consumes: `AuditLogService.search()` (Task 8).
- Produces: selector `app-entity-history`, input `entity: string` (required), `entityId: number` (required), `lastModifiedBy: string | null` (opzionale — se non passato, l'header "ultima modifica" non viene mostrato), `lastModifiedAt: string | null`. Usato da Task 10 e 11.

- [ ] **Step 1: Componente**

Pattern ricalcato su `PhotoGalleryComponent` (stesso tipo di widget: input `entityId`, `ngOnInit`/`ngOnChanges` che ricaricano, stato locale semplice).

```ts
// frontend/src/app/core/components/entity-history.component.ts
import {
  Component,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { AuditLogService } from '../../services/audit-log.service';
import { AuditLogEntry } from '../entities/audit-log-entry.entity';

const HISTORY_PAGE_SIZE = 10;

@Component({
  selector: 'app-entity-history',
  standalone: true,
  imports: [CommonModule, DatePipe, MatIconModule, MatExpansionModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './entity-history.component.html',
  styleUrls: ['./entity-history.component.scss'],
})
export class EntityHistoryComponent implements OnInit, OnChanges {
  @Input({ required: true }) entity!: string;
  @Input({ required: true }) entityId!: number;
  @Input() lastModifiedBy: string | null = null;
  @Input() lastModifiedAt: string | null = null;

  private auditLogService = inject(AuditLogService);

  entries: AuditLogEntry[] = [];
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityId'] && !changes['entityId'].firstChange) {
      this.load();
    }
  }

  actionLabel(entry: AuditLogEntry): string {
    if (entry.action === 'CREATE') return 'Creato';
    if (entry.action === 'DELETE') return 'Eliminato';
    return `Modificato — ${entry.field_name}`;
  }

  displayValue(value: string | null, label: string | null): string {
    if (label) return label;
    if (value === null || value === '') return '—';
    return value;
  }

  private load(): void {
    if (!this.entityId) return;
    this.loading = true;
    this.auditLogService
      .search({ entity: this.entity, entityId: this.entityId, pageSize: HISTORY_PAGE_SIZE })
      .subscribe({
        next: (page) => {
          this.entries = page.items;
          this.loading = false;
        },
        error: () => {
          this.entries = [];
          this.loading = false;
        },
      });
  }
}
```

- [ ] **Step 2: Template**

```html
<!-- frontend/src/app/core/components/entity-history.component.html -->
<div class="entity-history">
  @if (lastModifiedBy) {
    <div class="entity-history__last-modified">
      <mat-icon>history</mat-icon>
      <span>Ultima modifica: {{ lastModifiedBy }}{{ lastModifiedAt ? ' il ' + (lastModifiedAt | date:'dd/MM/yyyy HH:mm') : '' }}</span>
    </div>
  }

  @if (loading) {
    <div class="entity-history__loading">Caricamento storico...</div>
  } @else if (entries.length === 0) {
    <div class="entity-history__empty">Nessuna modifica registrata.</div>
  } @else {
    <mat-accordion multi="false">
      @for (entry of entries; track entry.id) {
        <mat-expansion-panel [disabled]="entry.action !== 'UPDATE'">
          <mat-expansion-panel-header>
            <mat-panel-title>
              <mat-icon class="entity-history__icon">{{ entry.action === 'CREATE' ? 'add_circle' : entry.action === 'DELETE' ? 'delete' : 'edit' }}</mat-icon>
              {{ actionLabel(entry) }}
            </mat-panel-title>
            <mat-panel-description>
              {{ entry.user ? entry.user.firstName + ' ' + entry.user.lastName : 'Utente ' + entry.user_id }}
              — {{ entry.created_at | date:'dd/MM/yyyy HH:mm' }}
            </mat-panel-description>
          </mat-expansion-panel-header>
          @if (entry.action === 'UPDATE') {
            <div class="entity-history__diff">
              <span class="entity-history__diff-old">{{ displayValue(entry.old_value, entry.old_label) }}</span>
              <mat-icon>arrow_forward</mat-icon>
              <span class="entity-history__diff-new">{{ displayValue(entry.new_value, entry.new_label) }}</span>
            </div>
          }
        </mat-expansion-panel>
      }
    </mat-accordion>
  }
</div>
```

- [ ] **Step 3: Stili minimi**

```scss
// frontend/src/app/core/components/entity-history.component.scss
.entity-history {
  &__last-modified {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    color: var(--mat-sys-on-surface-variant, #666);
    font-size: 0.875rem;
  }

  &__loading,
  &__empty {
    color: var(--mat-sys-on-surface-variant, #666);
    font-size: 0.875rem;
    padding: 0.5rem 0;
  }

  &__icon {
    margin-right: 0.5rem;
  }

  &__diff {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  &__diff-old {
    text-decoration: line-through;
    color: var(--mat-sys-error, #b00020);
  }

  &__diff-new {
    color: var(--mat-sys-primary, #1a73e8);
    font-weight: 500;
  }
}
```

- [ ] **Step 4: Verifica di compilazione**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```
Atteso: build passa.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/components/entity-history.component.ts frontend/src/app/core/components/entity-history.component.html frontend/src/app/core/components/entity-history.component.scss
git commit -m "feat(audit-log): widget riusabile EntityHistoryComponent"
```

---

### Task 10: Integrare il widget nel dialog immobile

**Files:**
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.html`

**Interfaces:**
- Consumes: `EntityHistoryComponent` (Task 9).

- [ ] **Step 1: Importare il componente**

In `asset-edit-dialog.component.ts`, aggiungere l'import (vicino a `PhotoGalleryComponent`):

```ts
import { EntityHistoryComponent } from '../../core/components/entity-history.component';
```

Aggiungere `EntityHistoryComponent` all'array `imports` del `@Component`.

- [ ] **Step 2: Aggiungere il tab nel template**

In `asset-edit-dialog.component.html`, subito dopo la chiusura del tab "Foto" (dopo `</mat-tab>` alla riga 215, prima del `@for (tab of tabs...)`):

```html
    <mat-tab label="Storico" [disabled]="isNew">
      <ng-template mat-tab-label>
        <mat-icon style="margin-right: 5px;">history</mat-icon>
        Storico
      </ng-template>
      <ng-template matTabContent>
        <div style="padding: 1rem 0;">
          <app-entity-history
            [entity]="'assets'"
            [entityId]="data.item.id"
            [lastModifiedBy]="data.item.updated_by ? data.item.updated_by.firstName + ' ' + data.item.updated_by.lastName : null"
            [lastModifiedAt]="data.item.update_date ? data.item.update_date.toString() : null">
          </app-entity-history>
        </div>
      </ng-template>
    </mat-tab>
```

- [ ] **Step 3: Verifica di compilazione**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```
Atteso: build passa (il binding template-type-checking su `data.item.updated_by`/`.update_date` va verificato qui: `ng build` cattura errori che `tsc --noEmit` non vede, vedi nota CLAUDE.md).

- [ ] **Step 4: Verifica manuale in browser**

```bash
docker compose up -d
```
Aprire http://localhost:4300, login, aprire il dettaglio di un immobile esistente, verificare: tab "Storico" presente e non disabilitato, mostra "Ultima modifica" in testa, elenco eventi (se il seed ha già dati) o "Nessuna modifica registrata", nessun errore console.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html
git commit -m "feat(audit-log): tab Storico nel dialog immobile"
```

---

### Task 11: Integrare il widget nel dialog utenza

**Files:**
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`

**Interfaces:**
- Consumes: `EntityHistoryComponent` (Task 9).

- [ ] **Step 1: Importare il componente**

In `utility-edit-dialog.component.ts`, aggiungere l'import e includerlo nell'array `imports` del `@Component` (stesso punto di `PhotoGalleryComponent`):

```ts
import { EntityHistoryComponent } from '../../core/components/entity-history.component';
```

- [ ] **Step 2: Individuare il tab "Foto" nel template e aggiungere "Storico" subito dopo**

Cercare in `utility-edit-dialog.component.html` il blocco `<mat-tab label="Foto" ...>` (stesso pattern di `asset-edit-dialog.component.html`, Task 10) e aggiungere subito dopo la sua chiusura:

```html
    <mat-tab label="Storico" [disabled]="isNew">
      <ng-template mat-tab-label>
        <mat-icon style="margin-right: 5px;">history</mat-icon>
        Storico
      </ng-template>
      <ng-template matTabContent>
        <div style="padding: 1rem 0;">
          <app-entity-history
            [entity]="'utility'"
            [entityId]="data.item.id"
            [lastModifiedBy]="data.item.updated_by ? data.item.updated_by.firstName + ' ' + data.item.updated_by.lastName : null"
            [lastModifiedAt]="data.item.update_date ? data.item.update_date.toString() : null">
          </app-entity-history>
        </div>
      </ng-template>
    </mat-tab>
```

`entity="'utility'"` (non `'utilities'`) perché deve coincidere esattamente con `UtilityService.entityName` nel backend (`backend/src/apis/utility/utility.service.ts`) — verificare il valore esatto prima di scrivere il binding, non assumerlo.

- [ ] **Step 3: Verifica di compilazione**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```
Atteso: build passa.

- [ ] **Step 4: Verifica manuale in browser**

Aprire il dettaglio di un'utenza esistente, verificare tab "Storico" come nel Task 10.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(audit-log): tab Storico nel dialog utenza"
```

---

### Task 12: Pagina log globale (Impostazioni → Log modifiche, admin-only)

**Files:**
- Create: `frontend/src/app/pages/audit-log/audit-log-page.component.ts`
- Create: `frontend/src/app/pages/audit-log/audit-log-page.component.html`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`

**Interfaces:**
- Consumes: `AuditLogService.search()` (Task 8).

- [ ] **Step 1: Componente pagina**

Elenco entity note (le 14 tracciate) per il filtro — coerente con `entityName` dichiarato in ciascun service backend.

```ts
// frontend/src/app/pages/audit-log/audit-log-page.component.ts
import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { AuditLogService } from '../../services/audit-log.service';
import { AuditLogEntry } from '../../core/entities/audit-log-entry.entity';
import { TOption } from '../../core/types/option.interface';

const ENTITY_OPTIONS: TOption[] = [
  { label: 'Immobili', value: 'assets' },
  { label: 'Utenze', value: 'utility' },
  { label: 'Contratti', value: 'contracts' },
  { label: 'Fatture', value: 'invoices' },
  { label: 'Fornitori', value: 'suppliers' },
  { label: 'Utenti', value: 'user' },
];

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './audit-log-page.component.html',
})
export class AuditLogPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auditLogService = inject(AuditLogService);

  entityOptions = ENTITY_OPTIONS;
  displayedColumns = ['created_at', 'entity_name', 'entity_id', 'user', 'action', 'summary'];

  entries: AuditLogEntry[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  forbidden = false;

  filterForm = this.fb.group({
    entity: [ENTITY_OPTIONS[0].value as string],
    userId: [null as number | null],
  });

  ngOnInit(): void {
    this.load();
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  onPage(event: PageEvent): void {
    this.page = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.load();
  }

  summary(entry: AuditLogEntry): string {
    if (entry.action === 'CREATE') return 'Elemento creato';
    if (entry.action === 'DELETE') return 'Elemento eliminato';
    const oldVal = entry.old_label ?? entry.old_value ?? '—';
    const newVal = entry.new_label ?? entry.new_value ?? '—';
    return `${entry.field_name}: ${oldVal} → ${newVal}`;
  }

  private load(): void {
    const { entity, userId } = this.filterForm.value;
    if (!entity) return;
    this.auditLogService
      .search({ entity, userId: userId ?? undefined, page: this.page, pageSize: this.pageSize })
      .subscribe({
        next: (result) => {
          this.entries = result.items;
          this.total = result.total;
          this.forbidden = false;
        },
        error: (err) => {
          this.entries = [];
          this.total = 0;
          this.forbidden = err?.status === 403;
        },
      });
  }
}
```

- [ ] **Step 2: Template**

```html
<!-- frontend/src/app/pages/audit-log/audit-log-page.component.html -->
<div class="page-container">
  <h1>Log modifiche</h1>

  @if (forbidden) {
    <p>Accesso riservato agli amministratori.</p>
  } @else {
    <form [formGroup]="filterForm" (ngSubmit)="onFilterChange()">
      <mat-form-field appearance="outline">
        <mat-label>Entità</mat-label>
        <mat-select formControlName="entity" (selectionChange)="onFilterChange()">
          @for (opt of entityOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>ID Utente</mat-label>
        <input matInput type="number" formControlName="userId" (change)="onFilterChange()">
      </mat-form-field>
    </form>

    <table mat-table [dataSource]="entries">
      <ng-container matColumnDef="created_at">
        <th mat-header-cell *matHeaderCellDef>Data</th>
        <td mat-cell *matCellDef="let entry">{{ entry.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
      </ng-container>
      <ng-container matColumnDef="entity_name">
        <th mat-header-cell *matHeaderCellDef>Entità</th>
        <td mat-cell *matCellDef="let entry">{{ entry.entity_name }}</td>
      </ng-container>
      <ng-container matColumnDef="entity_id">
        <th mat-header-cell *matHeaderCellDef>ID record</th>
        <td mat-cell *matCellDef="let entry">{{ entry.entity_id }}</td>
      </ng-container>
      <ng-container matColumnDef="user">
        <th mat-header-cell *matHeaderCellDef>Utente</th>
        <td mat-cell *matCellDef="let entry">{{ entry.user ? entry.user.firstName + ' ' + entry.user.lastName : entry.user_id }}</td>
      </ng-container>
      <ng-container matColumnDef="action">
        <th mat-header-cell *matHeaderCellDef>Azione</th>
        <td mat-cell *matCellDef="let entry">{{ entry.action }}</td>
      </ng-container>
      <ng-container matColumnDef="summary">
        <th mat-header-cell *matHeaderCellDef>Dettaglio</th>
        <td mat-cell *matCellDef="let entry">{{ summary(entry) }}</td>
      </ng-container>

      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
    </table>

    <mat-paginator
      [length]="total"
      [pageSize]="pageSize"
      [pageIndex]="page - 1"
      [pageSizeOptions]="[10, 20, 50]"
      (page)="onPage($event)">
    </mat-paginator>
  }
</div>
```

- [ ] **Step 3: Route**

In `frontend/src/app/app.routes.ts`, aggiungere l'import:

```ts
import { AuditLogPageComponent } from './pages/audit-log/audit-log-page.component';
```

E la route, dentro `children` (accanto alle altre pagine di Impostazioni):

```ts
      {path: 'audit-log', component: AuditLogPageComponent},
```

- [ ] **Step 4: Voce menu**

In `frontend/src/app/comp/sidebar/sidebar.component.ts`, aggiungere alla fine dell'array `submenu` di "Impostazioni" (stesso array visto in fase di esplorazione, dopo `{label: 'Utenti e ruoli', ...}`):

```ts
        {label: 'Log modifiche', icon: 'history', route: '/audit-log'},
```

Nota: coerente con la convenzione già in uso nel progetto (`system-users`, `backup-import`), la voce di menu non è nascosta lato frontend in base al ruolo — l'accesso è comunque bloccato dal backend (403, gestito da `forbidden` nel componente). Nessuna guardia di route aggiuntiva da introdurre: non ne esiste già una basata su ruolo in questo progetto, e non è nello scope di questa feature.

- [ ] **Step 5: Verifica di compilazione**

```bash
docker exec utenzepa-frontend-1 pnpm run build
```
Atteso: build passa.

- [ ] **Step 6: Verifica manuale in browser**

Login come Admin: aprire Impostazioni → Log modifiche, verificare tabella + filtri funzionanti, paginazione. Login come Operatore/Lettore (o modificare temporaneamente il ruolo utente di test): verificare che la pagina mostri "Accesso riservato agli amministratori" invece di un errore non gestito.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/audit-log/ frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(audit-log): pagina log modifiche globale (Impostazioni, admin-only)"
```

---

## Note finali per chi esegue il piano

- Task 1-7 sono backend e vanno eseguiti in ordine (ognuno dipende dal precedente). Task 8-12 sono frontend e dipendono dal completamento di Task 3 (endpoint disponibile) — possono partire in parallelo a Task 4-7 se necessario, ma Task 10/11 richiedono Task 9 completato.
- Dopo Task 5, rilanciare l'intera suite unit backend (non solo i file toccati) prima di aprire la PR — CLAUDE.md segnala che `pnpm run test:unit` può far crashare Docker Desktop su Windows sotto carico: se succede, non ritentare a raffica, usare CI (`gh pr checks <N> --watch`) come gate.
- Non è richiesta alcuna azione sugli altri 12 service (`utility-types`, `utility-aggregators`, `utilizer`, `utilizer-grant`, `suppliers`, `purpose`, `invoices`, `contracts`, `consip-agreement`, `budget-chapters`, `asset-aggregators`, `maintenance-managers`, `costs-borne-by`) — ereditano il tracciamento base (create/update/delete, diff senza label) automaticamente da `BaseService`, senza modifiche. Aggiungere una mappa `auditLabelResolvers` per i loro campi FK è incrementale e fuori scope per questo piano (vedi spec, sezione "Fuori scope").
