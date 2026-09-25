# Classificazione immobili (Natura × Funzione + Stato) e utenze multi-immobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classificare gli immobili su Natura × Funzione (coppie ammesse) + Stato, migrare progressivamente dal vecchio "tipo immobile" in sola lettura, e collegare ogni utenza a N immobili.

**Architecture:** Due nuove anagrafiche backend (`asset-natures`, `asset-functions`) con tabella ponte delle coppie ammesse (ManyToMany su `AssetNature.functions`). `assets` riceve `nature_id`/`function_id`/`status`, `asset_type_id` diventa nullable e viene azzerato quando l'immobile è classificato. `utilities.asset_id_fk` sostituita da ManyToMany `Utility.assets` su `utility_assets`. Frontend: due nuove pagine Impostazioni, dialog/tabella immobile riclassificati, dialog utenza con multi-select immobili, mappa con nuovi filtri e marker per ogni immobile collegato.

**Tech Stack:** NestJS 11 + TypeORM 1.x (MySQL 8), Jest; Angular 22 + Angular Material 22.

**Spec:** `docs/superpowers/specs/2026-09-25-classificazione-immobili-utenze-multi-immobile-design.md`

## Global Constraints

- Comandi Node/pnpm SEMPRE dentro i container dev (`utenzepa-api-1`, `utenzepa-frontend-1`), MAI in parallelo: un comando Docker alla volta, aspettarne l'esito (CLAUDE.md: crash Docker/PC sotto carico).
- Jest SEMPRE con `--maxWorkers=2` e solo sui file interessati: `docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`. Mai la suite intera in locale (CI la esegue).
- Migration scritte a mano, contenuto finale preparato FUORI da `backend/src/database/migrations/` (watcher + `migrationsRun: true` le eseguirebbe a metà), spostate lì solo a contenuto definitivo.
- `ValidationPipe` ha `whitelist` + `forbidNonWhitelisted`: ogni campo che il frontend invia deve esistere nel DTO, ogni campo rimosso dal DTO va escluso dal payload frontend (`@Exclude({toPlainOnly: true})` o rimosso dall'entity).
- Controller immobili: path `building` (non `assets`).
- Nomi vincoli DB = nomi di default `DefaultNamingStrategy` (calcolati e riportati nelle migration di Task 1 e Task 3) → nessun drift al prossimo `migration:generate`.
- Frontend: nessun test unitario per le pagine; gate = `docker exec utenzepa-frontend-1 pnpm run build` (compilatore Angular completo, cattura errori template che `tsc` non vede).
- Mai `git add .`/`-A`: elencare i file (`.playwright-mcp/`, `.serena/` non tracciati).
- Dopo `pnpm run lint` nel container: `git diff --numstat`, scartare le righe `0 0` (rumore CRLF) prima di `git add`.
- Etichetta del vecchio aggregato: sempre `code`, mai `description` (CLAUDE.md).
- Header dialog: `justify-content:flex-start` + `margin-left:auto`, mai `space-between` (pseudo-elemento `::before` MDC).
- Commit Conventional Commits, messaggio chiuso da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Aggiornamento parziale di un immobile già classificato** (PATCH con solo `function_id`, natura già salvata): la validazione deve usare natura persistita + funzione nuova, non rifiutare per "natura mancante". → test in Task 2.
2. **Utenza con `asset_ids` contenente id duplicati o un immobile cancellato**: duplicati deduplicati silenziosamente, immobile cancellato/inesistente → 400 (non una riga orfana in `utility_assets`). → test in Task 3.
3. **Utenze con `asset_id_fk` orfano nel DB reale** (FK assente nel DB locale, vedi Task 3): la copia dati non deve far fallire la migration per violazione FK. → filtro `IN (SELECT id FROM assets)` + verifica conteggio in Task 3.
4. **Filtro mappa per aggregato/funzione con utenza collegata a un immobile che matcha e uno che no**: marker solo sull'immobile che matcha (non su entrambi, non nessuno). → test in Task 4.
5. **Riapertura del dialog immobile dalla riga di tabella dopo la riclassificazione**: `findAll()` deve joinare `assetNature`/`assetFunction`/`assetAggregator` come `findOne()`, altrimenti badge e select partono vuoti. → test in Task 2.

---

## File Structure

**Backend — nuovi**
- `backend/src/apis/asset-functions/` — `entity/asset-function.entity.ts`, `dto/{create,update,search}-asset-function.dto.ts`, `asset-functions.service.ts` (+ `.spec.ts`), `asset-functions.controller.ts`, `asset-functions.module.ts`
- `backend/src/apis/asset-natures/` — `entity/asset-nature.entity.ts`, `dto/{create,update,search}-asset-nature.dto.ts`, `asset-natures.service.ts` (+ `.spec.ts`), `asset-natures.controller.ts`, `asset-natures.module.ts`
- `backend/src/apis/asset/enum/asset-status.enum.ts`
- `backend/src/database/migrations/1790400000000-AddAssetClassification.ts`
- `backend/src/database/migrations/1790400000001-UtilityAssetsManyToMany.ts`

**Backend — modificati**
- `backend/src/app.module.ts` (registrazione moduli)
- `backend/src/apis/asset/entity/asset.entity.ts`, `dto/*.ts`, `assets.service.ts` (+ spec), `assets.controller.ts`, `assets.module.ts`
- `backend/src/apis/utility/entity/utility.entity.ts`, `dto/*.ts`, `utility.service.ts` (+ spec), `utility.module.ts`
- `backend/src/apis/map/map.service.ts` (+ spec), `dto/map-query.dto.ts`
- `backend/src/data-importer/data-importer.service.ts`

**Frontend — nuovi**
- `frontend/src/app/pages/asset-function/` — entity, service, pagina (component, search, table, edit dialog, filter dialog)
- `frontend/src/app/pages/asset-nature/` — idem
- `frontend/src/app/pages/assets/enum/asset-status.enum.ts`

**Frontend — modificati**
- `app.routes.ts`, `comp/sidebar/sidebar.component.ts`
- `pages/asset-aggregator/*` (sola lettura)
- `pages/assets/*` (entity, service, dialog, tabella, filtri, pagina con banner)
- `pages/utilities/*` (entity, dialog, tabella, filtri, search)
- `pages/map/*` (filtri)

---

### Task 0: Branch di lavoro

- [ ] **Step 1: Rinominare il branch della spec in branch feature**

```bash
cd /c/Users/mirko.daddiego/Documents/utenzepa
git branch -m docs/asset-classification-spec feat/asset-classification-multi-asset
git status --short
```
Expected: branch `feat/asset-classification-multi-asset`, solo `.playwright-mcp/` `.serena/` non tracciati (più la spec/piano se non ancora committati).

- [ ] **Step 2: Verificare container dev attivi e bind-mountati su questa cartella**

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep utenzepa
docker inspect utenzepa-api-1 --format '{{range .Mounts}}{{.Source}} {{end}}'
```
Expected: `utenzepa-api-1`, `utenzepa-frontend-1`, `utenzepa-mysql-1` Up; il mount sorgente punta a `.../Documents/utenzepa/backend`. Se non attivi: `docker compose up -d` dalla root (con `COMPOSE_FILE` attivo in `.env`).

- [ ] **Step 3: Backup DB prima delle migration**

```bash
MSYS_NO_PATHCONV=1 docker exec utenzepa-mysql-1 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" mydatabase' > "$TEMP/utenzepa-pre-classificazione.sql"
ls -la "$TEMP/utenzepa-pre-classificazione.sql"
```
Expected: file di alcuni MB, non vuoto. Serve per ripristinare se una migration va storta.

---

### Task 1: Anagrafiche Natura/Funzione + colonne classificazione su `assets` + migration 1

**Files:**
- Create: `backend/src/apis/asset-functions/entity/asset-function.entity.ts`
- Create: `backend/src/apis/asset-functions/dto/create-asset-function.dto.ts`, `update-asset-function.dto.ts`, `search-asset-function.dto.ts`
- Create: `backend/src/apis/asset-functions/asset-functions.service.ts`, `asset-functions.service.spec.ts`, `asset-functions.controller.ts`, `asset-functions.module.ts`
- Create: `backend/src/apis/asset-natures/entity/asset-nature.entity.ts`
- Create: `backend/src/apis/asset-natures/dto/create-asset-nature.dto.ts`, `update-asset-nature.dto.ts`, `search-asset-nature.dto.ts`
- Create: `backend/src/apis/asset-natures/asset-natures.service.ts`, `asset-natures.service.spec.ts`, `asset-natures.controller.ts`, `asset-natures.module.ts`
- Create: `backend/src/apis/asset/enum/asset-status.enum.ts`
- Create: `backend/src/database/migrations/1790400000000-AddAssetClassification.ts`
- Modify: `backend/src/apis/asset/entity/asset.entity.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces:
  - `AssetFunction { id; name: string; icon: string | null; deleted; created_by_user_id; updated_by_user_id; ... }` (tabella `asset_functions`)
  - `AssetNature { id; name: string; functions: AssetFunction[]; deleted; ... }` (tabella `asset_natures`, ponte `asset_nature_functions(nature_id, function_id)`)
  - `AssetStatusEnum { ATTIVO = 'Attivo', DISMESSO = 'Dismesso', DA_VERIFICARE = 'Da verificare' }`
  - `Asset.nature_id: number | null`, `Asset.function_id: number | null`, `Asset.status: AssetStatusEnum`, `Asset.asset_type_id: number | null`, relazioni `Asset.assetNature: AssetNature`, `Asset.assetFunction: AssetFunction`
  - REST: `GET/POST /asset-natures`, `PATCH/DELETE /asset-natures/:id` (DTO con `function_ids?: number[]`), `GET/POST /asset-functions`, `PATCH/DELETE /asset-functions/:id`
  - `AssetNaturesService.update()` → `ConflictException` (409) se `function_ids` rimuove una coppia usata; `remove()` → 409 se natura usata. `AssetFunctionsService.remove()` → 409 se funzione usata.

- [ ] **Step 1: Enum stato**

`backend/src/apis/asset/enum/asset-status.enum.ts`:
```ts
export enum AssetStatusEnum {
  ATTIVO = 'Attivo',
  DISMESSO = 'Dismesso',
  DA_VERIFICARE = 'Da verificare',
}
```

- [ ] **Step 2: Entity `AssetFunction`**

`backend/src/apis/asset-functions/entity/asset-function.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';

// Funzione di un immobile (a cosa serve: Istruzione, Sport, Illuminazione…).
// Le combinazioni ammesse con la Natura stanno in asset_nature_functions
// (vedi AssetNature.functions). Sostituisce progressivamente AssetAggregator.
@Entity('asset_functions')
export class AssetFunction {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  // Ligature Material Icons per i marker mappa (stesso uso di
  // AssetAggregator.icon, che resta come fallback in transizione).
  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}
```

- [ ] **Step 3: Entity `AssetNature`**

`backend/src/apis/asset-natures/entity/asset-nature.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';

// Natura fisica di un immobile (Fabbricato, Area, Impianto…). `functions` =
// funzioni ammesse per questa natura: un immobile può avere la coppia
// (nature_id, function_id) solo se presente qui.
@Entity('asset_natures')
export class AssetNature {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255, unique: true })
  name: string;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  created_by_user_id: number;

  @Column({ name: 'updated_by_user_id' })
  updated_by_user_id: number;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;

  @ManyToMany(() => AssetFunction)
  @JoinTable({
    name: 'asset_nature_functions',
    joinColumn: { name: 'nature_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'function_id', referencedColumnName: 'id' },
  })
  functions: AssetFunction[];
}
```

- [ ] **Step 4: Colonne classificazione su `Asset`**

In `backend/src/apis/asset/entity/asset.entity.ts`:

Aggiungere agli import:
```ts
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetStatusEnum } from '@apis/asset/enum/asset-status.enum';
```

Sostituire:
```ts
  @Column({ type: 'int', nullable: false })
  asset_type_id: number;
```
con:
```ts
  // Legacy (AssetAggregator): in sola lettura, azzerato quando l'immobile
  // riceve natura + funzione (AssetsService.update). Colonna e tabella
  // aggregatori vanno droppate quando nessun immobile lo valorizza più.
  @Column({ type: 'int', nullable: true })
  asset_type_id: number | null;

  @Column({ type: 'int', nullable: true })
  nature_id: number | null;

  @Column({ type: 'int', nullable: true })
  function_id: number | null;

  @Column({ type: 'enum', enum: AssetStatusEnum, default: AssetStatusEnum.ATTIVO })
  status: AssetStatusEnum;
```

In fondo alla classe, dopo `assetAggregator`:
```ts
  @ManyToOne(() => AssetNature)
  @JoinColumn({ name: 'nature_id' })
  assetNature: AssetNature;

  @ManyToOne(() => AssetFunction)
  @JoinColumn({ name: 'function_id' })
  assetFunction: AssetFunction;
```

- [ ] **Step 5: DTO `asset-functions`**

`dto/create-asset-function.dto.ts`:
```ts
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssetFunctionDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}
```

`dto/update-asset-function.dto.ts`:
```ts
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssetFunctionDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}
```

`dto/search-asset-function.dto.ts`:
```ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchAssetFunctionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;
}
```

- [ ] **Step 6: DTO `asset-natures`**

`dto/create-asset-nature.dto.ts`:
```ts
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAssetNatureDto {
  @IsNotEmpty({ message: 'Il nome è obbligatorio' })
  @IsString()
  @MaxLength(255)
  name: string;

  // Funzioni ammesse per questa natura (tabella asset_nature_functions).
  @IsOptional()
  @IsArray({ message: 'Le funzioni ammesse devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni funzione ammessa deve essere un ID intero.' })
  function_ids?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;
}
```

`dto/update-asset-nature.dto.ts`:
```ts
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAssetNatureDto {
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  // Se presente sostituisce l'intero insieme delle funzioni ammesse.
  @IsOptional()
  @IsArray({ message: 'Le funzioni ammesse devono essere un array.' })
  @IsInt({ each: true, message: 'Ogni funzione ammessa deve essere un ID intero.' })
  function_ids?: number[];

  @IsOptional()
  @IsInt()
  created_by_user_id?: number;

  @IsOptional()
  @IsInt()
  updated_by_user_id?: number;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  create_date?: Date;

  @IsOptional()
  update_date?: Date;
}
```

`dto/search-asset-nature.dto.ts`:
```ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchAssetNatureDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  deleted?: boolean;
}
```

- [ ] **Step 7: Test falliti `AssetFunctionsService`**

`backend/src/apis/asset-functions/asset-functions.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { AssetFunctionsService } from './asset-functions.service';

describe('AssetFunctionsService', () => {
  let service: AssetFunctionsService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let assetRepo: { count: jest.Mock };
  let qb: { where: jest.Mock; andWhere: jest.Mock; orderBy: jest.Mock; getMany: jest.Mock };

  beforeEach(() => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => d),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new AssetFunctionsService(repo as never, assetRepo as never);
  });

  it('findAll filtra le funzioni non cancellate di default', async () => {
    await service.findAll();
    expect(qb.where).toHaveBeenCalledWith('asset_functions.deleted = :deleted_default', { deleted_default: 0 });
  });

  it('remove rifiuta con 409 se la funzione è usata da immobili non cancellati', async () => {
    repo.findOne.mockResolvedValue({ id: 3, deleted: false });
    assetRepo.count.mockResolvedValue(2);

    await expect(service.remove(3, 1)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({ where: { function_id: 3, deleted: false } });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('remove marca cancellata una funzione non usata', async () => {
    repo.findOne.mockResolvedValue({ id: 3, deleted: false });

    await service.remove(3, 1);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 3, deleted: true, updated_by_user_id: 1 }));
  });
});
```

- [ ] **Step 8: Eseguire, deve fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset-functions --maxWorkers=2`
Expected: FAIL — `Cannot find module './asset-functions.service'`.

- [ ] **Step 9: `AssetFunctionsService`, controller, module**

`asset-functions.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from './entity/asset-function.entity';
import { CreateAssetFunctionDto } from './dto/create-asset-function.dto';
import { UpdateAssetFunctionDto } from './dto/update-asset-function.dto';
import { SearchAssetFunctionDto } from './dto/search-asset-function.dto';

@Injectable()
export class AssetFunctionsService extends BaseService<
  AssetFunction,
  CreateAssetFunctionDto,
  UpdateAssetFunctionDto
> {
  protected readonly entityName = 'asset_functions';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(AssetFunction)
    protected readonly repo: Repository<AssetFunction>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  async findAll(filters?: SearchAssetFunctionDto): Promise<AssetFunction[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where(`${alias}.deleted = :deleted_filter`, { deleted_filter: filters.deleted ? 1 : 0 });
    } else {
      qb.where(`${alias}.deleted = :deleted_default`, { deleted_default: 0 });
    }
    this.applyFilters(qb, filters ?? {}, alias, ['deleted']);
    return qb.orderBy(`${alias}.name`, 'ASC').getMany();
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const inUse = await this.assetRepo.count({ where: { function_id: id, deleted: false } });
    if (inUse > 0) {
      throw new ConflictException(
        `Funzione usata da ${inUse} immobili: riclassificarli prima di eliminarla.`,
      );
    }
    return super.remove(id, updatedByUserId);
  }
}
```

`asset-functions.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { DeleteDto } from '@apis/shared/dto/delete.dto';
import { AssetFunctionsService } from './asset-functions.service';
import { AssetFunction } from './entity/asset-function.entity';
import { CreateAssetFunctionDto } from './dto/create-asset-function.dto';
import { UpdateAssetFunctionDto } from './dto/update-asset-function.dto';
import { SearchAssetFunctionDto } from './dto/search-asset-function.dto';

@Controller('asset-functions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetFunctionsController {
  constructor(private readonly service: AssetFunctionsService) {}

  @Get()
  getAll(@Query() filters: SearchAssetFunctionDto): Promise<AssetFunction[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateAssetFunctionDto, @CurrentUser() user: ICurrentUser): Promise<AssetFunction> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetFunctionDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetFunction> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
```

`asset-functions.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from './entity/asset-function.entity';
import { AssetFunctionsService } from './asset-functions.service';
import { AssetFunctionsController } from './asset-functions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetFunction, Asset])],
  providers: [AssetFunctionsService],
  controllers: [AssetFunctionsController],
  exports: [AssetFunctionsService],
})
export class AssetFunctionsModule {}
```

- [ ] **Step 10: Eseguire, deve passare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset-functions --maxWorkers=2`
Expected: PASS (3 test).

- [ ] **Step 11: Test falliti `AssetNaturesService`**

`backend/src/apis/asset-natures/asset-natures.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { AssetNaturesService } from './asset-natures.service';

describe('AssetNaturesService', () => {
  let service: AssetNaturesService;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let assetRepo: { count: jest.Mock };
  let qb: { leftJoinAndSelect: jest.Mock; where: jest.Mock; andWhere: jest.Mock; orderBy: jest.Mock; getMany: jest.Mock };

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 1, ...d })),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(0) };
    service = new AssetNaturesService(repo as never, assetRepo as never);
  });

  it('findAll carica le funzioni ammesse non cancellate', async () => {
    await service.findAll();
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('asset_natures.functions', 'functions', 'functions.deleted = 0');
  });

  it('create salva le funzioni ammesse come relazione', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });

    await service.create({ name: 'Fabbricato', function_ids: [4, 5] }, 9);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }], created_by_user_id: 9 }),
    );
  });

  it('update rifiuta con 409 se rimuove una coppia usata da immobili', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });
    assetRepo.count.mockResolvedValue(3);

    await expect(service.update(1, { function_ids: [4] }, 9)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({
      where: { nature_id: 1, function_id: In([5]), deleted: false },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update sostituisce le funzioni ammesse se nessuna coppia rimossa è in uso', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }, { id: 5 }] });

    await service.update(1, { function_ids: [4, 6] }, 9);

    expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ functions: [{ id: 4 }, { id: 6 }] }));
  });

  it('update senza function_ids non tocca le coppie', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Fabbricato', functions: [{ id: 4 }] });

    await service.update(1, { name: 'Fabbricati' }, 9);

    expect(assetRepo.count).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('remove rifiuta con 409 se la natura è usata', async () => {
    repo.findOne.mockResolvedValue({ id: 1, deleted: false });
    assetRepo.count.mockResolvedValue(1);

    await expect(service.remove(1, 9)).rejects.toThrow(ConflictException);
    expect(assetRepo.count).toHaveBeenCalledWith({ where: { nature_id: 1, deleted: false } });
  });
});
```

- [ ] **Step 12: Eseguire, deve fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset-natures --maxWorkers=2`
Expected: FAIL — modulo non trovato.

- [ ] **Step 13: `AssetNaturesService`, controller, module**

`asset-natures.service.ts`:
```ts
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetNature } from './entity/asset-nature.entity';
import { CreateAssetNatureDto } from './dto/create-asset-nature.dto';
import { UpdateAssetNatureDto } from './dto/update-asset-nature.dto';
import { SearchAssetNatureDto } from './dto/search-asset-nature.dto';

@Injectable()
export class AssetNaturesService extends BaseService<AssetNature, CreateAssetNatureDto, UpdateAssetNatureDto> {
  protected readonly entityName = 'asset_natures';
  protected readonly relations = ['functions', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(AssetNature)
    protected readonly repo: Repository<AssetNature>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  async findAll(filters?: SearchAssetNatureDto): Promise<AssetNature[]> {
    const alias = this.entityName;
    const qb = this.repo.createQueryBuilder(alias);
    qb.leftJoinAndSelect(`${alias}.functions`, 'functions', 'functions.deleted = 0');
    if (filters?.deleted !== undefined && filters.deleted !== null) {
      qb.where(`${alias}.deleted = :deleted_filter`, { deleted_filter: filters.deleted ? 1 : 0 });
    } else {
      qb.where(`${alias}.deleted = :deleted_default`, { deleted_default: 0 });
    }
    this.applyFilters(qb, filters ?? {}, alias, ['deleted']);
    return qb.orderBy(`${alias}.name`, 'ASC').getMany();
  }

  async create(dto: CreateAssetNatureDto, userId?: number): Promise<AssetNature> {
    const { function_ids, ...rest } = dto;
    const entity = this.repo.create({
      ...rest,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
      functions: this.toFunctionRefs(function_ids ?? []),
    });
    let saved: AssetNature;
    try {
      saved = await this.repo.save(entity);
    } catch (error) {
      this.manageErrors(error, 'Errore durante la creazione della natura immobile');
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateAssetNatureDto, userId?: number): Promise<AssetNature> {
    const { function_ids, ...rest } = dto;

    if (function_ids !== undefined) {
      const current = await this.repo.findOne({ where: { id }, relations: { functions: true } });
      if (!current) throw new BadRequestException('Natura immobile non trovata');
      const removed = (current.functions ?? [])
        .map((f) => f.id)
        .filter((fid) => !function_ids.includes(fid));
      if (removed.length > 0) {
        const inUse = await this.assetRepo.count({
          where: { nature_id: id, function_id: In(removed), deleted: false },
        });
        if (inUse > 0) {
          throw new ConflictException(
            `Impossibile rimuovere funzioni ammesse: ${inUse} immobili usano queste combinazioni.`,
          );
        }
      }
    }

    await super.update(id, rest as UpdateAssetNatureDto, userId);

    if (function_ids !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { functions: true } });
      entity.functions = this.toFunctionRefs(function_ids);
      await this.repo.save(entity);
    }

    return this.findOne(id);
  }

  async remove(id: number, updatedByUserId: number): Promise<void> {
    const inUse = await this.assetRepo.count({ where: { nature_id: id, deleted: false } });
    if (inUse > 0) {
      throw new ConflictException(
        `Natura usata da ${inUse} immobili: riclassificarli prima di eliminarla.`,
      );
    }
    return super.remove(id, updatedByUserId);
  }

  private toFunctionRefs(ids: number[]): AssetFunction[] {
    return [...new Set(ids)].map((fid) => ({ id: fid }) as AssetFunction);
  }
}
```

Nota per il test "update senza function_ids": `super.update` chiama `repo.findOne` + `repo.save` una volta sola → `toHaveBeenCalledTimes(1)` verificato.

`asset-natures.controller.ts`: identico a `AssetFunctionsController` sostituendo `asset-functions`→`asset-natures`, `AssetFunctionsService`→`AssetNaturesService`, `AssetFunction`→`AssetNature`, `*AssetFunctionDto`→`*AssetNatureDto` e i relativi import (`./asset-natures.service`, `./entity/asset-nature.entity`, `./dto/create-asset-nature.dto`, `./dto/update-asset-nature.dto`, `./dto/search-asset-nature.dto`). Codice completo:
```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { DeleteDto } from '@apis/shared/dto/delete.dto';
import { AssetNaturesService } from './asset-natures.service';
import { AssetNature } from './entity/asset-nature.entity';
import { CreateAssetNatureDto } from './dto/create-asset-nature.dto';
import { UpdateAssetNatureDto } from './dto/update-asset-nature.dto';
import { SearchAssetNatureDto } from './dto/search-asset-nature.dto';

@Controller('asset-natures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetNaturesController {
  constructor(private readonly service: AssetNaturesService) {}

  @Get()
  getAll(@Query() filters: SearchAssetNatureDto): Promise<AssetNature[]> {
    return this.service.findAll(filters);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateAssetNatureDto, @CurrentUser() user: ICurrentUser): Promise<AssetNature> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssetNatureDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<AssetNature> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Body() dto: DeleteDto): Promise<void> {
    return this.service.remove(id, dto.updated_by_user_id);
  }
}
```

`asset-natures.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
import { AssetNature } from './entity/asset-nature.entity';
import { AssetNaturesService } from './asset-natures.service';
import { AssetNaturesController } from './asset-natures.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AssetNature, AssetFunction, Asset])],
  providers: [AssetNaturesService],
  controllers: [AssetNaturesController],
  exports: [AssetNaturesService],
})
export class AssetNaturesModule {}
```

Registrare in `backend/src/app.module.ts` (import accanto a `AssetAggregatorsModule`, e nell'array `imports`):
```ts
import { AssetNaturesModule } from '@apis/asset-natures/asset-natures.module';
import { AssetFunctionsModule } from '@apis/asset-functions/asset-functions.module';
// ...
    AssetAggregatorsModule,
    AssetNaturesModule,
    AssetFunctionsModule,
```

- [ ] **Step 14: Eseguire, deve passare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset-natures src/apis/asset-functions --maxWorkers=2`
Expected: PASS (9 test).

- [ ] **Step 15: Migration 1 — scrivere FUORI dalla cartella migrations**

Creare `backend/tmp-migrations/1790400000000-AddAssetClassification.ts` (cartella fuori da `src/`, ignorata dal watcher). Nomi vincoli = default `DefaultNamingStrategy` (già calcolati nel container: `n.indexName`/`n.foreignKeyName`):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Classificazione immobili Natura × Funzione (coppie ammesse) + Stato.
// asset_type_id (AssetAggregator) diventa nullable: legacy in sola lettura,
// azzerato alla riclassificazione. Nomi vincoli = default TypeORM
// (DefaultNamingStrategy), così migration:generate non vede drift.
export class AddAssetClassification1790400000000 implements MigrationInterface {
  name = 'AddAssetClassification1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`asset_functions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`icon\` varchar(50) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_001607cb3b93c5be56ed6c5436\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`asset_natures\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_447535931d91036f77df3285d7\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`asset_nature_functions\` (\`nature_id\` int NOT NULL, \`function_id\` int NOT NULL, INDEX \`IDX_65f8f7543ffc3a08895b4c6bd6\` (\`nature_id\`), INDEX \`IDX_723abed4fd0ecea738a4848a73\` (\`function_id\`), PRIMARY KEY (\`nature_id\`, \`function_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD \`nature_id\` int NULL, ADD \`function_id\` int NULL, ADD \`status\` enum ('Attivo', 'Dismesso', 'Da verificare') NOT NULL DEFAULT 'Attivo', MODIFY \`asset_type_id\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` ADD CONSTRAINT \`FK_90e175210db7d194ab8a2c85213\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_functions\` ADD CONSTRAINT \`FK_db3244cb4f4a9db0d1e7b94968c\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` ADD CONSTRAINT \`FK_91f2b396fa3f878eb0362b8b333\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_natures\` ADD CONSTRAINT \`FK_e08ffa8fc5572d75830a9c05705\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` ADD CONSTRAINT \`FK_65f8f7543ffc3a08895b4c6bd69\` FOREIGN KEY (\`nature_id\`) REFERENCES \`asset_natures\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`asset_nature_functions\` ADD CONSTRAINT \`FK_723abed4fd0ecea738a4848a737\` FOREIGN KEY (\`function_id\`) REFERENCES \`asset_functions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD CONSTRAINT \`FK_eea0f5a93691db842ddd1ad0eb3\` FOREIGN KEY (\`nature_id\`) REFERENCES \`asset_natures\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`assets\` ADD CONSTRAINT \`FK_e863b6697b32d895afe51e6baab\` FOREIGN KEY (\`function_id\`) REFERENCES \`asset_functions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`assets\` DROP FOREIGN KEY \`FK_e863b6697b32d895afe51e6baab\``);
    await queryRunner.query(`ALTER TABLE \`assets\` DROP FOREIGN KEY \`FK_eea0f5a93691db842ddd1ad0eb3\``);
    await queryRunner.query(`ALTER TABLE \`asset_nature_functions\` DROP FOREIGN KEY \`FK_723abed4fd0ecea738a4848a737\``);
    await queryRunner.query(`ALTER TABLE \`asset_nature_functions\` DROP FOREIGN KEY \`FK_65f8f7543ffc3a08895b4c6bd69\``);
    await queryRunner.query(`ALTER TABLE \`asset_natures\` DROP FOREIGN KEY \`FK_e08ffa8fc5572d75830a9c05705\``);
    await queryRunner.query(`ALTER TABLE \`asset_natures\` DROP FOREIGN KEY \`FK_91f2b396fa3f878eb0362b8b333\``);
    await queryRunner.query(`ALTER TABLE \`asset_functions\` DROP FOREIGN KEY \`FK_db3244cb4f4a9db0d1e7b94968c\``);
    await queryRunner.query(`ALTER TABLE \`asset_functions\` DROP FOREIGN KEY \`FK_90e175210db7d194ab8a2c85213\``);
    // Immobili già riclassificati hanno asset_type_id NULL: il ritorno a NOT
    // NULL fallirebbe — resta nullable (down lossy, accettato nella spec).
    await queryRunner.query(`ALTER TABLE \`assets\` DROP COLUMN \`status\`, DROP COLUMN \`function_id\`, DROP COLUMN \`nature_id\``);
    await queryRunner.query(`DROP TABLE \`asset_nature_functions\``);
    await queryRunner.query(`DROP TABLE \`asset_natures\``);
    await queryRunner.query(`DROP TABLE \`asset_functions\``);
  }
}
```

- [ ] **Step 16: Spostare la migration e lasciarla eseguire**

```bash
cd /c/Users/mirko.daddiego/Documents/utenzepa/backend
mv tmp-migrations/1790400000000-AddAssetClassification.ts src/database/migrations/
docker restart utenzepa-api-1
```
Poi (comando separato, dopo ~30-60s):
```bash
docker logs utenzepa-api-1 --tail 40 2>&1 | grep -i "migration\|error\|Nest application successfully"
docker exec utenzepa-mysql-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" mydatabase -e "SELECT name FROM migrations ORDER BY id DESC LIMIT 1; SHOW TABLES LIKE \"asset_%\"; SELECT status, COUNT(*) FROM assets GROUP BY status;"' 2>&1 | grep -v Warning
```
Expected: log con `AddAssetClassification1790400000000` eseguita e "Nest application successfully started"; tabelle `asset_functions`, `asset_natures`, `asset_nature_functions`, `asset_aggregators`; tutti gli immobili `Attivo`.

- [ ] **Step 17: Verifica assenza drift sulle tabelle nuove**

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate tmp-migrations/DriftCheck -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 sh -c 'grep -E "asset_natures|asset_functions|asset_nature_functions|nature_id|function_id|\`status\`|asset_type_id" tmp-migrations/*DriftCheck.ts || echo NO_DRIFT_ON_NEW_TABLES'
docker exec -u root utenzepa-api-1 sh -c 'rm -f tmp-migrations/*DriftCheck.ts && chown -R 1000:1000 tmp-migrations'
```
Expected: `NO_DRIFT_ON_NEW_TABLES` (il file conterrà il drift preesistente noto su `system_users`/`purpose`/`utilizer`/`invoice_budget_chapter`, da ignorare). Se compaiono righe sulle tabelle nuove: correggere la migration (drop manuale di tabelle/colonne + riga `migrations`, poi rieseguire) finché il check è pulito.

- [ ] **Step 18: Type-check, lint e commit**

```bash
docker exec utenzepa-api-1 pnpm run type-check
docker exec utenzepa-api-1 pnpm run lint
cd /c/Users/mirko.daddiego/Documents/utenzepa && git diff --numstat
```
Expected: type-check senza errori. Scartare con `git checkout -- <file>` i file con `0 0`. `rmdir backend/tmp-migrations` se vuota.

```bash
git add backend/src/apis/asset-functions backend/src/apis/asset-natures backend/src/apis/asset/enum/asset-status.enum.ts backend/src/apis/asset/entity/asset.entity.ts backend/src/app.module.ts backend/src/database/migrations/1790400000000-AddAssetClassification.ts
git commit -m "feat(asset): anagrafiche natura/funzione immobile e colonne classificazione

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Classificazione immobile nel servizio `building`

**Files:**
- Modify: `backend/src/apis/asset/dto/create-asset.dto.ts`, `update-asset.dto.ts`, `search-asset.dto.ts`
- Modify: `backend/src/apis/asset/assets.service.ts`, `assets.service.spec.ts`
- Modify: `backend/src/apis/asset/assets.controller.ts`, `assets.module.ts`

**Interfaces:**
- Consumes: `AssetNature.functions`, `Asset.nature_id/function_id/status/assetNature/assetFunction` (Task 1)
- Produces:
  - `CreateAssetDto`: `nature_id: number` (obbligatorio), `function_id: number` (obbligatorio), `status?: AssetStatusEnum`; **niente** `asset_type_id`
  - `UpdateAssetDto`: `nature_id?: number | null`, `function_id?: number | null`, `status?: AssetStatusEnum`; **niente** `asset_type_id`
  - `SearchAssetDto`: `+ nature_id?`, `function_id?`, `status?`, `legacy_only?: boolean` (resta `asset_type_id?`)
  - `GET /building/legacy-count` → `{ count: number }`
  - risposte immobile con `assetNature`, `assetFunction`, `assetAggregator` in `findAll` e `findOne`

- [ ] **Step 1: DTO**

`create-asset.dto.ts` — sostituire il blocco `asset_type_id` con:
```ts
  @IsNotEmpty({ message: 'La natura immobile è obbligatoria' })
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  nature_id: number;

  @IsNotEmpty({ message: 'La funzione immobile è obbligatoria' })
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : value,
  )
  @IsInt()
  function_id: number;

  @IsOptional()
  @IsEnum(AssetStatusEnum, { message: `Lo stato deve essere uno tra: ${Object.values(AssetStatusEnum).join(', ')}` })
  status?: AssetStatusEnum;
```
Import: `IsEnum` da `class-validator`, `AssetStatusEnum` da `@apis/asset/enum/asset-status.enum`.

`update-asset.dto.ts` — sostituire il blocco `asset_type_id` con:
```ts
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  nature_id?: number | null;

  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  function_id?: number | null;

  @IsOptional()
  @IsEnum(AssetStatusEnum, { message: `Lo stato deve essere uno tra: ${Object.values(AssetStatusEnum).join(', ')}` })
  status?: AssetStatusEnum;
```
(`@IsOptional()` lascia passare `null`: così il frontend può inviare natura/funzione vuote per un immobile ancora legacy.)

`search-asset.dto.ts` — dopo `asset_type_id`:
```ts
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  nature_id?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  function_id?: number;

  @IsOptional()
  @IsEnum(AssetStatusEnum)
  status?: AssetStatusEnum;

  // Solo immobili ancora col vecchio tipo (asset_type_id valorizzato): usato
  // dal banner "N immobili da riclassificare".
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  legacy_only?: boolean;
```

- [ ] **Step 2: Test falliti**

In `assets.service.spec.ts`:

1. Nel `beforeEach`, estendere `repo` e il costruttore (4° parametro = repo nature):
```ts
  let natureQb: { innerJoin: jest.Mock; where: jest.Mock; getCount: jest.Mock };
  // ...
    natureQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
    };
    service = new AssetsService(
      repo as never,
      { buildQuery: jest.fn(), geocode: jest.fn() } as never,
      { createQueryBuilder: jest.fn() } as never,
      { createQueryBuilder: jest.fn().mockReturnValue(natureQb) } as never,
    );
```
Aggiungere `getCount: jest.Mock` al tipo di `qb` e `getCount: jest.fn().mockResolvedValue(0)` al suo mock.

2. Nuovi test (nuovo `describe('classificazione', ...)`; per `update` riusare il setup `repo.findOne`/`repo.save` già usato dai test di geocoding del file, es. `repo.findOne = jest.fn().mockResolvedValue({...})`, `repo.save = jest.fn(async (d) => d)`):
```ts
  describe('classificazione', () => {
    beforeEach(() => {
      repo.save = jest.fn(async (d) => d);
    });

    it('findAll e findOne joinano natura, funzione e vecchio aggregato', async () => {
      await service.findAll();
      await service.findOne(1);
      for (const [path, alias] of [
        ['assets.assetNature', 'assetNature'],
        ['assets.assetFunction', 'assetFunction'],
        ['assets.assetAggregator', 'assetAggregator'],
      ]) {
        const calls = qb.leftJoinAndSelect.mock.calls.filter((c) => c[0] === path && c[1] === alias);
        expect(calls).toHaveLength(2);
      }
    });

    it('findAll con legacy_only filtra asset_type_id non nullo e non lo passa ad applyFilters', async () => {
      await service.findAll({ legacy_only: true } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('assets.asset_type_id IS NOT NULL');
      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('legacy_only'), expect.anything());
    });

    it('findAll con status filtra per uguaglianza esatta', async () => {
      await service.findAll({ status: 'Dismesso' } as never);
      expect(qb.andWhere).toHaveBeenCalledWith('assets.status = :filter_status', { filter_status: 'Dismesso' });
    });

    it('create rifiuta una coppia natura/funzione non ammessa', async () => {
      natureQb.getCount.mockResolvedValue(0);
      await expect(service.create({ asset_name: 'X', nature_id: 1, function_id: 9 } as never, 1)).rejects.toThrow(
        'Combinazione natura/funzione non ammessa.',
      );
    });

    it('update con natura e funzione valorizzate azzera il vecchio tipo', async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await service.update(5, { nature_id: 1, function_id: 2 } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ asset_type_id: null, nature_id: 1, function_id: 2 }));
    });

    it('update con sola natura non azzera il vecchio tipo', async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await service.update(5, { nature_id: 1 } as never, 1);

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ asset_type_id: 3, nature_id: 1 }));
    });

    it('update parziale (solo funzione) valida contro la natura già salvata', async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 5, asset_type_id: null, nature_id: 1, function_id: 2 });

      await service.update(5, { function_id: 4 } as never, 1);

      expect(natureQb.where).toHaveBeenCalledWith('n.id = :natureId AND n.deleted = 0', { natureId: 1 });
      expect(natureQb.innerJoin).toHaveBeenCalledWith('n.functions', 'f', 'f.id = :functionId AND f.deleted = 0', { functionId: 4 });
    });

    it('update con funzione senza natura rifiuta', async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 5, asset_type_id: 3, nature_id: null, function_id: null });

      await expect(service.update(5, { function_id: 2 } as never, 1)).rejects.toThrow(
        'Selezionare la natura prima della funzione.',
      );
    });

    it('countLegacy conta gli immobili non cancellati con asset_type_id valorizzato', async () => {
      qb.getCount.mockResolvedValue(42);
      await expect(service.countLegacy()).resolves.toBe(42);
      expect(qb.where).toHaveBeenCalledWith('assets.deleted = 0');
      expect(qb.andWhere).toHaveBeenCalledWith('assets.asset_type_id IS NOT NULL');
    });
  });
```

- [ ] **Step 3: Eseguire, deve fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset/assets.service.spec.ts --maxWorkers=2`
Expected: FAIL sui nuovi test (join mancanti, `countLegacy is not a function`, nessuna validazione).

- [ ] **Step 4: Implementazione `AssetsService`**

Import aggiuntivi:
```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
import { AssetFunction } from '@apis/asset-functions/entity/asset-function.entity';
```

`relations`:
```ts
  protected readonly relations = ['assetAggregator', 'assetNature', 'assetFunction', 'created_by', 'updated_by'];
```

Costruttore — nuovo parametro in coda e resolver audit:
```ts
    @InjectRepository(AssetAggregator)
    private readonly assetAggregatorRepo: Repository<AssetAggregator>,
    @InjectRepository(AssetNature)
    private readonly natureRepo: Repository<AssetNature>,
  ) {
    super();
    this.auditLabelResolvers = {
      asset_type_id: { repo: this.assetAggregatorRepo, field: 'code' },
      nature_id: { repo: this.natureRepo, field: 'name' },
    };
  }
```
(Resolver `function_id` non aggiunto: servirebbe un secondo repo iniettato solo per l'etichetta audit — l'id grezzo basta, YAGNI.)

`findAll` — dopo il join `assetAggregator`:
```ts
    qb.leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0');
    qb.leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0');
```
e sostituire `this.applyFilters(qb, filters ?? {}, 'assets', ['deleted']);` con:
```ts
    if (filters?.legacy_only) {
      qb.andWhere('assets.asset_type_id IS NOT NULL');
    }
    if (filters?.status) {
      qb.andWhere('assets.status = :filter_status', { filter_status: filters.status });
    }

    this.applyFilters(qb, filters ?? {}, 'assets', ['deleted', 'legacy_only', 'status']);
```

`findOne` — dopo `.leftJoinAndSelect('assets.assetAggregator', ...)`:
```ts
      .leftJoinAndSelect('assets.assetNature', 'assetNature', 'assetNature.deleted = 0')
      .leftJoinAndSelect('assets.assetFunction', 'assetFunction', 'assetFunction.deleted = 0')
```

Nuovi metodi (prima di `update`):
```ts
  async create(dto: CreateAssetDto, userId?: number): Promise<Asset> {
    await this.assertClassification(dto.nature_id, dto.function_id);
    return super.create(dto, userId);
  }

  countLegacy(): Promise<number> {
    return this.repo
      .createQueryBuilder('assets')
      .where('assets.deleted = 0')
      .andWhere('assets.asset_type_id IS NOT NULL')
      .getCount();
  }

  // Coppia (natura, funzione) ammessa in asset_nature_functions. Funzione
  // senza natura non ha senso (le funzioni ammesse dipendono dalla natura).
  // Natura senza funzione è ammessa: riclassificazione a metà di un immobile
  // legacy, il vecchio tipo resta finché non ci sono entrambe.
  private async assertClassification(
    natureId: number | null | undefined,
    functionId: number | null | undefined,
  ): Promise<void> {
    if (functionId != null && natureId == null) {
      throw new BadRequestException('Selezionare la natura prima della funzione.');
    }
    if (natureId == null || functionId == null) return;
    const allowed = await this.natureRepo
      .createQueryBuilder('n')
      .innerJoin('n.functions', 'f', 'f.id = :functionId AND f.deleted = 0', { functionId })
      .where('n.id = :natureId AND n.deleted = 0', { natureId })
      .getCount();
    if (allowed === 0) {
      throw new BadRequestException('Combinazione natura/funzione non ammessa.');
    }
  }
```

`update` — dopo il calcolo di `shouldRegeocode` e prima di costruire `payload`, e poi sul payload:
```ts
    const natureId = 'nature_id' in updateDto ? updateDto.nature_id : existing?.nature_id;
    const functionId = 'function_id' in updateDto ? updateDto.function_id : existing?.function_id;
    await this.assertClassification(natureId, functionId);

    const payload: UpdateAssetDto & {
      geocoded_latitude?: string | null;
      geocoded_longitude?: string | null;
      geocoded_at?: Date | null;
      asset_type_id?: null;
    } = { ...updateDto };

    // Immobile classificato con natura + funzione: il vecchio tipo
    // (AssetAggregator) non serve più, azzerato (legacy in sola lettura).
    if (natureId != null && functionId != null) {
      payload.asset_type_id = null;
    }
```
(Il blocco `const payload ... = { ...updateDto };` esistente viene sostituito da quello sopra.)

Eliminare i due blocchi commentati `// async create(...)` e `// async update(...)` in fondo al file (il primo è ora sostituito da un `create` reale).

- [ ] **Step 5: Controller + module**

`assets.controller.ts` — PRIMA di `@Get(':id')`:
```ts
  @Get('legacy-count')
  async legacyCount(): Promise<{ count: number }> {
    return { count: await this.service.countLegacy() };
  }
```

`assets.module.ts`:
```ts
import { AssetNature } from '@apis/asset-natures/entity/asset-nature.entity';
// ...
  imports: [TypeOrmModule.forFeature([Asset, AssetAggregator, AssetNature]), GeocodingModule],
```

- [ ] **Step 6: Eseguire, deve passare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset/assets.service.spec.ts --maxWorkers=2`
Expected: PASS (test vecchi + 9 nuovi). Se il test storico `mappa asset_type_id su AssetAggregator.code` fallisce perché ora ci sono due resolver, aggiornarlo per verificare solo la chiave `asset_type_id` (`expect(service['auditLabelResolvers'].asset_type_id).toEqual(...)`).

- [ ] **Step 7: Smoke test HTTP**

Container ricompila da solo (watch). Login e chiamate (sostituire email/password con un utente Admin reale o temporaneo — vedi CLAUDE.md per creare/eliminare un utente di test):
```bash
TOKEN=$(curl -s -X POST http://localhost:3010/api/v1/authModule/login -H 'Content-Type: application/json' -d '{"email":"<admin>","password":"<pwd>"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token.access_token))")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3010/api/v1/building/legacy-count
```
Expected: `{"count":477}` circa (tutti gli immobili non cancellati sono ancora legacy).

- [ ] **Step 8: Commit**

```bash
docker exec utenzepa-api-1 pnpm run type-check
git add backend/src/apis/asset
git commit -m "feat(asset): validazione natura/funzione, azzeramento tipo legacy, legacy-count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(Prima del commit: `git diff --numstat` e scartare file `0 0` se il type-check/lint ha toccato line ending.)

---

### Task 3: Utenza ↔ immobili N:N + migration 2

**Files:**
- Modify: `backend/src/apis/utility/entity/utility.entity.ts`
- Modify: `backend/src/apis/asset/entity/asset.entity.ts`
- Modify: `backend/src/apis/utility/dto/create-utility.dto.ts`, `update-utility.dto.ts`, `search-utility.dto.ts`
- Modify: `backend/src/apis/utility/utility.service.ts`, `utility.service.spec.ts`, `utility.module.ts`
- Modify: `backend/src/apis/map/map.service.ts`, `map.service.spec.ts` (solo adattamento compilazione: comportamento multi-marker in Task 4)
- Modify: `backend/src/data-importer/data-importer.service.ts`
- Create: `backend/src/database/migrations/1790400000001-UtilityAssetsManyToMany.ts`

**Interfaces:**
- Consumes: `Asset` (Task 1)
- Produces:
  - `Utility.assets: Asset[]` (ManyToMany owner, tabella `utility_assets(utility_id, asset_id)`), `Asset.utilities: Utility[]` (inverse). **Nessun** `Utility.asset` / `Utility.asset_id_fk`.
  - `CreateUtilityDto.asset_ids: number[]` (min 1), `UpdateUtilityDto.asset_ids?: number[]` (min 1 se presente), `SearchUtilityDto.asset_id?: number`
  - Risposte utenza con `assets[]` (ciascuno con `utilizerGrants[].utilizer`)
  - `MapService` compila usando `utility.assets` (primo immobile) — Task 4 lo estende

- [ ] **Step 1: Entity**

`utility.entity.ts`: rimuovere
```ts
  @Column({ type: 'int' })
  asset_id_fk: number;
```
e
```ts
  @ManyToOne(() => Asset, (asset) => asset.utilities)
  @JoinColumn({ name: 'asset_id_fk', referencedColumnName: 'id' })
  asset: Asset;
```
Aggiungere (import `JoinTable` da `typeorm`):
```ts
  // Immobili serviti da questa utenza (N:N, collegamento informativo — la
  // contabilità resta sul capitolo di spesa della fattura, nessuna
  // ripartizione costi). Tabella ponte utility_assets.
  @ManyToMany(() => Asset, (asset) => asset.utilities)
  @JoinTable({
    name: 'utility_assets',
    joinColumn: { name: 'utility_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];
```

`asset.entity.ts`: sostituire
```ts
  @OneToMany(() => Utility, (utility) => utility.asset)
  utilities: Utility[];
```
con
```ts
  @ManyToMany(() => Utility, (utility) => utility.assets)
  utilities: Utility[];
```
(import `ManyToMany`.)

- [ ] **Step 2: DTO**

`create-utility.dto.ts` — sostituire il blocco `asset_id_fk` con (import `ArrayMinSize`, `IsArray`):
```ts
  @IsArray({ message: 'Gli immobili associati devono essere un array.' })
  @ArrayMinSize(1, { message: 'Almeno un immobile associato è obbligatorio.' })
  @IsInt({ each: true, message: 'Ogni immobile associato deve essere un ID intero.' })
  asset_ids: number[];
```

`update-utility.dto.ts` — sostituire `asset_id_fk?: number` (con i suoi decoratori) con:
```ts
  @IsOptional()
  @IsArray({ message: 'Gli immobili associati devono essere un array.' })
  @ArrayMinSize(1, { message: 'Almeno un immobile associato è obbligatorio.' })
  @IsInt({ each: true, message: 'Ogni immobile associato deve essere un ID intero.' })
  asset_ids?: number[];
```

`search-utility.dto.ts` — sostituire `asset_id_fk?: number` con:
```ts
  // Utenze collegate a questo immobile (tra gli altri eventuali).
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  asset_id?: number;
```

- [ ] **Step 3: Test falliti `UtilitiesService`**

In `utility.service.spec.ts`:

1. `beforeEach`: aggiungere repo immobili e passarlo al costruttore:
```ts
  let assetRepo: { count: jest.Mock };
  // ...
    assetRepo = { count: jest.fn().mockResolvedValue(1) };
    service = new UtilitiesService(repo as never, assetRepo as never);
```

2. Nel test esistente `findAll ... fa i join principali ...` (riga ~124) sostituire le attese sul join `Utility.asset`/`asset.utilizerGrants` con:
```ts
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('Utility.assets', 'assets', 'assets.deleted = 0');
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
```
Stesso aggiornamento nei test `findBySafeguard` e `findOne` se asseriscono `Utility.asset`.

3. Nuovi test:
```ts
  describe('immobili associati', () => {
    it('findAll con asset_id filtra via sotto-query su utility_assets, fuori da applyFilters', async () => {
      await service.findAll({ asset_id: 7 } as never);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'Utility.id IN (SELECT ua.utility_id FROM utility_assets ua WHERE ua.asset_id = :filter_asset_id)',
        { filter_asset_id: 7 },
      );
      expect(qb.andWhere).not.toHaveBeenCalledWith('Utility.asset_id = :filter_asset_id', expect.anything());
    });

    it('create salva gli immobili come relazione deduplicata', async () => {
      assetRepo.count.mockResolvedValue(2);
      await service.create({ utility_id: 'U1', asset_ids: [3, 4, 3] } as never, 1);
      expect(assetRepo.count).toHaveBeenCalledWith({ where: { id: expect.anything(), deleted: false } });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ assets: [{ id: 3 }, { id: 4 }] }));
    });

    it('create rifiuta se un immobile non esiste o è cancellato', async () => {
      assetRepo.count.mockResolvedValue(1);
      await expect(service.create({ utility_id: 'U1', asset_ids: [3, 99] } as never, 1)).rejects.toThrow(
        'Uno o più immobili associati non esistono o sono stati eliminati.',
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('update con asset_ids sostituisce gli immobili collegati', async () => {
      assetRepo.count.mockResolvedValue(1);
      repo.findOne.mockResolvedValue({ id: 10, utility_id: 'U1', deleted: false });

      await service.update(10, { asset_ids: [5] } as never, 1);

      expect(repo.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 10, assets: [{ id: 5 }] }));
    });

    it('update senza asset_ids non tocca gli immobili collegati', async () => {
      repo.findOne.mockResolvedValue({ id: 10, utility_id: 'U1', deleted: false });

      await service.update(10, { notes: 'x' } as never, 1);

      expect(assetRepo.count).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalledWith(expect.objectContaining({ assets: expect.anything() }));
    });
  });
```

- [ ] **Step 4: Eseguire, deve fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: FAIL (join/filtri nuovi assenti, `create`/`update` senza gestione `asset_ids`).

- [ ] **Step 5: Implementazione `UtilitiesService`**

Import: `import { Asset } from '@apis/asset/entity/asset.entity';` (già presente `In`).

Costruttore:
```ts
  constructor(
    @InjectRepository(Utility)
    protected readonly repo: Repository<Utility>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }
```

In `findAll`, `findBySafeguard`, `findOne` sostituire:
```ts
    qb.leftJoinAndSelect('Utility.asset', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('asset.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
```
con:
```ts
    qb.leftJoinAndSelect('Utility.assets', 'assets', 'assets.deleted = 0');
    qb.leftJoinAndSelect('assets.utilizerGrants', 'utilizerGrants', 'utilizerGrants.deleted = 0');
```
In `findOne` (che oggi joina solo `Utility.asset`, senza concessioni) usare le stesse due righe più:
```ts
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
```
così il dialog aperto da GET singolo mostra le concessioni come quello aperto dalla riga (CLAUDE.md: findOne/findAll allineati).

In `findAll`, prima di `this.applyFilters(qb, filters, 'Utility', [...])`:
```ts
    // Filtro per immobile via sotto-query (solo WHERE): un secondo join
    // su assets per filtrare restringerebbe anche gli immobili idratati
    // nella risposta, mostrando solo quello filtrato invece di tutti.
    if (filters.asset_id) {
      qb.andWhere(
        'Utility.id IN (SELECT ua.utility_id FROM utility_assets ua WHERE ua.asset_id = :filter_asset_id)',
        { filter_asset_id: filters.asset_id },
      );
    }
```
e aggiungere `'asset_id'` all'array di esclusione di `applyFilters`.

`create` sostituito:
```ts
  async create(dto: CreateUtilityDto, userId?: number): Promise<Utility> {
    const { asset_ids, ...rest } = dto;
    const assets = await this.resolveAssets(asset_ids);
    const newUtility = this.repo.create({
      ...rest,
      assets,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
    });

    try {
      const saved = await this.repo.save(newUtility);
      await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
      return saved;
    } catch (error) {
      this.manageErrors(error, "Errore durante la creazione dell'Utenza");
    }
  }

  async update(id: number, dto: UpdateUtilityDto, userId?: number): Promise<Utility> {
    const { asset_ids, ...rest } = dto;
    const assets = asset_ids !== undefined ? await this.resolveAssets(asset_ids) : undefined;

    await super.update(id, rest as UpdateUtilityDto, userId);

    if (assets !== undefined) {
      // repo.findOne diretto (non this.findOne, che proietta i campi del
      // contratto corrente — vedi remove()).
      const entity = await this.repo.findOne({ where: { id } as never });
      entity.assets = assets;
      await this.repo.save(entity);
    }

    return this.findOne(id);
  }

  // Deduplica e verifica che ogni immobile esista e non sia cancellato,
  // altrimenti 400 (niente righe orfane in utility_assets).
  private async resolveAssets(assetIds: number[]): Promise<Asset[]> {
    const ids = [...new Set(assetIds)];
    const found = await this.assetRepo.count({ where: { id: In(ids), deleted: false } });
    if (found !== ids.length) {
      throw new BadRequestException('Uno o più immobili associati non esistono o sono stati eliminati.');
    }
    return ids.map((assetId) => ({ id: assetId }) as Asset);
  }
```

`utility.module.ts`:
```ts
import { Asset } from '@apis/asset/entity/asset.entity';
// ...
  imports: [TypeOrmModule.forFeature([Utility, Contract, Asset])],
```

- [ ] **Step 6: Eseguire, deve passare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utility/utility.service.spec.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: `MapService` — adattamento minimo per compilare**

In `map.service.ts`:
- query immobili qualificanti:
```ts
      const rows = await this.utilityRepo.find({
        where: { deleted: false, utility_type_id_fk: In(filters.utilityTypeIds) },
        relations: { assets: true },
      });
      qualifyingAssetIds = [...new Set(rows.flatMap((r) => (r.assets ?? []).map((a) => a.id)))];
```
- query utenze: `relations: { assets: true, utilityType: true }` e filtro aggregato `{ assets: { asset_type_id: In(filters.assetAggregatorIds) } }`
- nel loop utenze e in `resolveUtilityPosition` usare `const asset = utility.assets?.[0];` al posto di `utility.asset` (comportamento "primo immobile", esteso in Task 4).

In `map.service.spec.ts` sostituire nei mock `asset: {...}` con `assets: [{...}]`, `{ asset_id_fk: 7 }` con `{ assets: [{ id: 7 }] }` (e analoghi 7/9), e l'attesa `asset: { asset_type_id: In([3, 4]) }` con `assets: { asset_type_id: In([3, 4]) }`.

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map --maxWorkers=2`
Expected: PASS.

- [ ] **Step 8: Data importer**

In `data-importer.service.ts` (import utenze, ~riga 661):
```ts
      const assetRaw = row['id_fabbricato']?.trim().toLowerCase();
      const importedAssetId = assetRaw ? (assetMap.get(assetRaw) ?? null) : null;
```
e nel `this.utilityRepo.create({...})` sostituire `asset_id_fk,` con:
```ts
        // Fonte Access: un solo fabbricato per utenza.
        assets: importedAssetId ? [{ id: importedAssetId } as Asset] : [],
```
Il blocco concessioni (~riga 852, `utilizer_grant.asset_id_fk`) resta invariato: è un'altra tabella.

- [ ] **Step 9: Type-check (deve essere pulito prima della migration)**

Run: `docker exec utenzepa-api-1 pnpm run type-check`
Expected: nessun errore. Se restano riferimenti a `asset_id_fk`/`.asset` su `Utility`: `grep -rn "asset_id_fk\|utility\.asset\b\|Utility\.asset\b" backend/src --include=*.ts | grep -v "utilizer\|migrations"` e correggere.

- [ ] **Step 10: Verifica dati prima della migration**

```bash
docker exec utenzepa-mysql-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" mydatabase -e "SELECT COUNT(*) tot, SUM(asset_id_fk IN (SELECT id FROM assets)) validi FROM utilities; SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=\"utilities\" AND COLUMN_NAME=\"asset_id_fk\" AND REFERENCED_TABLE_NAME IS NOT NULL;"' 2>&1 | grep -v Warning
```
Expected: annotare `tot` e `validi` (localmente 658/658 atteso) e se la FK esiste (localmente assente, in un DB creato da `InitialSchema` c'è `FK_38725bd397adb97762016779410`).

- [ ] **Step 11: Migration 2 — scrivere FUORI dalla cartella migrations**

`backend/tmp-migrations/1790400000001-UtilityAssetsManyToMany.ts`:
```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Utenza collegata a N immobili: utilities.asset_id_fk -> utility_assets.
// La FK su asset_id_fk può mancare (DB con drift da SYNCHRONIZE), quindi
// viene cercata in information_schema invece che droppata per nome fisso.
// Righe con asset_id_fk orfano (immobile inesistente) non vengono copiate:
// violerebbero la FK di utility_assets.
export class UtilityAssetsManyToMany1790400000001 implements MigrationInterface {
  name = 'UtilityAssetsManyToMany1790400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`utility_assets\` (\`utility_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_6a78e3644e9b3a68f91f800383\` (\`utility_id\`), INDEX \`IDX_6b956a83b22d24a66fe634ab1c\` (\`asset_id\`), PRIMARY KEY (\`utility_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` ADD CONSTRAINT \`FK_6a78e3644e9b3a68f91f800383c\` FOREIGN KEY (\`utility_id\`) REFERENCES \`utilities\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utility_assets\` ADD CONSTRAINT \`FK_6b956a83b22d24a66fe634ab1ce\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `INSERT INTO \`utility_assets\` (\`utility_id\`, \`asset_id\`) SELECT u.\`id\`, u.\`asset_id_fk\` FROM \`utilities\` u WHERE u.\`asset_id_fk\` IN (SELECT a.\`id\` FROM \`assets\` a)`,
    );

    const fks: { name: string }[] = await queryRunner.query(
      `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'utilities' AND COLUMN_NAME = 'asset_id_fk' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    );
    for (const fk of fks) {
      await queryRunner.query(`ALTER TABLE \`utilities\` DROP FOREIGN KEY \`${fk.name}\``);
    }
    await queryRunner.query(`ALTER TABLE \`utilities\` DROP COLUMN \`asset_id_fk\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Lossy: un'utenza con più immobili torna al solo immobile con id
    // minore; resta nullable (utenze senza immobile non ripristinabili).
    await queryRunner.query(`ALTER TABLE \`utilities\` ADD \`asset_id_fk\` int NULL`);
    await queryRunner.query(
      `UPDATE \`utilities\` u JOIN (SELECT \`utility_id\`, MIN(\`asset_id\`) AS asset_id FROM \`utility_assets\` GROUP BY \`utility_id\`) x ON x.\`utility_id\` = u.\`id\` SET u.\`asset_id_fk\` = x.asset_id`,
    );
    await queryRunner.query(
      `ALTER TABLE \`utilities\` ADD CONSTRAINT \`FK_38725bd397adb97762016779410\` FOREIGN KEY (\`asset_id_fk\`) REFERENCES \`assets\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE \`utility_assets\` DROP FOREIGN KEY \`FK_6b956a83b22d24a66fe634ab1ce\``);
    await queryRunner.query(`ALTER TABLE \`utility_assets\` DROP FOREIGN KEY \`FK_6a78e3644e9b3a68f91f800383c\``);
    await queryRunner.query(`DROP TABLE \`utility_assets\``);
  }
}
```

- [ ] **Step 12: Spostare, eseguire, verificare conteggi**

```bash
cd /c/Users/mirko.daddiego/Documents/utenzepa/backend
mv tmp-migrations/1790400000001-UtilityAssetsManyToMany.ts src/database/migrations/
docker restart utenzepa-api-1
```
Poi (comando separato):
```bash
docker logs utenzepa-api-1 --tail 40 2>&1 | grep -i "migration\|error\|successfully started"
docker exec utenzepa-mysql-1 sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" mydatabase -e "SELECT COUNT(*) FROM utility_assets; SHOW COLUMNS FROM utilities LIKE \"asset_id_fk\";"' 2>&1 | grep -v Warning
```
Expected: migration eseguita, app avviata; `COUNT(*)` = `validi` dello Step 10; nessuna colonna `asset_id_fk`.

- [ ] **Step 13: Drift check + secondo riavvio pulito**

Ripetere Task 1 Step 17 cercando `utility_assets|asset_id_fk`:
```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate tmp-migrations/DriftCheck -d src/database/data-source.ts
docker exec -u root utenzepa-api-1 sh -c 'grep -E "utility_assets|asset_id_fk\`\) REFERENCES|utilities\` ADD \`asset_id_fk" tmp-migrations/*DriftCheck.ts || echo NO_DRIFT'
docker exec -u root utenzepa-api-1 sh -c 'rm -f tmp-migrations/*DriftCheck.ts && chown -R 1000:1000 tmp-migrations'
docker restart utenzepa-api-1
```
Expected: `NO_DRIFT`; dopo il riavvio i log non mostrano migration nuove e l'app parte.

- [ ] **Step 14: Smoke test HTTP**

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3010/api/v1/utilities?asset_id=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a.length, JSON.stringify(a[0]?.assets?.map(x=>x.id)))})"
```
(Path del controller utenze: verificare con `grep -n "@Controller" backend/src/apis/utility/utility.controller.ts` e adattare.)
Expected: elenco utenze dell'immobile 1, ciascuna con `assets` contenente `1`.

- [ ] **Step 15: Commit**

```bash
docker exec utenzepa-api-1 pnpm run type-check
git add backend/src/apis/utility backend/src/apis/asset/entity/asset.entity.ts backend/src/apis/map backend/src/data-importer/data-importer.service.ts backend/src/database/migrations/1790400000001-UtilityAssetsManyToMany.ts
git commit -m "feat(utility): utenza collegata a più immobili (utility_assets)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mappa backend — icona funzione, nuovi filtri, marker per ogni immobile

**Files:**
- Modify: `backend/src/apis/map/dto/map-query.dto.ts`
- Modify: `backend/src/apis/map/map.service.ts`, `map.service.spec.ts`

**Interfaces:**
- Consumes: `Asset.assetFunction`, `Asset.nature_id/function_id/status`, `Utility.assets` (Task 1-3)
- Produces: `MapQueryDto` `+ natureIds?: number[]`, `functionIds?: number[]`, `statuses?: AssetStatusEnum[]` (stringa CSV); `MapPoint` invariato nella forma; per utenza senza GPS proprio un punto per ogni immobile collegato localizzabile.

- [ ] **Step 1: DTO**

In `map-query.dto.ts` aggiungere (stesso `Transform` CSV già usato per `assetAggregatorIds`):
```ts
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => Number(v))
          .filter((n: number) => !Number.isNaN(n)),
  )
  @IsInt({ each: true })
  natureIds?: number[];

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((v: string) => Number(v))
          .filter((n: number) => !Number.isNaN(n)),
  )
  @IsInt({ each: true })
  functionIds?: number[];

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === undefined ? undefined : String(value).split(',').filter((v) => v !== ''),
  )
  @IsEnum(AssetStatusEnum, { each: true })
  statuses?: AssetStatusEnum[];
```
(import `IsEnum`, `AssetStatusEnum`.)

- [ ] **Step 2: Test falliti**

In `map.service.spec.ts`:
```ts
  it('icona immobile: funzione se presente, altrimenti vecchio aggregato', async () => {
    assetRepo.find.mockResolvedValue([
      { id: 5, asset_name: 'A', address: 'x', latitude: '42.5', longitude: '14.1', assetFunction: { icon: 'sports_soccer' }, assetAggregator: { icon: 'school' } },
      { id: 6, asset_name: 'B', address: 'x', latitude: '42.6', longitude: '14.2', assetFunction: null, assetAggregator: { icon: 'school' } },
    ]);
    utilityRepo.find.mockResolvedValue([]);

    const { points } = await service.getPoints({});

    expect(points.map((p) => p.icon)).toEqual(['sports_soccer', 'school']);
  });

  it('natureIds/functionIds/statuses filtrano immobili e utenze (via immobili collegati)', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([]);

    await service.getPoints({ natureIds: [1], functionIds: [2], statuses: ['Attivo'] as never });

    const assetWhere = { nature_id: In([1]), function_id: In([2]), status: In(['Attivo']) };
    expect(assetRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining(assetWhere) }));
    expect(utilityRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assets: expect.objectContaining(assetWhere) }) }),
    );
  });

  it('utenza senza gps collegata a due immobili produce un punto per ciascuno', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      {
        id: 20, utility_id: 'UT-20', latitude: null, longitude: null,
        assets: [
          { id: 1, address: 'Via A', latitude: '42.1', longitude: '14.1' },
          { id: 2, address: 'Via B', latitude: '42.2', longitude: '14.2' },
        ],
      },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points).toEqual([
      { id: 20, type: 'utility', name: 'UT-20', address: 'Via A', lat: '42.1', lng: '14.1', source: 'gps', assetId: 1 },
      { id: 20, type: 'utility', name: 'UT-20', address: 'Via B', lat: '42.2', lng: '14.2', source: 'gps', assetId: 2 },
    ]);
    expect(ungeolocated).toEqual([]);
  });

  it('utenza con gps proprio e due immobili produce un solo punto (assetId = primo)', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 21, utility_id: 'UT-21', latitude: '43.0', longitude: '15.0', assets: [{ id: 1, address: 'Via A' }, { id: 2, address: 'Via B' }] },
    ]);

    const { points } = await service.getPoints({});

    expect(points).toEqual([
      { id: 21, type: 'utility', name: 'UT-21', address: 'Via A', lat: '43.0', lng: '15.0', source: 'gps', assetId: 1 },
    ]);
  });

  it('utenza con un immobile localizzabile e uno no: punto solo sul primo, nessuna voce ungeolocated', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 22, utility_id: 'UT-22', latitude: null, longitude: null, assets: [{ id: 1, address: 'Via A', latitude: '42.1', longitude: '14.1' }, { id: 2, address: null }] },
    ]);

    const { points, ungeolocated } = await service.getPoints({});

    expect(points.map((p) => p.assetId)).toEqual([1]);
    expect(ungeolocated).toEqual([]);
  });

  it('utenza senza posizione su nessun immobile compare una sola volta in ungeolocated', async () => {
    assetRepo.find.mockResolvedValue([]);
    utilityRepo.find.mockResolvedValue([
      { id: 23, utility_id: 'UT-23', latitude: null, longitude: null, assets: [{ id: 1, address: 'Via A' }, { id: 2, address: null }] },
    ]);

    const { ungeolocated } = await service.getPoints({});

    expect(ungeolocated).toEqual([{ id: 23, type: 'utility', name: 'UT-23', reason: 'geocode_failed' }]);
  });
```

- [ ] **Step 3: Eseguire, deve fallire**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map --maxWorkers=2`
Expected: FAIL sui 6 nuovi test.

- [ ] **Step 4: Implementazione**

In `getPoints`, dopo `qualifyingAssetIds`, costruire un unico filtro immobile riusato da immobili e utenze:
```ts
    // Filtri classificazione immobile — stessi criteri sugli immobili e sulle
    // utenze (tramite gli immobili collegati). Con where su una relazione
    // ManyToMany TypeORM idrata solo gli immobili che matchano: un'utenza
    // collegata a un immobile filtrato e a uno no compare solo sul primo.
    const assetClassWhere = {
      ...(filters.assetAggregatorIds?.length ? { asset_type_id: In(filters.assetAggregatorIds) } : {}),
      ...(filters.natureIds?.length ? { nature_id: In(filters.natureIds) } : {}),
      ...(filters.functionIds?.length ? { function_id: In(filters.functionIds) } : {}),
      ...(filters.statuses?.length ? { status: In(filters.statuses) } : {}),
    };
    const hasAssetClassFilter = Object.keys(assetClassWhere).length > 0;
```

Query immobili:
```ts
      const assets = await this.assetRepo.find({
        where: {
          deleted: false,
          ...assetClassWhere,
          ...(qualifyingAssetIds !== null ? { id: In(qualifyingAssetIds.length ? qualifyingAssetIds : [-1]) } : {}),
        },
        relations: { assetAggregator: true, assetFunction: true },
      });
```
e `icon: asset.assetFunction?.icon ?? asset.assetAggregator?.icon ?? null,`

Query utenze:
```ts
      const utilities = await this.utilityRepo.find({
        where: {
          deleted: false,
          ...(filters.utilityTypeIds?.length ? { utility_type_id_fk: In(filters.utilityTypeIds) } : {}),
          ...(hasAssetClassFilter ? { assets: assetClassWhere } : {}),
        },
        relations: { assets: true, utilityType: true },
      });
```

Loop utenze sostituito:
```ts
      for (const utility of utilities) {
        const linked = utility.assets ?? [];
        const base = { id: utility.id, type: 'utility' as const, name: utility.utility_id, hardType: utility.utilityType?.hard_type };

        // Contatore con GPS proprio: è fisicamente in un punto solo.
        if (isSet(utility.latitude) && isSet(utility.longitude)) {
          points.push({
            ...base,
            address: linked[0]?.address ?? null,
            lat: utility.latitude,
            lng: utility.longitude,
            source: 'gps',
            assetId: linked[0]?.id ?? null,
          });
          continue;
        }

        // Senza GPS proprio: un marker per ogni immobile collegato
        // localizzabile (stesso id utenza, assetId diverso).
        let placed = 0;
        for (const asset of linked) {
          const position = this.resolveAssetPosition(asset);
          if (!position) continue;
          points.push({
            ...base,
            address: asset.address ?? null,
            lat: position.lat,
            lng: position.lng,
            source: position.source,
            assetId: asset.id,
          });
          placed++;
        }

        if (placed === 0) {
          ungeolocated.push({
            id: utility.id,
            type: 'utility',
            name: utility.utility_id,
            reason: linked.some((a) => isSet(a.address)) ? 'geocode_failed' : 'no_address',
          });
        }
      }
```
Rimuovere `resolveUtilityPosition` (non più usato). Se i test esistenti si aspettano `hardType` assente come chiave quando `utilityType` manca, mantenere l'ordine/forma: `hardType: undefined` viene ignorato da `toEqual` (chiavi `undefined` equivalenti a mancanti) — verificare eseguendo.

- [ ] **Step 5: Eseguire, deve passare**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map --maxWorkers=2`
Expected: PASS (tutti, vecchi e nuovi).

- [ ] **Step 6: Commit**

```bash
docker exec utenzepa-api-1 pnpm run type-check
git add backend/src/apis/map
git commit -m "feat(map): icona da funzione, filtri natura/funzione/stato, marker per immobile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend — pagine Impostazioni Natura/Funzione, aggregati in sola lettura

**Files:**
- Create: `frontend/src/app/pages/asset-function/entity/asset-function.entity.ts`, `asset-function.service.ts`, `asset-function.component.ts`, `asset-function.component.html`, `search-asset-function.component.ts`, `data-table-asset-function.component.ts`, `data-table-asset-function.component.html`, `asset-function-edit-dialog.component.ts`, `asset-function-edit-dialog.component.html`, `asset-function-filter-dialog.component.ts`
- Create: `frontend/src/app/pages/asset-nature/` — stessi file con prefisso `asset-nature`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`
- Modify: `frontend/src/app/pages/asset-aggregator/data-table-asset-aggregator.component.html`, `asset-aggregator.component.html`, `asset-aggregator-edit-dialog.component.ts`

**Interfaces:**
- Consumes: REST `/asset-functions`, `/asset-natures` (Task 1)
- Produces:
  - `AssetFunction` (FE) `{ id; name: string; icon?: string | null }`, `AssetFunctionsService` (`BASE_URL = apiUrl + '/asset-functions'`)
  - `AssetNature` (FE) `{ id; name: string; function_ids?: number[]; functions?: AssetFunction[] (Exclude toPlainOnly) }`, `AssetNaturesService` (`BASE_URL = apiUrl + '/asset-natures'`)
  - route `asset-nature`, `asset-function`

- [ ] **Step 1: Entity e service Funzione**

`pages/asset-function/entity/asset-function.entity.ts`:
```ts
import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';

export class AssetFunction extends AbstractEntity {
  name!: string;
  icon?: string | null;

  static create(data?: Partial<AssetFunction>): AssetFunction {
    return plainToInstance(AssetFunction, {id: 0, name: '', icon: null, ...data});
  }
}
```

`pages/asset-function/asset-function.service.ts`:
```ts
import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {AssetFunction} from './entity/asset-function.entity';

@Injectable({providedIn: 'root'})
export class AssetFunctionsService extends AbstractService<AssetFunction> {
  protected override readonly BASE_URL = environment.apiUrl + '/asset-functions';
  protected override readonly entityClass = AssetFunction;
}
```

- [ ] **Step 2: Pagina Funzioni**

`asset-function-filter-dialog.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';

interface NameFilterValues {
  name: string | null;
}

@Component({
  selector: 'app-asset-function-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri di ricerca</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: flex; flex-direction: column; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome</mat-label>
          <input matInput formControlName="name">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci Filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica Filtri</button>
    </mat-dialog-actions>
  `
})
export class AssetFunctionFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetFunctionFilterDialogComponent, NameFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<NameFilterValues>>(MAT_DIALOG_DATA);

  form = this.fb.group({name: [this.data.values.name ?? '']});

  apply(): void {
    this.dialogRef.close(this.form.getRawValue());
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

`search-asset-function.component.ts` (riusa il template dell'aggregato, identico):
```ts
import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {AbstractSearchComponent} from '../../core/components/abstract-search.component';
import {AssetFunctionFilterDialogComponent} from './asset-function-filter-dialog.component';

@Component({
  selector: 'app-search-asset-function',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: '../asset-aggregator/search-asset-aggregator.component.html',
})
export class SearchAssetFunctionComponent extends AbstractSearchComponent {
  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({qsearch: [''], name: ['']});
  }

  override filterDialogComponent(): Type<unknown> {
    return AssetFunctionFilterDialogComponent;
  }
}
```

`asset-function-edit-dialog.component.ts` (icona: stesso autocomplete + picker dell'aggregato):
```ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {AssetAggregatorIconOptions, ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {IconPickerDialogComponent} from '../asset-aggregator/icon-picker-dialog.component';
import {AssetFunction} from './entity/asset-function.entity';

@Component({
  selector: 'app-asset-function-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatAutocompleteModule,
    MatIconModule, MatButtonModule, MatTooltipModule, HasRoleDirective, ReadOnlyDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-function-edit-dialog.component.html'
})
export class AssetFunctionEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetFunctionEditDialogComponent, AssetFunction | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<AssetFunction>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;
  filteredIconOptions = AssetAggregatorIconOptions;

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    icon: [this.data.item.icon ?? ASSET_AGGREGATOR_ICON_FALLBACK],
  });

  constructor() {
    this.form.controls.icon.valueChanges.subscribe((term) => {
      const t = (term ?? '').trim().toLowerCase();
      this.filteredIconOptions = t
        ? AssetAggregatorIconOptions.filter((o) => o.value.includes(t) || o.label.toLowerCase().includes(t))
        : AssetAggregatorIconOptions;
    });
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') this.form.disable();
  }

  openIconPicker(): void {
    this.dialog
      .open(IconPickerDialogComponent, {width: '480px', data: {currentIcon: this.form.controls.icon.value}})
      .afterClosed()
      .subscribe((result?: string) => {
        if (result) this.form.controls.icon.setValue(result);
      });
  }

  save(): void {
    if (!this.form.valid) return;
    this.dialogRef.close(plainToInstance(AssetFunction, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

`asset-function-edit-dialog.component.html`:
```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuova funzione immobile' : 'Modifica funzione immobile: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-wrap: wrap; gap: 1rem;">
    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="name">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <mat-form-field style="flex: 1 1 100%;">
      <mat-label>Icona mappa</mat-label>
      <mat-icon matPrefix style="margin-right: 0.5rem;">{{ form.controls.icon.value || iconFallback }}</mat-icon>
      <input matInput formControlName="icon" [matAutocomplete]="iconAuto" placeholder="Cerca o digita un nome icona...">
      <button mat-icon-button matSuffix type="button" matTooltip="Cerca in tutto il catalogo Material Icons" (click)="openIconPicker()">
        <mat-icon>search</mat-icon>
      </button>
      <mat-autocomplete #iconAuto="matAutocomplete">
        @for (opt of filteredIconOptions; track opt.value) {
          <mat-option [value]="opt.value">
            <mat-icon style="vertical-align: middle; margin-right: 0.5rem;">{{ opt.value }}</mat-icon>
            {{ opt.label }}
          </mat-option>
        }
      </mat-autocomplete>
    </mat-form-field>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

`data-table-asset-function.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, Type} from '@angular/core';
import {MatTableModule} from '@angular/material/table';
import {MatSortModule} from '@angular/material/sort';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {AssetFunction} from './entity/asset-function.entity';
import {AssetFunctionEditDialogComponent} from './asset-function-edit-dialog.component';

@Component({
  selector: 'app-data-table-asset-function',
  standalone: true,
  imports: [MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatIconModule, MatTooltipModule, MatProgressBarModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './data-table-asset-function.component.html'
})
export class DataTableAssetFunctionComponent extends AbstractDataTableComponent<AssetFunction> {
  displayedColumns = ['actions', 'id', 'icon', 'name'];
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): AssetFunction {
    return AssetFunction.create();
  }

  override editDialogComponent(): Type<unknown> {
    return AssetFunctionEditDialogComponent;
  }

  protected override entityLabel(): string {
    return 'funzione immobile';
  }

  override openDeleteDialog(entity: AssetFunction): void {
    this.dialog.open(ConfirmDialogComponent, {
      width: '350px',
      data: {title: 'Elimina funzione', message: `Eliminare la funzione immobile ${entity.name}?`, confirmLabel: 'Elimina', danger: true}
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.onDelete.emit(entity);
    });
  }
}
```

`data-table-asset-function.component.html`: copia di `data-table-asset-aggregator.component.html` con queste differenze:
- pulsante: `Aggiungi funzione`
- colonne `code`/`description` sostituite da una sola:
```html
  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
    <td mat-cell *matCellDef="let item">{{ item.name }}</td>
  </ng-container>
```
- riga vuota: `Nessuna funzione immobile trovata.`

`asset-function.component.ts`:
```ts
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {AbstractComponent} from '../../core/components/abstract.component';
import {AssetFunction} from './entity/asset-function.entity';
import {AssetFunctionsService} from './asset-function.service';
import {DataTableAssetFunctionComponent} from './data-table-asset-function.component';
import {SearchAssetFunctionComponent} from './search-asset-function.component';

@Component({
  selector: 'app-asset-function',
  standalone: true,
  imports: [DataTableAssetFunctionComponent, SearchAssetFunctionComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-function.component.html'
})
export class AssetFunctionComponent extends AbstractComponent<AssetFunction> {
  constructor(protected override service: AssetFunctionsService) {
    super();
    this.qsearchFields = ['name'];
  }

  protected override getEntityIdentifier(entity: AssetFunction): string {
    return entity.name ?? '';
  }

  protected override entityLabel(): string {
    return 'Funzione';
  }

  protected override entityToPayload(entity: AssetFunction): Partial<AssetFunction> {
    return {name: entity.name, icon: entity.icon, created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }
}
```

`asset-function.component.html`:
```html
<div style="padding: 1rem;">
  <div>
    <h1>Funzioni Immobili</h1>
    <p style="color: #6A7282;">A cosa serve un immobile (Istruzione, Sport, Illuminazione…). Le combinazioni ammesse si impostano sulla Natura.</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-asset-function (search)="onSearch($event)"></app-search-asset-function>
  </div>
  <div style="margin-top: 1.5rem;">
    <app-data-table-asset-function
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-asset-function>
  </div>
</div>
```

- [ ] **Step 3: Entity, service e pagina Natura**

`pages/asset-nature/entity/asset-nature.entity.ts`:
```ts
import {Exclude, plainToInstance, Type} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {AssetFunction} from '../../asset-function/entity/asset-function.entity';

export class AssetNature extends AbstractEntity {
  name!: string;
  // Inviato al backend (sostituisce le coppie ammesse); in lettura si
  // ricava da `functions`.
  function_ids?: number[];

  @Exclude({toPlainOnly: true})
  @Type(() => AssetFunction)
  functions?: AssetFunction[];

  static create(data?: Partial<AssetNature>): AssetNature {
    return plainToInstance(AssetNature, {id: 0, name: '', functions: [], ...data});
  }
}
```

`asset-nature.service.ts`: come `AssetFunctionsService` con `AssetNaturesService`, `BASE_URL = environment.apiUrl + '/asset-natures'`, `entityClass = AssetNature`.

`asset-nature-filter-dialog.component.ts`: identico a quello delle funzioni, classe `AssetNatureFilterDialogComponent`, selector `app-asset-nature-filter-dialog`.

`search-asset-nature.component.ts`: identico a quello delle funzioni, classe `SearchAssetNatureComponent`, selector `app-search-asset-nature`, dialog `AssetNatureFilterDialogComponent`.

`asset-nature-edit-dialog.component.ts`:
```ts
import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {TOption} from '../../core/types/option.interface';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {AssetNature} from './entity/asset-nature.entity';

@Component({
  selector: 'app-asset-nature-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective, MultiSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-nature-edit-dialog.component.html'
})
export class AssetNatureEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetNatureEditDialogComponent, AssetNature | undefined>);
  private authService = inject(AuthService);
  private functionsService = inject(AssetFunctionsService);
  protected data = inject<EditDialogData<AssetNature>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  functionOptions: TOption[] = [];

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    function_ids: [(this.data.item.functions ?? []).map(f => f.id)],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') this.form.disable();
  }

  ngOnInit(): void {
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => this.functionOptions = data.map(f => ({label: f.name, value: f.id, icon: f.icon ?? undefined})),
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
  }

  save(): void {
    if (!this.form.valid) return;
    this.dialogRef.close(plainToInstance(AssetNature, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

`asset-nature-edit-dialog.component.html`:
```html
<h2 mat-dialog-title>
  {{ isNew ? 'Nuova natura immobile' : 'Modifica natura immobile: ' + data.item.name }}
</h2>

<mat-dialog-content>
  <form [formGroup]="form" [readOnly]="['Lettore']" style="display: flex; flex-direction: column; gap: 1rem; min-width: 420px;">
    <mat-form-field>
      <mat-label>Nome *</mat-label>
      <input matInput formControlName="name">
      @if (form.controls.name.invalid && form.controls.name.touched) {
        <mat-error>Obbligatorio</mat-error>
      }
    </mat-form-field>

    <app-multi-select
      label="Funzioni ammesse"
      [options]="functionOptions"
      formControlName="function_ids">
    </app-multi-select>
  </form>
</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-stroked-button (click)="cancel()">Annulla</button>
  <button mat-flat-button (click)="save()" [disabled]="!form.valid" [appHasRole]="['Admin','Operatore']">Salva</button>
</mat-dialog-actions>
```

`data-table-asset-nature.component.ts`: come `DataTableAssetFunctionComponent` con `AssetNature`, `AssetNatureEditDialogComponent`, selector `app-data-table-asset-nature`, `displayedColumns = ['actions', 'id', 'name', 'functions']`, `entityLabel()` `'natura immobile'`, messaggio delete `Eliminare la natura immobile ${entity.name}?`, e il metodo:
```ts
  functionNames(item: AssetNature): string {
    return (item.functions ?? []).map(f => f.name).join(', ');
  }
```
(niente `iconFallback`).

`data-table-asset-nature.component.html`: come quello delle funzioni, pulsante `Aggiungi natura`, senza colonna `icon`, con in più:
```html
  <ng-container matColumnDef="functions">
    <th mat-header-cell *matHeaderCellDef>Funzioni ammesse</th>
    <td mat-cell *matCellDef="let item">{{ functionNames(item) }}</td>
  </ng-container>
```
riga vuota `Nessuna natura immobile trovata.`

`asset-nature.component.ts`: come `AssetFunctionComponent` con `AssetNature`/`AssetNaturesService`/componenti nature, selector `app-asset-nature`, `entityLabel()` `'Natura'`, e:
```ts
  protected override entityToPayload(entity: AssetNature): Partial<AssetNature> {
    return {name: entity.name, function_ids: entity.function_ids ?? [], created_by_user_id: this.userId, updated_by_user_id: this.userId};
  }
```

`asset-nature.component.html`: come quello funzioni, titolo `Nature Immobili`, sottotitolo `Cos'è fisicamente un immobile (Fabbricato, Area, Impianto…) e quali funzioni ammette.`, tag `app-search-asset-nature` / `app-data-table-asset-nature`.

- [ ] **Step 4: Route e menu**

`app.routes.ts` (import + route accanto a `asset-aggregator`):
```ts
import {AssetNatureComponent} from './pages/asset-nature/asset-nature.component';
import {AssetFunctionComponent} from './pages/asset-function/asset-function.component';
// ...
      {path: 'asset-nature', component: AssetNatureComponent},
      {path: 'asset-function', component: AssetFunctionComponent},
```

`sidebar.component.ts`, submenu Impostazioni:
```ts
        {label: 'Nature Immobili', icon: 'category', route: '/asset-nature'},
        {label: 'Funzioni Immobili', icon: 'widgets', route: '/asset-function'},
        {label: 'Aggregati Immobili (vecchio)', icon: 'list', route: '/asset-aggregator'},
```
(le prime due prima della voce aggregati, che viene rinominata.)

- [ ] **Step 5: Aggregati in sola lettura**

- `data-table-asset-aggregator.component.html`: eliminare il `<button mat-flat-button (click)="openCreateDialog()" ...>Aggiungi aggregato</button>` e il pulsante elimina/ripristina nella colonna azioni (resta solo `edit`, che apre in visualizzazione).
- `asset-aggregator-edit-dialog.component.ts`: nel costruttore, disabilitare sempre il form:
```ts
    // Classificazione legacy: sostituita da Natura/Funzione, in sola
    // lettura finché gli immobili non sono tutti riclassificati.
    this.form.disable();
```
(rimuovendo il vecchio blocco condizionato sul ruolo Lettore). Nel template del dialog togliere il pulsante `Salva`.
- `asset-aggregator.component.html`: sottotitolo `Classificazione precedente, in sola lettura. Usare Nature e Funzioni Immobili.`

- [ ] **Step 6: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK (warning budget preesistenti ammessi, nessun errore).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/asset-function frontend/src/app/pages/asset-nature frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/asset-aggregator
git commit -m "feat(frontend): anagrafiche natura/funzione immobile, aggregati in sola lettura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — immobile (dialog, tabella, filtri, banner)

**Files:**
- Create: `frontend/src/app/pages/assets/enum/asset-status.enum.ts`
- Modify: `frontend/src/app/pages/assets/entity/asset.entity.ts`, `entity/asset.interface.ts`
- Modify: `frontend/src/app/pages/assets/asset.service.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`, `.html`
- Modify: `frontend/src/app/pages/assets/data-table-assets.component.ts`
- Modify: `frontend/src/app/pages/assets/asset-filter-dialog.component.ts`, `.html`, `search-assets.component.ts`
- Modify: `frontend/src/app/pages/assets/assets.component.ts`, `.html`

**Interfaces:**
- Consumes: `AssetNaturesService`, `AssetFunctionsService`, `AssetNature.functions` (Task 5); `GET /building/legacy-count`, DTO immobile (Task 2)
- Produces: `Asset` FE con `nature_id`, `function_id`, `status`, `assetNature`, `assetFunction` (Exclude toPlainOnly); `asset_type_id` Exclude toPlainOnly; `AssetService.legacyCount(): Observable<number>`; `AssetStatus` enum FE.

- [ ] **Step 1: Enum ed entity**

`pages/assets/enum/asset-status.enum.ts`:
```ts
export enum AssetStatus {
  ATTIVO = 'Attivo',
  DISMESSO = 'Dismesso',
  DA_VERIFICARE = 'Da verificare',
}

export const ASSET_STATUS_OPTIONS = Object.values(AssetStatus).map(v => ({label: v, value: v}));
```

`entity/asset.entity.ts`:
- import `AssetNature`, `AssetFunction`, `AssetStatus`
- sostituire `asset_type_id!: number;` con:
```ts
  // Legacy in sola lettura: mai inviato al backend (non più nel DTO,
  // forbidNonWhitelisted lo rifiuterebbe).
  @Exclude({toPlainOnly: true})
  asset_type_id?: number | null;

  nature_id?: number | null;
  function_id?: number | null;
  status?: AssetStatus;

  @Exclude({toPlainOnly: true})
  @Type(() => AssetNature)
  assetNature?: AssetNature | null;

  @Exclude({toPlainOnly: true})
  @Type(() => AssetFunction)
  assetFunction?: AssetFunction | null;
```
- in `create()`: sostituire `asset_type_id: null,` con `nature_id: null, function_id: null, status: AssetStatus.ATTIVO,`

`entity/asset.interface.ts`: sostituire `asset_type_id: number` (o analogo) con `asset_type_id?: number | null; nature_id?: number | null; function_id?: number | null; status?: string;`.

- [ ] **Step 2: Service**

In `asset.service.ts` aggiungere (import `Observable`, `map` da `rxjs`):
```ts
  // Immobili ancora col vecchio "tipo immobile": banner "da riclassificare".
  legacyCount(): Observable<number> {
    return this.http
      .get<{count: number}>(`${this.BASE_URL}/legacy-count`, {headers: this.getAuthHeaders()})
      .pipe(map(r => r.count));
  }
```

- [ ] **Step 3: Dialog immobile — TS**

In `asset-edit-dialog.component.ts`:
- import `AssetNaturesService`, `AssetFunctionsService`, `AssetNature`, `AssetFunction`, `ASSET_STATUS_OPTIONS`, `AssetStatus`; rimuovere l'import di `AssetAggregatorsService`/`AssetAggregator` se non più usati.
- campi:
```ts
  private naturesService = inject(AssetNaturesService);
  private functionsService = inject(AssetFunctionsService);

  natures: AssetNature[] = [];
  private allFunctions: AssetFunction[] = [];
  statusOptions = ASSET_STATUS_OPTIONS;
```
(rimuovere `assetAggregatorsService` e `assetAggregatorOptions`.)
- nel `form` sostituire `asset_type_id: [...]` con:
```ts
    nature_id: [this.data.item.nature_id ?? null, this.mustClassify ? Validators.required : []],
    function_id: [this.data.item.function_id ?? null, this.mustClassify ? Validators.required : []],
    status: [this.data.item.status ?? AssetStatus.ATTIVO, Validators.required],
```
con, prima di `form`:
```ts
  // Obbligatori per immobili nuovi e per quelli già riclassificati (non
  // devono poter tornare "vuoti"); un immobile legacy si salva anche senza
  // riclassificarlo (tiene il vecchio tipo).
  mustClassify = this.isNew || this.data.item.asset_type_id == null;
```
- nel costruttore, dopo il blocco ruolo:
```ts
    // Cambio natura: la funzione scelta potrebbe non essere più ammessa.
    this.form.controls.nature_id.valueChanges.subscribe(() => {
      const fid = this.form.controls.function_id.value;
      if (fid != null && !this.functionOptions().some(f => f.id === fid)) {
        this.form.controls.function_id.setValue(null);
      }
    });
```
- `ngOnInit`: sostituire la `search` degli aggregatori con:
```ts
    this.naturesService.search({deleted: false} as never).subscribe({
      next: data => this.natures = data,
      error: err => console.error('Errore nel caricamento delle nature immobile:', err)
    });
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => this.allFunctions = data,
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
```
- metodi:
```ts
  // Funzioni ammesse per la natura selezionata (coppie in AssetNature.functions).
  functionOptions(): AssetFunction[] {
    const nature = this.natures.find(n => n.id === this.form.controls.nature_id.value);
    return nature?.functions ?? [];
  }

  // Badge header: vecchio tipo ancora valorizzato = immobile da riclassificare.
  legacyTypeLabel(): string | null {
    return this.data.item.asset_type_id != null ? (this.data.item.assetAggregator?.code ?? null) : null;
  }
```
- `currentAggregatorIcon()` rinominato e riscritto:
```ts
  currentAssetIcon(): string {
    const fid = this.form.controls.function_id.value;
    const fn = this.allFunctions.find(f => f.id === fid);
    return fn?.icon || this.data.item.assetAggregator?.icon || ASSET_AGGREGATOR_ICON_FALLBACK;
  }
```
- `addUtility`/`openUtilityDetail` (riferimenti a `asset_id_fk`/`asset` dell'utenza) NON si toccano qui: compilano ancora finché l'entity `Utility` FE non cambia, e vengono aggiornati in Task 7 Step 2.

- [ ] **Step 4: Dialog immobile — HTML**

Header: dopo lo `<span>` del titolo, prima dello span "Ultima modifica":
```html
  @if (legacyTypeLabel(); as legacy) {
    <span style="font-size: 0.75rem; font-weight: 500; padding: 2px 8px; border-radius: 12px; background: #fef3c7; color: #92400e; white-space: nowrap;"
          matTooltip="Classificazione precedente: sparisce dopo aver salvato natura e funzione">
      Tipo precedente: {{ legacy }}
    </span>
  }
```
(lo span "Ultima modifica" ha già `margin-left: auto` → resta a destra.)

Icona tab: `{{ currentAggregatorIcon() }}` → `{{ currentAssetIcon() }}`.

Sostituire il `mat-form-field` "Tipo immobile *" con:
```html
      <mat-form-field style="flex: 1 1 21%;">
        <mat-label>Natura{{ mustClassify ? ' *' : '' }}</mat-label>
        <mat-select formControlName="nature_id">
          <mat-option [value]="null">—</mat-option>
          @for (opt of natures; track opt.id) {
            <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
          }
        </mat-select>
        @if (form.controls.nature_id.invalid && form.controls.nature_id.touched) {
          <mat-error>Obbligatorio</mat-error>
        }
      </mat-form-field>

      <mat-form-field style="flex: 1 1 21%;">
        <mat-label>Funzione{{ mustClassify ? ' *' : '' }}</mat-label>
        <mat-select formControlName="function_id" [disabled]="form.controls.nature_id.value == null">
          <mat-option [value]="null">—</mat-option>
          @for (opt of functionOptions(); track opt.id) {
            <mat-option [value]="opt.id">
              <span><mat-icon style="vertical-align: middle; margin-right: 4px; font-size: 18px; height: 18px; width: 18px;">{{ opt.icon || 'apartment' }}</mat-icon>{{ opt.name }}</span>
            </mat-option>
          }
        </mat-select>
        @if (form.controls.nature_id.value == null) {
          <mat-hint>Scegliere prima la natura</mat-hint>
        }
        @if (form.controls.function_id.invalid && form.controls.function_id.touched) {
          <mat-error>Obbligatorio</mat-error>
        }
      </mat-form-field>

      <mat-form-field style="flex: 1 1 21%;">
        <mat-label>Stato *</mat-label>
        <mat-select formControlName="status">
          @for (opt of statusOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
```
Nota: `[disabled]` su `mat-select` con reactive forms genera un warning Angular; se compare in console, sostituirlo con `this.form.controls.function_id.disable()/enable()` nella subscribe `nature_id.valueChanges` e nel costruttore (mai inline sull'host `mat-option`: CLAUDE.md).

- [ ] **Step 5: Tabella, filtri, banner**

`data-table-assets.component.ts` — in `allColumns` sostituire la riga `assetAggregator.description` con:
```ts
    {field: 'assetNature.name', header: 'Natura', minWidth: '120px'},
    {field: 'assetFunction.name', header: 'Funzione', minWidth: '150px'},
    {field: 'status', header: 'Stato', minWidth: '100px'},
    {field: 'assetAggregator.code', header: 'Tipo precedente', minWidth: '150px'},
```
`defaultVisibleFields`: sostituire `'assetAggregator.description'` con `'assetNature.name', 'assetFunction.name', 'status', 'assetAggregator.code'`.
In `exportCellValue` sostituire il `case 'assetAggregator.description'` con:
```ts
      case 'assetAggregator.code':
        return item.asset_type_id != null ? (item.assetAggregator?.code ?? '') : '';
```
Nota: la selezione colonne è salvata in `localStorage` (`columns:assets`) e contiene ancora `assetAggregator.description`: verificare che `loadColumnSelection` scarti campi non presenti in `allColumns` (leggere `AbstractDataTableComponent.loadColumnSelection`); se non li scarta, aggiungere il filtro `saved.filter(f => allColumns.some(c => c.field === f))` lì.

`asset-filter-dialog.component.ts` — `AssetFilterValues`: aggiungere `nature_id: number | null; function_id: number | null; status: string | null; legacy_only: boolean | null;`. Nel form:
```ts
    nature_id: [this.data.values.nature_id ?? null],
    function_id: [this.data.values.function_id ?? null],
    status: [this.data.values.status ?? null],
    legacy_only: [this.data.values.legacy_only ?? null],
```
Opzioni: iniettare `AssetNaturesService`/`AssetFunctionsService`, popolare `natureOptions: TOption[]`/`functionOptions: TOption[]` (`label: name, value: id`), `statusOptions = ASSET_STATUS_OPTIONS`. Label del filtro `asset_type_id`: `Tipo precedente`.

`asset-filter-dialog.component.html` — dopo il blocco "Tipo immobile" (label → `Tipo precedente`):
```html
      <div style="flex: 1 1 calc(25% - 0.75rem);">
        <app-filterable-select label="Natura" placeholder="Cerca..." [options]="natureOptions" formControlName="nature_id"></app-filterable-select>
      </div>
      <div style="flex: 1 1 calc(25% - 0.75rem);">
        <app-filterable-select label="Funzione" placeholder="Cerca..." [options]="functionOptions" formControlName="function_id"></app-filterable-select>
      </div>
      <mat-form-field style="flex: 1 1 calc(25% - 0.75rem);">
        <mat-label>Stato</mat-label>
        <mat-select formControlName="status">
          <mat-option [value]="null">—</mat-option>
          @for (opt of statusOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-checkbox formControlName="legacy_only" style="flex: 1 1 calc(25% - 0.75rem);">Solo da riclassificare</mat-checkbox>
```
(import `MatCheckboxModule` nel componente.)

`search-assets.component.ts` — nel `qSearch` group aggiungere `nature_id: [null], function_id: [null], status: [null], legacy_only: [null],`.

`assets.component.ts`:
```ts
  legacyCount = 0;

  override loadAll() {
    // ... corpo esistente invariato ...
    this.service.legacyCount().subscribe({
      next: n => this.legacyCount = n,
      error: () => this.legacyCount = 0
    });
  }

  showLegacyOnly(): void {
    this.onSearch({legacy_only: true});
  }
```
(la chiamata `legacyCount()` va dentro `loadAll` dopo la `search` esistente.)

`assets.component.html` — tra header e ricerca:
```html
  @if (legacyCount > 0) {
    <div style="margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 6px; background: #fef3c7; color: #92400e; display: flex; align-items: center; gap: 0.75rem;">
      <mat-icon>info</mat-icon>
      <span><strong>{{ legacyCount }}</strong> immobili da riclassificare (natura e funzione mancanti).</span>
      <button mat-stroked-button style="margin-left: auto;" (click)="showLegacyOnly()">Mostra</button>
    </div>
  }
```
(import `MatIconModule`, `MatButtonModule` nel componente.)

- [ ] **Step 6: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK. Errori residui su `asset_id_fk`/`asset` dell'utenza si risolvono in Task 7 (vedi nota Step 3).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/assets
git commit -m "feat(frontend): classificazione immobile natura/funzione/stato, banner da riclassificare

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — utenza collegata a più immobili

**Files:**
- Modify: `frontend/src/app/pages/utilities/entity/utility.entity.ts`, `entity/utility.interface.ts`
- Modify: `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`, `.html`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts`, `.html`
- Modify: `frontend/src/app/pages/utilities/utility-filter-dialog.component.ts`, `.html`, `search-utilities.component.ts`

**Interfaces:**
- Consumes: DTO utenza `asset_ids`, search `asset_id`, risposta `assets[]` (Task 3)
- Produces: `Utility` FE `asset_ids?: number[]`, `assets?: Asset[]` (Exclude toPlainOnly); nessun `asset_id_fk`/`asset`.

- [ ] **Step 1: Entity**

`utility.entity.ts`: sostituire `asset_id_fk!: number;` con `asset_ids?: number[];` e
```ts
  @Exclude({toPlainOnly: true})
  asset?: Asset;
```
con
```ts
  @Exclude({toPlainOnly: true})
  @Type(() => Asset)
  assets?: Asset[];
```
`utility.interface.ts`: `asset?: IAsset; asset_id_fk: number;` → `assets?: IAsset[]; asset_ids?: number[];`

- [ ] **Step 2: Dialog utenza — TS**

In `utility-edit-dialog.component.ts`:
- import `MultiSelectComponent` e aggiungerlo agli `imports` del componente.
- form: sostituire la riga `asset_id_fk` con:
```ts
    asset_ids: [(this.data.item.assets ?? []).map(a => a.id), [Validators.required, Validators.minLength(1)]],
```
- `resolveMapCoordsFromForm()` e `isMapCoordsFromAsset()`: sostituire `const asset = this.data.item.asset;` con `const asset = this.primaryAsset();` e aggiungere:
```ts
  // Mini-mappa/fallback coordinate: primo immobile selezionato che ha una
  // posizione (GPS reale o geocodificata).
  private primaryAsset(): Asset | undefined {
    const ids = this.form.controls.asset_ids.value ?? [];
    const candidates = ids
      .map(id => this.assetOptions.find(a => a.id === id) ?? this.data.item.assets?.find(a => a.id === id))
      .filter((a): a is Asset => !!a);
    return candidates.find(a => (a.latitude ?? a.geocoded_latitude) && (a.longitude ?? a.geocoded_longitude)) ?? candidates[0];
  }

  selectedAssetOptions(): TOption[] {
    const ids = this.form.controls.asset_ids.value ?? [];
    return ids.map(id => this.assetSelectOptions.find(o => o.value === id) ?? {label: `#${id}`, value: id});
  }
```
- `navigateToAsset(assetId)` resta invariato (chiamato per singolo immobile).

In `frontend/src/app/pages/assets/asset-edit-dialog.component.ts` (riferimenti all'utenza):
- `addUtility`: sostituire `asset_id_fk: this.data.item.id, asset: this.data.item,` con `asset_ids: [this.data.item.id], assets: [this.data.item],`
- `openUtilityDetail`: sostituire `item: {...utility, asset: utility.asset ?? this.data.item}` con `item: {...utility, assets: utility.assets?.length ? utility.assets : [this.data.item]}` (il GET immobile non popola il back-reference `utilities[].assets`).

- [ ] **Step 3: Dialog utenza — HTML**

Sostituire l'intero `div` "Immobile Associato *" (FilterableSelect `asset_id_fk` + pulsanti apartment/location_on) con:
```html
        <div style="flex: 1 1 45%; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: flex-start; gap: 0.25rem;">
            <div style="flex: 1 1 auto;">
              <app-multi-select
                label="Immobili associati *"
                [options]="assetSelectOptions"
                formControlName="asset_ids">
              </app-multi-select>
            </div>
            <button mat-icon-button type="button" [disabled]="!resolveMapCoordsFromForm()"
                    [style.color]="isMapCoordsFromAsset() ? '#3b82f6' : null"
                    (click)="navigateToMaps($safeNavigationMigration(resolveMapCoordsFromForm()?.lat), $safeNavigationMigration(resolveMapCoordsFromForm()?.lon))"
                    [matTooltip]="resolveMapCoordsFromForm() ? 'Mostra su mappa' : 'Funzionalità non disponibile: mancano le coordinate.'"
                    style="margin-top: 8px;">
              <mat-icon>location_on</mat-icon>
            </button>
          </div>
          @if (form.controls.asset_ids.invalid && form.controls.asset_ids.touched) {
            <mat-error style="font-size: 0.75rem;">Almeno un immobile obbligatorio</mat-error>
          }
          <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
            @for (opt of selectedAssetOptions(); track opt.value) {
              <button mat-stroked-button type="button" (click)="navigateToAsset($any(opt.value))" matTooltip="Vai al dettaglio immobile">
                <mat-icon>apartment</mat-icon>{{ opt.label }}
              </button>
            }
          </div>
        </div>
```
Sezione "Utilizzatori": sostituire il blocco `@if (data.item.asset?.utilizerGrants?.length) {...} @else {...}` con:
```html
        @if (grantsByAsset().length) {
          @for (group of grantsByAsset(); track group.assetName) {
            <div style="font-weight: 500; margin-top: 0.25rem;">{{ group.assetName }}</div>
            <ul style="margin: 0; padding-left: 1.5rem; list-style-type: disc;">
              @for (name of group.utilizers; track name) {
                <li>{{ name }}</li>
              }
            </ul>
          }
        } @else {
          <span style="color: #666; font-style: italic;">Nessuna concessione trovata.</span>
        }
```
e nel TS:
```ts
  grantsByAsset(): {assetName: string; utilizers: string[]}[] {
    return (this.data.item.assets ?? [])
      .map(a => ({
        assetName: a.asset_name,
        utilizers: (a.utilizerGrants ?? []).map(g => g.utilizer?.name ?? '').filter(n => !!n),
      }))
      .filter(g => g.utilizers.length > 0);
  }
```

- [ ] **Step 4: Tabella utenze**

`data-table-utilities.component.html`:
- colonna `asset.asset_name`: `{{ item.asset?.asset_name }}` → `{{ assetNames(item) }}`
- colonna `asset.utilizer`: `item.asset?.utilizerGrants?.length` → `utilizerNames(item)` (verificare il corpo della cella e usare il metodo esistente riscritto sotto).

`data-table-utilities.component.ts`:
```ts
  assetNames(utility: Utility): string {
    return (utility.assets ?? []).map(a => a.asset_name).join(', ');
  }
```
e il metodo esistente alla riga ~189 (`utility.asset?.utilizerGrants?.map(...)`) diventa:
```ts
    return (utility.assets ?? [])
      .flatMap(a => a.utilizerGrants ?? [])
      .map(g => g.utilizer?.name)
      .filter(n => !!n)
      .join(', ');
```
Sorting/export: nei `case 'asset.asset_name'` (se presenti in `sortingDataAccessor`/`exportCellValue`) usare `this.assetNames(item)`; se il campo passa dal `getNestedValue` generico aggiungere il case esplicito, altrimenti la cella esportata sarebbe vuota.

- [ ] **Step 5: Filtri utenze**

- `utility-filter-dialog.component.ts`: interfaccia e form `asset_id_fk` → `asset_id`.
- `utility-filter-dialog.component.html`: `formControlName="asset_id_fk"` → `formControlName="asset_id"`.
- `search-utilities.component.ts`: `asset_id_fk: [null]` → `asset_id: [null]`.

- [ ] **Step 6: Nessun riferimento residuo + build**

```bash
cd /c/Users/mirko.daddiego/Documents/utenzepa
grep -rn "asset_id_fk\|\.asset?\.\|\.asset!\.\|item\.asset\b" frontend/src/app --include=*.ts --include=*.html | grep -v utilizer-grant
```
Expected: nessun risultato (i match in `utilizer-grant` sono l'entità concessione, invariata).

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/utilities frontend/src/app/pages/assets/asset-edit-dialog.component.ts
git commit -m "feat(frontend): utenza collegata a più immobili

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — filtri mappa

**Files:**
- Modify: `frontend/src/app/pages/map/map.service.ts`, `map.component.ts`, `map.component.html`

**Interfaces:**
- Consumes: `MapQueryDto.natureIds/functionIds/statuses` (Task 4), `AssetNaturesService`/`AssetFunctionsService` (Task 5), `ASSET_STATUS_OPTIONS` (Task 6)

- [ ] **Step 1: Service**

`MapPointsFilters`:
```ts
  natureIds?: number[] | null;
  functionIds?: number[] | null;
  statuses?: string[] | null;
```

- [ ] **Step 2: Componente**

In `map.component.ts`:
```ts
  private naturesService = inject(AssetNaturesService);
  private functionsService = inject(AssetFunctionsService);

  natureIds = new FormControl<number[]>([], {nonNullable: true});
  functionIds = new FormControl<number[]>([], {nonNullable: true});
  statuses = new FormControl<string[]>([], {nonNullable: true});

  natureOptions: TOption[] = [];
  functionOptions: TOption[] = [];
  statusOptions: TOption[] = ASSET_STATUS_OPTIONS;
```
`ngOnInit`:
```ts
    this.naturesService.search({deleted: false} as never).subscribe({
      next: data => {
        this.natureOptions = data.map(n => ({
          label: n.name,
          value: n.id,
          count: this.assetsForCount.filter(a => a.nature_id === n.id).length,
        }));
      },
    });
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => {
        this.functionOptions = data.map(f => ({
          label: f.name,
          value: f.id,
          icon: f.icon || ASSET_AGGREGATOR_ICON_FALLBACK,
          count: this.assetsForCount.filter(a => a.function_id === f.id).length,
        }));
      },
    });
    this.natureIds.valueChanges.subscribe(() => this.reload());
    this.functionIds.valueChanges.subscribe(() => this.reload());
    this.statuses.valueChanges.subscribe(() => this.reload());
```
(I conteggi dipendono da `assetsForCount`, che può arrivare dopo: accettabile che partano a 0 e non si aggiornino — oppure spostare il calcolo in un `rebuildClassificationOptions()` chiamato anche dalla subscribe degli asset, stesso pattern di `rebuildAssetAggregatorOptions`. **Preferire il secondo**: salvare `natures`/`functions` in campi privati e ricostruire le opzioni da entrambe le subscribe.)

`reload()` — aggiungere ai filtri:
```ts
        natureIds: this.natureIds.value,
        functionIds: this.functionIds.value,
        statuses: this.statuses.value,
```

- [ ] **Step 3: Template**

In `map.component.html`, sopra "Aggregato immobile" (rinominato `Tipo precedente`):
```html
    <app-multi-select label="Natura" [options]="natureOptions" [formControl]="natureIds"></app-multi-select>
    <app-multi-select label="Funzione" [options]="functionOptions" [formControl]="functionIds"></app-multi-select>
    <app-multi-select label="Stato" [options]="statusOptions" [formControl]="statuses"></app-multi-select>
```

- [ ] **Step 4: Build + commit**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

```bash
git add frontend/src/app/pages/map
git commit -m "feat(map): filtri natura, funzione e stato

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verifica end-to-end e PR

- [ ] **Step 1: Utente temporaneo**

Seguire CLAUDE.md ("Nessuna credenziale dev/seed..."): hash bcrypt via `docker exec utenzepa-api-1 node -e "require('bcrypt').hash('Temp-Verify-1', 10).then(console.log)"`, `INSERT` in `system_users` (ruolo Admin, `created_by_user_id=1`, `updated_by_user_id=1`, `status='Attivo'`).

- [ ] **Step 2: Scenario browser (Playwright MCP), su `http://localhost:4300`**

1. Impostazioni → Funzioni Immobili: creare `Istruzione` (icona `school`), `Sport` (`sports_soccer`), `Fontana` (`water_drop`).
2. Impostazioni → Nature Immobili: creare `Fabbricato` con funzioni `Istruzione`,`Sport`; `Impianto` con `Fontana`.
3. Gestione Immobili: banner "N immobili da riclassificare" visibile, N = legacy-count. Clic "Mostra" → solo immobili legacy.
4. Aprire un immobile legacy dalla riga: badge "Tipo precedente: …" in header. Natura `Impianto` → tendina Funzione mostra solo `Fontana`. Cambiare natura in `Fabbricato` → funzione svuotata. Scegliere `Sport`, salvare. Riaprire dalla riga: badge sparito, natura/funzione valorizzate; banner N-1.
5. Provare via curl una coppia non ammessa (`PATCH /building/<id>` con `nature_id` Impianto + `function_id` Sport) → 400 `Combinazione natura/funzione non ammessa.`
6. Impostazioni → Nature → `Fabbricato`: togliere `Sport` (usata dall'immobile del punto 4) → toast errore 409, coppia non rimossa.
7. Utenze: aprire un'utenza senza GPS proprio, aggiungere un secondo immobile localizzato, salvare. Riaprire: due pulsanti immobile, concessioni raggruppate per immobile.
8. Mappa: la stessa utenza compare sotto entrambi gli immobili (badge contatori). Filtro Funzione `Sport` → resta solo l'immobile del punto 4 e le sue utenze.
9. Filtro utenze per il secondo immobile → l'utenza compare.

- [ ] **Step 3: Pulizia**

Eliminare i dati di prova creati se su DB con dati reali (immobile riclassificato: rimettere `asset_type_id` originale, `nature_id/function_id` NULL; togliere il secondo immobile dall'utenza; eliminare nature/funzioni di prova) e l'utente temporaneo (riassegnando prima eventuali righe `created_by_user_id` a 1, vedi CLAUDE.md).

- [ ] **Step 4: Push e PR**

```bash
git push -u origin feat/asset-classification-multi-asset
gh pr create --title "feat: classificazione immobili natura/funzione e utenze multi-immobile" --body "$(cat <<'EOF'
## Cosa
- Anagrafiche **Nature** e **Funzioni** immobile con coppie ammesse; campo **Stato** (Attivo/Dismesso/Da verificare).
- Vecchio "tipo immobile" (aggregati) in sola lettura: badge nel dettaglio, azzerato quando l'immobile riceve natura+funzione; banner "N da riclassificare".
- Utenza collegata a **più immobili** (`utility_assets`), marker mappa su ogni immobile collegato.

## Migration
- `AddAssetClassification1790400000000`: tabelle nuove + colonne `assets` (additive, `asset_type_id` → nullable).
- `UtilityAssetsManyToMany1790400000001`: copia `utilities.asset_id_fk` → `utility_assets`, drop colonna. `down()` lossy per utenze con più immobili.

## Spec / piano
- `docs/superpowers/specs/2026-09-25-classificazione-immobili-utenze-multi-immobile-design.md`
- `docs/superpowers/plans/2026-09-25-classificazione-immobili-utenze-multi-immobile.md`

## Test
- Unit backend: asset-natures, asset-functions, assets, utility, map.
- `ng build` frontend.
- E2E browser su dati locali (scenario nel piano, Task 9).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
```
Expected: CI `backend` + `frontend` verdi.
