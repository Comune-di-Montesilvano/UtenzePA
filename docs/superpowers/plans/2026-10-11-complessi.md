# Complessi — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entità Complesso (livello compendio MEF) con API, scheda, elenco, campo nella scheda immobile e livello mappa con pin che si espande negli immobili.

**Architecture:** modulo NestJS `apis/complexes` sul modello di `apis/plants` (service che estende `BaseService`, conteggi calcolati in lettura, nessun valore salvato), relazione molti-a-uno `assets.complex_id`. Frontend: service con header manuale come `PlantService`, scheda che si carica e salva da sé come `PlantEditDialogComponent`, elenco come `PlantsComponent`, mappa con nuovo tipo di punto `complex` filtrato prima del raggruppamento per coordinata.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Jest; Angular 22 standalone + Angular Material, Leaflet + markercluster; Playwright per E2E.

**Spec:** `docs/superpowers/specs/2026-10-11-complessi-design.md`

## Global Constraints

- Branch `feat/complessi` (già creato da `main`, contiene la spec).
- Comandi Docker uno alla volta; jest sempre con `--maxWorkers=2` e solo sui file toccati; `pnpm run lint` nel container normalizza CRLF su tutti i `.ts`: prima di `git add` scartare i file con `0 0` in `git diff --numstat`.
- Mai `git add .`/`-A`: elencare i file.
- Colonne stringa nullable con `type: 'varchar'` esplicito; mai valori potenzialmente `undefined` in una where object-criteria (`invalidWhereValuesBehavior = 'throw'`).
- Errori applicativi sempre 400 con messaggio leggibile, mai 409.
- Migration scritta in uno scratch path (`backend/.scratch/`) e spostata in `src/database/migrations/` solo a contenuto finale; verificare la riga in `migrations`, se manca `docker restart utenzepa-api-1`.
- Frontend: componenti con `ChangeDetectionStrategy.Eager`; colori solo da token `light-dark()` in `styles.scss` (nuovo token `--entity-complex`); schede aperte solo con `openSheet()`/`EntityNavigatorService`; tab nuovi con `aria-label` = etichetta; righe di `app-linked-table` in campi cache, mai getter.
- Ogni modifica visibile aggiorna `frontend/public/guida/guida.md` nella stessa PR con la data in testa; `pnpm run build` esegue `scripts/check-guida.mjs`.
- Release: minor con migration → `publiccode.yml` `softwareVersion: "v1.18.0"`, `releaseDate` = data della PR.
- Commit Conventional Commits, chiusi da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Immobile spostato da un complesso a un altro** tramite `asset_ids`: deve sparire dal primo (non due `complex_id`), e il primo complesso perde il conteggio. Test in Task 2.
2. **`PATCH` senza `asset_ids`**: gli immobili collegati restano invariati (come `lines` delle fatture). Test in Task 2.
3. **Complesso senza posizione propria e con immobili tutti senza posizione o filtrati via**: niente pin, niente errore. Test in Task 4.
4. **Utenze e impianti degli immobili di un complesso chiuso**: nascosti insieme agli immobili (altrimenti resterebbero pin orfani nello stesso punto), ricompaiono all'espansione. Verifica manuale in Task 9.
5. **Immobile cancellato (soft delete) ancora con `complex_id`**: non conta né nei conteggi né in mappa, e non blocca l'eliminazione del complesso. Test in Task 2 e Task 4.

---

### Task 1: Schema (migration, entity, enum, foto)

**Files:**
- Create: `backend/src/apis/complexes/enum/complex-type.enum.ts`
- Create: `backend/src/apis/complexes/entity/complex.entity.ts`
- Modify: `backend/src/apis/asset/entity/asset.entity.ts` (colonna `complex_id` + relazione `complex`)
- Modify: `backend/src/apis/photos/enum/photo-entity-type.enum.ts`
- Modify: `backend/src/apis/photos/dto/create-photo.dto.ts`, `photo-query.dto.ts`, `photo-upload-finalize.dto.ts` (messaggi)
- Create: `backend/src/database/migrations/1793600000000-Complexes.ts` (scritta in `backend/.scratch/` e poi spostata)

**Interfaces:**
- Produces: `Complex` (entity `complexes`), `ComplexType` enum, `Asset.complex_id: number | null`, `Asset.complex: Complex | null`, `PhotoEntityType.COMPLEX = 'complex'`.

- [ ] **Step 1: Tipo complesso.** Cercare la lista ufficiale dei tipi di compendio MEF (WebSearch "Patrimonio PA compendio tipo complesso universitario scolastico militare sportivo"). Se si trova, usarla; altrimenti i 4 valori qui sotto. Creare `complex-type.enum.ts`:

```ts
// Tipi di compendio del censimento MEF "Patrimonio della PA".
export enum ComplexType {
  SPORTS_RECREATIONAL = 'SPORTS_RECREATIONAL', // Complesso sportivo/ricreativo
  MILITARY = 'MILITARY', // Complesso militare
  SCHOOL_UNIVERSITY = 'SCHOOL_UNIVERSITY', // Complesso universitario/scolastico
  OTHER = 'OTHER', // Altro
}
```

- [ ] **Step 2: Entity.** Creare `complex.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ComplexType } from '../enum/complex-type.enum';

// Complesso: immobili gestiti o censiti come un insieme (palazzina di
// alloggi, plesso scolastico, impianto sportivo). Livello "compendio" del
// censimento MEF. Un immobile sta in al massimo un complesso (assets.complex_id).
@Entity('complexes')
export class Complex {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'enum', enum: ComplexType, nullable: true })
  complex_type: ComplexType | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toponym: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  civic_number: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  latitude: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  longitude: string | null;

  @Column({ type: 'int', nullable: true, unique: true })
  mef_compendium_id: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @OneToMany(() => Asset, (asset) => asset.complex)
  assets: Asset[];

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by: SystemUser;

  @ManyToOne(() => SystemUser)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by: SystemUser;
}
```

- [ ] **Step 3: Immobile.** In `asset.entity.ts` aggiungere l'import `import { Complex } from '@apis/complexes/entity/complex.entity';` e, dopo `function_id`:

```ts
  @Column({ type: 'int', nullable: true })
  complex_id: number | null;
```

e in fondo, dopo `assetFunction`:

```ts
  @ManyToOne(() => Complex, (complex) => complex.assets, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'complex_id' })
  complex: Complex | null;
```

- [ ] **Step 4: Foto.** In `photo-entity-type.enum.ts` aggiungere `COMPLEX = 'complex',`. Nei tre DTO di `photos/dto/` sostituire il messaggio di `@IsEnum` con `'entityType deve essere "asset", "utility", "plant" o "complex"'`.

- [ ] **Step 5: Generare la DDL di riferimento.** Con lo stack dev avviato (`docker compose up -d` dalla root):

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate .scratch/ComplexesGen -d src/database/data-source.ts
```

Dal file generato tenere solo gli statement su `complexes`, `assets.complex_id` (colonna, indice, FK) e `photos.entity_type`; il resto è drift preesistente (vedi `docs/claude/backend.md`). Cancellare il file generato.

- [ ] **Step 6: Scrivere la migration** in `backend/.scratch/1793600000000-Complexes.ts` con gli statement tenuti allo Step 5 (nomi di indice/FK come generati). Struttura:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Complessi (voce 2 roadmap, fase 1): tabella complexes, assets.complex_id
// (un immobile in al massimo un complesso), foto anche sui complessi.
// Nessun dato: i complessi nascono con l'import MEF (fase 3) o dalla UI.
export class Complexes1793600000000 implements MigrationInterface {
  name = 'Complexes1793600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(/* CREATE TABLE `complexes` (...) dallo Step 5 */);
    await q.query('ALTER TABLE `assets` ADD `complex_id` int NULL');
    await q.query(/* ADD CONSTRAINT FK assets.complex_id -> complexes.id ON DELETE SET NULL dallo Step 5 */);
    await q.query(
      "ALTER TABLE `photos` MODIFY `entity_type` enum ('asset', 'utility', 'plant', 'complex') NOT NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM `photos` WHERE `entity_type` = 'complex'");
    await q.query(
      "ALTER TABLE `photos` MODIFY `entity_type` enum ('asset', 'utility', 'plant') NOT NULL",
    );
    await q.query(/* DROP FOREIGN KEY dallo Step 5 */);
    await q.query('ALTER TABLE `assets` DROP COLUMN `complex_id`');
    await q.query('DROP TABLE `complexes`');
  }
}
```

I commenti `/* ... */` vanno sostituiti con le stringhe SQL esatte dello Step 5 prima dello spostamento.

- [ ] **Step 7: Applicare e verificare.**

```bash
mv backend/.scratch/1793600000000-Complexes.ts backend/src/database/migrations/
docker exec utenzepa-mysql-1 mysql -uroot -p"<MYSQL_PASSWORD da .env>" mydatabase -e "SELECT name FROM migrations ORDER BY id DESC LIMIT 1; SHOW COLUMNS FROM assets LIKE 'complex_id'; SHOW CREATE TABLE complexes\G"
```

Expected: ultima riga `Complexes1793600000000`, colonna presente, tabella creata. Se la riga manca: `docker restart utenzepa-api-1` e ripetere.

```bash
docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js schema:log -d src/database/data-source.ts
```

Expected: nessuno statement su `complexes`, `assets.complex_id`, `photos`.

- [ ] **Step 8: Ciclo down → up.**

```bash
docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts
docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts
```

Expected: entrambi senza errori; `SHOW COLUMNS FROM assets LIKE 'complex_id'` presente alla fine.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/apis/complexes/enum/complex-type.enum.ts backend/src/apis/complexes/entity/complex.entity.ts backend/src/apis/asset/entity/asset.entity.ts backend/src/apis/photos/enum/photo-entity-type.enum.ts backend/src/apis/photos/dto/create-photo.dto.ts backend/src/apis/photos/dto/photo-query.dto.ts backend/src/apis/photos/dto/photo-upload-finalize.dto.ts backend/src/database/migrations/1793600000000-Complexes.ts
git commit -m "feat(backend): schema complessi e assets.complex_id"
```

---

### Task 2: Modulo complessi (CRUD, conteggi, collegamento immobili)

**Files:**
- Create: `backend/src/apis/complexes/dto/create-complex.dto.ts`, `update-complex.dto.ts`, `search-complex.dto.ts`
- Create: `backend/src/apis/complexes/complexes.service.ts`
- Create: `backend/src/apis/complexes/complexes.controller.ts`
- Create: `backend/src/apis/complexes/complexes.module.ts`
- Modify: `backend/src/app.module.ts` (import `ComplexesModule`)
- Test: `backend/src/apis/complexes/complexes.service.spec.ts`

**Interfaces:**
- Consumes: `Complex`, `ComplexType`, `Asset.complex_id` (Task 1); `displayStatus`, `todayIso` da `@apis/utilizer-grant/real-estate-contract.calc`; `DisplayStatus` da `@apis/utilizer-grant/enum/real-estate-contract.enum`.
- Produces:
  - `type ComplexCounts = { asset_count: number; utility_count: number; plant_count: number; active_grant_count: number }`
  - `type ComplexRow = Complex & ComplexCounts`
  - `ComplexesService.findAll(filters: SearchComplexDto): Promise<ComplexRow[]>`
  - `ComplexesService.findOne(id: number): Promise<ComplexRow | null>` (con `assets` non cancellati, `assetNature`, `assetFunction`, `created_by`, `updated_by`)
  - `ComplexesService.create(dto: CreateComplexDto, userId: number): Promise<ComplexRow>`
  - `ComplexesService.update(id: number, dto: UpdateComplexDto, userId: number): Promise<ComplexRow>`
  - `ComplexesService.remove(id: number, userId: number): Promise<void>`
  - REST: `GET/POST /complexes`, `GET/PATCH/DELETE /complexes/:id`

- [ ] **Step 1: DTO.** `create-complex.dto.ts`:

```ts
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ComplexType } from '../enum/complex-type.enum';

export class CreateComplexDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(ComplexType)
  complex_type?: ComplexType | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  toponym?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  civic_number?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  latitude?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  longitude?: string | null;

  @IsOptional()
  @IsInt()
  mef_compendium_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  // Immobili del complesso: sostituisce l'insieme (assente = invariato).
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  asset_ids?: number[];
}
```

`update-complex.dto.ts`:

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateComplexDto } from './create-complex.dto';

export class UpdateComplexDto extends PartialType(CreateComplexDto) {}
```

`search-complex.dto.ts`:

```ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ComplexType } from '../enum/complex-type.enum';

export class SearchComplexDto {
  @IsOptional()
  @IsEnum(ComplexType)
  complex_type?: ComplexType;

  @IsOptional()
  @IsString()
  q?: string;
}
```

- [ ] **Step 2: Test che falliscono.** `complexes.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ComplexesService } from './complexes.service';
import { ContractStatus } from '@apis/utilizer-grant/enum/real-estate-contract.enum';

describe('ComplexesService', () => {
  let service: ComplexesService;
  let repo: Record<string, jest.Mock>;
  let assetRepo: Record<string, jest.Mock>;
  let utilityRepo: Record<string, jest.Mock>;
  let plantRepo: Record<string, jest.Mock>;
  let grantRepo: Record<string, jest.Mock>;

  const complex = (over: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'Palazzina via Salieri',
    complex_type: null,
    deleted: false,
    assets: [],
    ...over,
  });
  const asset = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    asset_name: `imm_${id}`,
    complex_id: 1,
    deleted: false,
    ...over,
  });

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 1, ...d })),
    };
    assetRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    };
    utilityRepo = { find: jest.fn().mockResolvedValue([]) };
    plantRepo = { find: jest.fn().mockResolvedValue([]) };
    grantRepo = { find: jest.fn().mockResolvedValue([]) };
    service = new ComplexesService(
      repo as never,
      assetRepo as never,
      utilityRepo as never,
      plantRepo as never,
      grantRepo as never,
    );
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-11' as never);
  });

  it('conteggi: immobili non cancellati, utenze e impianti distinti, contratti attivi o in scadenza', async () => {
    repo.find.mockResolvedValue([
      complex({ assets: [asset(10), asset(11), asset(12, { deleted: true })] }),
    ]);
    // Utenza 100 su due immobili dello stesso complesso: conta una volta.
    utilityRepo.find.mockResolvedValue([
      { id: 100, assets: [asset(10), asset(11)] },
      { id: 101, assets: [asset(11)] },
    ]);
    plantRepo.find.mockResolvedValue([{ id: 200, assets: [asset(10)] }]);
    grantRepo.find.mockResolvedValue([
      { id: 300, status: ContractStatus.ACTIVE, end_date: '2027-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(10)] },
      { id: 301, status: ContractStatus.ACTIVE, end_date: '2020-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
      { id: 302, status: ContractStatus.RETURNED, end_date: null, tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
    ]);

    const [row] = await service.findAll({});

    expect(row).toMatchObject({ asset_count: 2, utility_count: 2, plant_count: 1, active_grant_count: 1 });
  });

  it('findAll filtra per testo su nome e indirizzo', async () => {
    repo.find.mockResolvedValue([
      complex({ id: 1, name: 'Plesso Rodari' }),
      complex({ id: 2, name: 'Altro', address: 'via Rodari' }),
      complex({ id: 3, name: 'Stadio' }),
    ]);

    const rows = await service.findAll({ q: 'rodari' });

    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('create collega gli immobili spostandoli da un altro complesso', async () => {
    assetRepo.count.mockResolvedValue(2);
    repo.findOne.mockResolvedValue(complex({ id: 1 }));

    await service.create({ name: 'Nuovo', asset_ids: [10, 11] }, 7);

    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: 1 });
  });

  it('create rifiuta immobili inesistenti o cancellati', async () => {
    assetRepo.count.mockResolvedValue(1);

    await expect(service.create({ name: 'Nuovo', asset_ids: [10, 99] }, 7)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('update con asset_ids scollega quelli tolti e collega quelli nuovi', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10), asset(11)] }));
    assetRepo.count.mockResolvedValue(2);

    await service.update(1, { asset_ids: [11, 12] }, 7);

    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: null });
    expect(assetRepo.update).toHaveBeenCalledWith(expect.anything(), { complex_id: 1 });
  });

  it('update senza asset_ids lascia invariati gli immobili', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10)] }));

    await service.update(1, { name: 'Rinominato' }, 7);

    expect(assetRepo.update).not.toHaveBeenCalled();
  });

  it('remove con immobili collegati: 400 con il numero', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10), asset(11)] }));

    await expect(service.remove(1, 7)).rejects.toThrow(
      'Il complesso ha 2 immobili collegati: scollegali prima di eliminarlo',
    );
  });

  it('remove ignora gli immobili cancellati', async () => {
    repo.findOne.mockResolvedValue(complex({ id: 1, assets: [asset(10, { deleted: true })] }));

    await service.remove(1, 7);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, deleted: true }));
  });
});
```

- [ ] **Step 3: Eseguire e vedere fallire.**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/complexes/complexes.service.spec.ts --maxWorkers=2`
Expected: FAIL, "Cannot find module './complexes.service'".

- [ ] **Step 4: Service.** `complexes.service.ts`:

```ts
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
    const u = idsByComplex(utilities as Linked[]);
    const p = idsByComplex(plants as Linked[]);
    const g = idsByComplex(grants as (Linked & UtilizerGrant)[], (gr) =>
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
    if (asset_ids?.length) await this.assetRepo.update({ id: In(asset_ids) }, { complex_id: saved.id });
    await this.recordAudit(AuditAction.CREATE, saved.id, userId, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateComplexDto, userId: number): Promise<ComplexRow> {
    const { asset_ids, ...rest } = dto;
    const current = await this.repo.findOne({ where: { id, deleted: false }, relations: { assets: true } });
    if (!current) throw new BadRequestException('Complesso non trovato');
    if (rest.name !== undefined) rest.name = rest.name.trim();
    await super.update(id, rest as UpdateComplexDto, userId);
    if (asset_ids !== undefined) {
      await this.assertAssets(asset_ids);
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
    const entity = await this.repo.findOne({ where: { id, deleted: false }, relations: { assets: true } });
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
```

- [ ] **Step 5: Controller e modulo.** `complexes.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ComplexesService, ComplexRow } from './complexes.service';
import { CreateComplexDto } from './dto/create-complex.dto';
import { UpdateComplexDto } from './dto/update-complex.dto';
import { SearchComplexDto } from './dto/search-complex.dto';

@Controller('complexes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplexesController {
  constructor(private readonly service: ComplexesService) {}

  @Get()
  list(@Query() filters: SearchComplexDto): Promise<ComplexRow[]> {
    return this.service.findAll(filters);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<ComplexRow | null> {
    return this.service.findOne(id);
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateComplexDto, @CurrentUser() user: ICurrentUser): Promise<ComplexRow> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComplexDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ComplexRow> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

`complexes.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from '@apis/asset/entity/asset.entity';
import { Utility } from '@apis/utility/entity/utility.entity';
import { Plant } from '@apis/plants/entity/plant.entity';
import { UtilizerGrant } from '@apis/utilizer-grant/entity/utilizer-grant.entity';
import { Complex } from './entity/complex.entity';
import { ComplexesService } from './complexes.service';
import { ComplexesController } from './complexes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Complex, Asset, Utility, Plant, UtilizerGrant])],
  controllers: [ComplexesController],
  providers: [ComplexesService],
  exports: [ComplexesService],
})
export class ComplexesModule {}
```

In `app.module.ts` aggiungere `import { ComplexesModule } from '@apis/complexes/complexes.module';` accanto a `PlantsModule` e `ComplexesModule,` nell'array `imports` subito dopo `PlantsModule,`.

- [ ] **Step 6: Test verdi.**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/complexes/complexes.service.spec.ts --maxWorkers=2`
Expected: PASS, 8 test.

- [ ] **Step 7: Prova dell'API.** Con utente temporaneo (vedi `docs/claude/testing-e2e.md`) e token `T`:

```bash
curl -s -X POST localhost:3010/api/v1/complexes -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"name":"Prova","complex_type":"OTHER"}'
curl -s localhost:3010/api/v1/complexes -H "Authorization: Bearer $T"
```

Expected: oggetto con `id` e contatori a 0; la lista lo contiene. Eliminarlo con `DELETE /complexes/<id>` (expected 200).

- [ ] **Step 8: Commit.**

```bash
git add backend/src/apis/complexes backend/src/app.module.ts
git commit -m "feat(backend): API complessi con conteggi e collegamento immobili"
```

---

### Task 3: Righe dei tab di sola lettura e immobile con complesso

**Files:**
- Modify: `backend/src/apis/complexes/complexes.service.ts` (metodi `utilities`, `plants`, `grants`)
- Modify: `backend/src/apis/complexes/complexes.controller.ts` (3 rotte prima di `:id`)
- Modify: `backend/src/apis/asset/dto/create-asset.dto.ts`, `update-asset.dto.ts`, `search-asset.dto.ts` (`complex_id`)
- Modify: `backend/src/apis/asset/assets.service.ts` (join `complex`, label audit)
- Test: `backend/src/apis/complexes/complexes.service.spec.ts`, `backend/src/apis/asset/assets.service.spec.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `ComplexesService.utilities(id): Promise<Utility[]>` (con `utilityType`, `assets`), `plants(id): Promise<Plant[]>` (con `assets`), `grants(id): Promise<(UtilizerGrant & { computed_status: DisplayStatus })[]>` (con `assets`, `parties`)
  - REST `GET /complexes/:id/utilities`, `/plants`, `/grants`
  - `Asset.complex` incluso in `GET /asset` e `GET /asset/:id`; `complex_id` accettato in create/update e come filtro.

- [ ] **Step 1: Test che falliscono** (in fondo a `complexes.service.spec.ts`):

```ts
  it('grants: contratti degli immobili con lo stato mostrato', async () => {
    grantRepo.find.mockResolvedValue([
      { id: 301, status: ContractStatus.ACTIVE, end_date: '2020-01-01', tacit_renewal: false, renewal_months: null, notice_months: null, assets: [asset(11)] },
    ]);

    const rows = await service.grants(1);

    expect(grantRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted: false, assets: { complex_id: 1, deleted: false } } }),
    );
    expect(rows[0].computed_status).toBe('EXPIRED');
  });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/complexes/complexes.service.spec.ts --maxWorkers=2`
Expected: FAIL, "service.grants is not a function".

- [ ] **Step 2: Metodi del service** (in `ComplexesService`, dopo `findOne`):

```ts
  private linkedWhere(id: number) {
    return { deleted: false, assets: { complex_id: id, deleted: false } };
  }

  utilities(id: number): Promise<Utility[]> {
    return this.utilityRepo.find({
      where: this.linkedWhere(id),
      relations: { assets: true, utilityType: true },
      order: { utility_id: 'ASC' },
    });
  }

  plants(id: number): Promise<Plant[]> {
    return this.plantRepo.find({ where: this.linkedWhere(id), relations: { assets: true }, order: { code: 'ASC' } });
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
```

Nota: con `where` sulla relazione TypeORM carica solo gli immobili del complesso nella relazione `assets`: è voluto (la colonna "Immobile" del tab mostra quelli del complesso).

- [ ] **Step 3: Rotte.** In `complexes.controller.ts`, prima di `@Get(':id')`, con gli import di `Utility`, `Plant`, `UtilizerGrant`, `DisplayStatus`:

```ts
  @Get(':id/utilities')
  utilities(@Param('id', ParseIntPipe) id: number): Promise<Utility[]> {
    return this.service.utilities(id);
  }

  @Get(':id/plants')
  plants(@Param('id', ParseIntPipe) id: number): Promise<Plant[]> {
    return this.service.plants(id);
  }

  @Get(':id/grants')
  grants(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<(UtilizerGrant & { computed_status: DisplayStatus })[]> {
    return this.service.grants(id);
  }
```

- [ ] **Step 4: Test verdi.** Stesso comando dello Step 1. Expected: PASS, 9 test.

- [ ] **Step 5: DTO immobile.** In `create-asset.dto.ts` e `update-asset.dto.ts`, dopo `function_id`:

```ts
  // Complesso di appartenenza (null = nessuno).
  @IsOptional()
  @Transform(({ value }) =>
    value !== undefined && value !== null && value !== '' ? parseInt(value, 10) : null,
  )
  @IsInt()
  complex_id?: number | null;
```

In `search-asset.dto.ts`, dopo `function_id`:

```ts
  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : Number(value)))
  @IsInt()
  complex_id?: number;
```

`applyFilters` applica già `assets.complex_id = :filter_complex_id` per i numeri.

- [ ] **Step 6: Join e audit.** In `assets.service.ts`:
  - in `findAll()` dopo il join di `assetFunction`: `qb.leftJoinAndSelect('assets.complex', 'complex', 'complex.deleted = 0');`
  - in `findOne()` dopo il join di `assetFunction`: `.leftJoinAndSelect('assets.complex', 'complex', 'complex.deleted = 0')`
  - aggiungere `@InjectRepository(Complex) private readonly complexRepo: Repository<Complex>` al costruttore e `complex_id: { repo: this.complexRepo, field: 'name' },` in `auditLabelResolvers`;
  - in `assets.module.ts` aggiungere `Complex` a `TypeOrmModule.forFeature([...])`.

  Aggiornare `assets.service.spec.ts` dove costruisce il service passando un mock in più per `complexRepo` (stessa posizione del parametro).

- [ ] **Step 7: Test immobili.**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/asset/assets.service.spec.ts src/apis/complexes --maxWorkers=2`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/apis/complexes backend/src/apis/asset/dto/create-asset.dto.ts backend/src/apis/asset/dto/update-asset.dto.ts backend/src/apis/asset/dto/search-asset.dto.ts backend/src/apis/asset/assets.service.ts backend/src/apis/asset/assets.module.ts backend/src/apis/asset/assets.service.spec.ts
git commit -m "feat(backend): tab dei complessi e complesso sull'immobile"
```

---

### Task 4: Mappa backend (punti complesso)

**Files:**
- Modify: `backend/src/apis/map/dto/map-query.dto.ts` (`showComplexes`)
- Modify: `backend/src/apis/map/map.service.ts`
- Modify: `backend/src/apis/map/map.module.ts` (`Complex` in `forFeature`)
- Test: `backend/src/apis/map/map.service.spec.ts`

**Interfaces:**
- Consumes: `Complex` (Task 1).
- Produces: `MapPoint.type` include `'complex'`; campi `complexId?: number | null` (punti immobile), `assetIds?: number[]` e `complexType?: ComplexType | null` (punti complesso); query `showComplexes`.

- [ ] **Step 1: Test che falliscono.** In `map.service.spec.ts`: nel `beforeEach` aggiungere `complexRepo = { find: jest.fn().mockResolvedValue([]) };` (dichiarato `let complexRepo: { find: jest.Mock };`) e costruire `new MapService(assetRepo as never, utilityRepo as never, plantRepo as never, complexRepo as never)`. Poi:

```ts
  describe('complessi', () => {
    const located = (id: number, lat: string, lng: string, over: Record<string, unknown> = {}) => ({
      id, asset_name: `imm_${id}`, address: null, latitude: lat, longitude: lng,
      geocoded_latitude: null, geocoded_longitude: null, deleted: false, nature_id: 1, function_id: 2,
      status: 'Attivo', complex_id: 5, ...over,
    });

    it('punto complesso al centro degli immobili localizzati, con i loro id', async () => {
      assetRepo.find.mockResolvedValue([]);
      utilityRepo.find.mockResolvedValue([]);
      complexRepo.find.mockResolvedValue([
        { id: 5, name: 'Palazzina', address: 'Via Salieri', latitude: null, longitude: null, complex_type: null,
          assets: [located(1, '42.0', '14.0'), located(2, '42.2', '14.2'), located(3, '42.4', '14.4', { deleted: true })] },
      ]);

      const { points } = await service.getPoints({});

      expect(points).toContainEqual(expect.objectContaining({
        id: 5, type: 'complex', lat: '42.100000', lng: '14.100000', assetIds: [1, 2], source: 'geocoded',
      }));
    });

    it('posizione propria del complesso: source gps', async () => {
      assetRepo.find.mockResolvedValue([]);
      utilityRepo.find.mockResolvedValue([]);
      complexRepo.find.mockResolvedValue([
        { id: 5, name: 'Plesso', address: null, latitude: '42.5', longitude: '14.5', complex_type: null,
          assets: [located(1, '42.0', '14.0')] },
      ]);

      const { points } = await service.getPoints({});

      expect(points).toContainEqual(expect.objectContaining({ id: 5, type: 'complex', lat: '42.5', lng: '14.5', source: 'gps' }));
    });

    it('nessun immobile visibile dopo i filtri: niente punto complesso', async () => {
      assetRepo.find.mockResolvedValue([]);
      utilityRepo.find.mockResolvedValue([]);
      complexRepo.find.mockResolvedValue([
        { id: 5, name: 'Plesso', latitude: '42.5', longitude: '14.5', complex_type: null,
          assets: [located(1, '42.0', '14.0', { function_id: 9 })] },
      ]);

      const { points } = await service.getPoints({ functionIds: [2] });

      expect(points.some((p) => p.type === 'complex')).toBe(false);
    });

    it('showComplexes=false: nessun punto complesso', async () => {
      assetRepo.find.mockResolvedValue([]);
      utilityRepo.find.mockResolvedValue([]);
      complexRepo.find.mockResolvedValue([
        { id: 5, name: 'Plesso', latitude: '42.5', longitude: '14.5', complex_type: null, assets: [located(1, '42.0', '14.0')] },
      ]);

      const { points } = await service.getPoints({ showComplexes: false });

      expect(points.some((p) => p.type === 'complex')).toBe(false);
    });

    it('punto immobile con complexId', async () => {
      assetRepo.find.mockResolvedValue([located(1, '42.0', '14.0')]);
      utilityRepo.find.mockResolvedValue([]);

      const { points } = await service.getPoints({ showComplexes: false });

      expect(points[0]).toMatchObject({ id: 1, type: 'asset', complexId: 5 });
    });
  });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/map/map.service.spec.ts --maxWorkers=2`
Expected: FAIL (punti complesso assenti, `complexId` assente).

- [ ] **Step 2: DTO.** In `map-query.dto.ts`, dopo `showPlants`:

```ts
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true'))
  showComplexes?: boolean;
```

- [ ] **Step 3: Service.** In `map.service.ts`:
  - import `Complex` e `ComplexType`;
  - `MapPoint.type: 'asset' | 'utility' | 'plant' | 'complex'` e nuovi campi:

```ts
  // Solo per type 'asset' — complesso dell'immobile: il frontend nasconde il
  // pin finché il complesso è chiuso.
  complexId?: number | null;
  // Solo per type 'complex' — immobili visibili del complesso (dopo i filtri).
  assetIds?: number[];
  complexType?: ComplexType | null;
```

  - costruttore: `@InjectRepository(Complex) private readonly complexRepo: Repository<Complex>,` come quarto parametro;
  - nel ciclo degli immobili, nel `points.push` dell'immobile, aggiungere `...(asset.complex_id ? { complexId: asset.complex_id } : {}),`;
  - prima del `return` finale di `getPoints`:

```ts
    if (filters.showComplexes !== false) {
      const complexes = await this.complexRepo.find({ where: { deleted: false }, relations: { assets: true } });
      const inPerimeter = (a: Asset) =>
        !a.deleted &&
        (!filters.natureIds?.length || (a.nature_id != null && filters.natureIds.includes(a.nature_id))) &&
        (!filters.functionIds?.length || (a.function_id != null && filters.functionIds.includes(a.function_id))) &&
        (!filters.statuses?.length || filters.statuses.includes(a.status));
      for (const c of complexes) {
        const visible = (c.assets ?? [])
          .filter(inPerimeter)
          .map((a) => ({ a, pos: this.resolveAssetPosition(a) }))
          .filter((x) => x.pos);
        if (!visible.length) continue;
        const own = isSet(c.latitude) && isSet(c.longitude);
        const avg = (k: 'lat' | 'lng') =>
          (visible.reduce((s, x) => s + parseFloat(x.pos[k].replace(',', '.')), 0) / visible.length).toFixed(6);
        points.push({
          id: c.id,
          type: 'complex',
          name: c.name,
          address: c.address ?? null,
          lat: own ? c.latitude : avg('lat'),
          lng: own ? c.longitude : avg('lng'),
          source: own ? 'gps' : 'geocoded',
          assetIds: visible.map((x) => x.a.id),
          complexType: c.complex_type ?? null,
        });
      }
    }
```

  `resolveAssetPosition` è il metodo già usato per gli immobili (stessa regola di posizione). Se `statuses` nel DTO è tipizzato `AssetStatusEnum[]`, `a.status` è già di quel tipo.

- [ ] **Step 4: Modulo.** In `map.module.ts` aggiungere `Complex` a `TypeOrmModule.forFeature([...])`.

- [ ] **Step 5: Test verdi.** Stesso comando dello Step 1. Expected: PASS (anche i test preesistenti: `complexRepo.find` restituisce `[]` di default).

- [ ] **Step 6: Commit.**

```bash
git add backend/src/apis/map/dto/map-query.dto.ts backend/src/apis/map/map.service.ts backend/src/apis/map/map.module.ts backend/src/apis/map/map.service.spec.ts
git commit -m "feat(backend): punti complesso nella mappa"
```

---

### Task 5: Frontend — modello, service, navigatore, foto, log

**Files:**
- Create: `frontend/src/app/pages/complexes/complex.model.ts`
- Create: `frontend/src/app/pages/complexes/complex.service.ts`
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts`
- Modify: `frontend/src/app/core/entities/photo.entity.ts`
- Modify: `frontend/src/app/pages/audit-log/audit-log-page.component.ts`
- Modify: `frontend/src/styles.scss` (token `--entity-complex`)

**Interfaces:**
- Produces:
  - `ComplexType`, `COMPLEX_TYPES`, `COMPLEX_TYPE_LABEL: Record<ComplexType, string>`
  - `interface Complex`, `interface ComplexPayload`
  - `ComplexService.list(filters)`, `get(id)`, `create(payload)`, `update(id, payload)`, `delete(id)`, `utilities(id)`, `plants(id)`, `grants(id)`
  - `EntityNavigatorService.openComplex(id: number): Observable<boolean>`, `createComplex(prefill?: Partial<ComplexPayload>): Observable<Complex | null>`
  - CSS `--entity-complex`

- [ ] **Step 1: Modello.** `complex.model.ts`:

```ts
import type {Asset} from '../assets/entity/asset.entity';

// Gemello di backend/src/apis/complexes/enum/complex-type.enum.ts.
export type ComplexType = 'SPORTS_RECREATIONAL' | 'MILITARY' | 'SCHOOL_UNIVERSITY' | 'OTHER';
export const COMPLEX_TYPES: ComplexType[] = ['SPORTS_RECREATIONAL', 'MILITARY', 'SCHOOL_UNIVERSITY', 'OTHER'];
export const COMPLEX_TYPE_LABEL: Record<ComplexType, string> = {
  SPORTS_RECREATIONAL: 'Complesso sportivo/ricreativo',
  MILITARY: 'Complesso militare',
  SCHOOL_UNIVERSITY: 'Complesso universitario/scolastico',
  OTHER: 'Altro',
};

export interface Complex {
  id: number;
  name: string;
  complex_type: ComplexType | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  latitude: string | null;
  longitude: string | null;
  mef_compendium_id: number | null;
  notes: string | null;
  assets?: Asset[];
  asset_count: number;
  utility_count: number;
  plant_count: number;
  active_grant_count: number;
  update_date?: string;
  updated_by?: {firstName?: string | null; lastName?: string | null} | null;
}

export interface ComplexPayload {
  name: string;
  complex_type: ComplexType | null;
  toponym: string | null;
  address: string | null;
  civic_number: string | null;
  latitude: string | null;
  longitude: string | null;
  mef_compendium_id: number | null;
  notes: string | null;
  asset_ids?: number[];
}
```

Se al Task 1 Step 1 la lista ufficiale ha più valori, aggiungerli qui con le stesse chiavi.

- [ ] **Step 2: Service.** `complex.service.ts`:

```ts
import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../../services/auth.service';
import {Complex, ComplexPayload} from './complex.model';
import type {Utility} from '../utilities/entity/utility.entity';
import type {Plant} from '../plants/plant.model';
import type {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';

export type ComplexFilters = Record<string, string | number | null | undefined>;

// Non estende AbstractService (rotte annidate): header Authorization a mano,
// l'interceptor non lo aggiunge (vedi CLAUDE.md).
@Injectable({providedIn: 'root'})
export class ComplexService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = `${environment.apiUrl}/complexes`;

  private headers(): HttpHeaders {
    return new HttpHeaders({Authorization: `Bearer ${this.auth.getToken() || ''}`});
  }

  list(filters: ComplexFilters = {}): Observable<Complex[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Complex[]>(this.api, {headers: this.headers(), params});
  }

  get(id: number): Observable<Complex> {
    return this.http.get<Complex>(`${this.api}/${id}`, {headers: this.headers()});
  }

  create(payload: ComplexPayload): Observable<Complex> {
    return this.http.post<Complex>(this.api, payload, {headers: this.headers()});
  }

  update(id: number, payload: Partial<ComplexPayload>): Observable<Complex> {
    return this.http.patch<Complex>(`${this.api}/${id}`, payload, {headers: this.headers()});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`, {headers: this.headers()});
  }

  utilities(id: number): Observable<Utility[]> {
    return this.http.get<Utility[]>(`${this.api}/${id}/utilities`, {headers: this.headers()});
  }

  plants(id: number): Observable<Plant[]> {
    return this.http.get<Plant[]>(`${this.api}/${id}/plants`, {headers: this.headers()});
  }

  grants(id: number): Observable<UtilizerGrant[]> {
    return this.http.get<UtilizerGrant[]>(`${this.api}/${id}/grants`, {headers: this.headers()});
  }
}
```

- [ ] **Step 3: Navigatore.** In `entity-navigator.service.ts`:
  - `import type {Complex, ComplexPayload} from '../../pages/complexes/complex.model';`
  - costante: `const COMPLEX_DIALOG = () => import('../../pages/complexes/complex-edit-dialog.component').then(m => m.ComplexEditDialogComponent);`
  - metodi dopo `createPlant`:

```ts
  // Il dialog complesso salva da sé e chiude con il complesso se ha salvato.
  openComplex(id: number): Observable<boolean> {
    return this.sheet<{complexId: number}, Complex | null>(COMPLEX_DIALOG, {complexId: id}).pipe(
      map(saved => !!saved),
    );
  }

  createComplex(prefill: Partial<ComplexPayload> = {}): Observable<Complex | null> {
    return this.sheet<{complexId: null; prefill: Partial<ComplexPayload>}, Complex | null>(
      COMPLEX_DIALOG, {complexId: null, prefill},
    ).pipe(map(c => c ?? null));
  }
```

  Il dialog `complex-edit-dialog.component.ts` nasce al Task 6: finché non esiste `ng build` fallisce sull'import dinamico, quindi Task 5 e 6 si verificano insieme (Step 5 del Task 6).

- [ ] **Step 4: Foto, log, token.**
  - `photo.entity.ts`: `export type PhotoEntityType = 'asset' | 'utility' | 'plant' | 'complex';`
  - `audit-log-page.component.ts`, in `ENTITY_OPTIONS` dopo Impianti: `{ label: 'Complessi', value: 'complexes' },`
  - `styles.scss`, dopo `--entity-plant`: `--entity-complex: light-dark(#4338ca, #a5b4fc);`

- [ ] **Step 5: Commit** (insieme al Task 6, vedi Step 6 del Task 6).

---

### Task 6: Frontend — scheda complesso

**Files:**
- Create: `frontend/src/app/pages/complexes/complex-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/complexes/complex-edit-dialog.component.html`

**Interfaces:**
- Consumes: `ComplexService`, `COMPLEX_TYPE_LABEL`, `COMPLEX_TYPES`, `EntityNavigatorService.openAsset/createAsset/openUtility/openPlant/openGrant` (esistenti), componenti `entity-sheet` esistenti.
- Produces: `ComplexEditDialogComponent`, `interface ComplexEditDialogData { complexId: number | null; prefill?: Partial<ComplexPayload> }`.

- [ ] **Step 1: Componente.** `complex-edit-dialog.component.ts`:

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {assetStatus, grantStatus, plantStatus, StatusInfo, utilityStatus} from '../../core/helpers/entity-status';
import {hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {AssetService} from '../assets/asset.service';
import {Asset} from '../assets/entity/asset.entity';
import {Utility} from '../utilities/entity/utility.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Plant, PLANT_TYPE_LABEL} from '../plants/plant.model';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {ComplexService} from './complex.service';
import {Complex, COMPLEX_TYPE_LABEL, COMPLEX_TYPES, ComplexPayload, ComplexType} from './complex.model';

export interface ComplexEditDialogData {
  // null = nuovo complesso.
  complexId: number | null;
  prefill?: Partial<ComplexPayload>;
}

// Scheda complesso: salva da sé, chiude con il complesso se qualcosa è stato
// salvato. Dopo la creazione resta aperta in modifica (immobili, foto).
@Component({
  selector: 'app-complex-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatTabsModule, MatProgressBarModule, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './complex-edit-dialog.component.html',
})
export class ComplexEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ComplexService);
  private assetService = inject(AssetService);
  private navigator = inject(EntityNavigatorService);
  protected dialogRef = inject(MatDialogRef<ComplexEditDialogComponent, Complex | null>);
  protected data = inject<ComplexEditDialogData>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly types = COMPLEX_TYPES;
  readonly typeLabel = COMPLEX_TYPE_LABEL;
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);

  complex: Complex | null = null;
  loading = false;
  saving = false;
  saved = false;
  error: string | null = null;

  // Campi cache per app-linked-table e anteprime (mai getter).
  private allAssets: Asset[] = [];
  assetOptions: TOption[] = [];
  assetRows: Asset[] = [];
  utilityRows: Utility[] = [];
  plantRows: Plant[] = [];
  grantRows: UtilizerGrant[] = [];
  assetPreview: PreviewItem[] = [];

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
    {label: 'Funzione', value: a => a.assetFunction?.name ?? ''},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? `#${u.id}`},
    {label: 'Tipo uso', value: u => u.utilityType?.name ?? ''},
    {label: 'Immobile', value: u => (u.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  readonly plantColumns: LinkedColumn<Plant>[] = [
    {label: 'Codice', value: p => p.code},
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
    {label: 'Immobile', value: p => (p.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly plantStatusOf = (p: Plant): StatusInfo => plantStatus(p.status);

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Tipo', value: g => [g.kind ? KIND_LABEL[g.kind] : '', g.direction ? DIRECTION_LABEL[g.direction] : ''].filter(Boolean).join(' · ')},
    {label: 'Parti', value: g => (g.parties ?? []).map(p => partyName(p)).join(', ')},
    {label: 'Immobile', value: g => (g.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status ?? g.status);

  form = this.fb.group({
    name: [this.data.prefill?.name ?? '', [Validators.required, Validators.maxLength(255)]],
    complex_type: [(this.data.prefill?.complex_type ?? null) as ComplexType | null],
    mef_compendium_id: [this.data.prefill?.mef_compendium_id ?? null as number | null],
    toponym: [''],
    address: [''],
    civic_number: [''],
    latitude: [null as string | null],
    longitude: [null as string | null],
    notes: [''],
    asset_ids: [(this.data.prefill?.asset_ids ?? []) as number[]],
  });

  ngOnInit(): void {
    if (!this.canEdit) this.form.disable();
    this.loadAssets();
    if (this.data.complexId) this.load(this.data.complexId);
  }

  private loadAssets(): void {
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => {
        this.allAssets = assets;
        this.assetOptions = assets
          .map(a => ({label: a.asset_name ?? '', value: a.id,
            sublabel: a.complex && a.complex.id !== this.complex?.id ? `nel complesso ${a.complex.name}` : (a.address ?? undefined),
            searchText: `${a.asset_name ?? ''} ${a.address ?? ''}`}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento immobili:', err),
    });
  }

  private load(id: number, patchForm = true): void {
    this.loading = true;
    this.service.get(id).subscribe({
      next: c => {
        this.complex = c;
        this.loading = false;
        if (patchForm) this.patch(c);
        this.refreshLinks();
        this.loadLinked(c.id);
      },
      error: err => {
        this.loading = false;
        this.error = 'Complesso non trovato.';
        console.error('Errore caricamento complesso:', err);
      },
    });
  }

  private loadLinked(id: number): void {
    this.service.utilities(id).subscribe(rows => this.utilityRows = rows);
    this.service.plants(id).subscribe(rows => this.plantRows = rows);
    this.service.grants(id).subscribe(rows => this.grantRows = rows);
  }

  private patch(c: Complex): void {
    this.form.patchValue({
      name: c.name,
      complex_type: c.complex_type,
      mef_compendium_id: c.mef_compendium_id,
      toponym: c.toponym ?? '',
      address: c.address ?? '',
      civic_number: c.civic_number ?? '',
      latitude: c.latitude,
      longitude: c.longitude,
      notes: c.notes ?? '',
      asset_ids: (c.assets ?? []).map(a => a.id),
    });
    this.form.markAsPristine();
  }

  refreshLinks(): void {
    const ids = this.form.controls.asset_ids.value ?? [];
    this.assetRows = ids
      .map(id => this.allAssets.find(a => a.id === id) ?? (this.complex?.assets?.find(a => a.id === id) as Asset | undefined))
      .filter((a): a is Asset => !!a);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: a.assetFunction?.icon || 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
  }

  title(): string {
    const name = (this.form.controls.name.value ?? '').trim();
    return name || (this.complex ? `Complesso #${this.complex.id}` : 'Nuovo complesso');
  }

  subtitle(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [v.complex_type ? COMPLEX_TYPE_LABEL[v.complex_type] : '', street].filter(Boolean).join(' · ');
  }

  lastModified(): string | null {
    return this.complex ? lastModifiedLabel(this.complex.update_date, this.complex.updated_by) : null;
  }

  countBadge(): StatusInfo {
    const n = this.assetRows.length;
    return {label: n === 1 ? '1 immobile' : `${n} immobili`, tone: 'info'} as StatusInfo;
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  onPositionSelected(pos: {lat: string; lng: string}): void {
    this.form.patchValue({latitude: pos.lat, longitude: pos.lng});
    this.form.markAsDirty();
  }

  onPositionCleared(): void {
    this.form.patchValue({latitude: null, longitude: null});
    this.form.markAsDirty();
  }

  private setAssetIds(ids: number[]): void {
    const c = this.form.controls.asset_ids;
    c.setValue(ids);
    c.markAsDirty();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    const ids = this.form.controls.asset_ids.value ?? [];
    if (!ids.includes(id)) this.setAssetIds([...ids, id]);
  }

  unlinkAsset(id: number): void {
    this.setAssetIds((this.form.controls.asset_ids.value ?? []).filter(x => x !== id));
  }

  newAsset(): void {
    this.navigator.createAsset().subscribe(a => {
      if (!a) return;
      this.loadAssets();
      this.addAsset(a.id);
    });
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.loadAssets();
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  close(): void {
    this.dialogRef.close(this.saved ? this.complex : null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Correggi i campi evidenziati (pallino rosso sul tab).';
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: ComplexPayload = {
      name: (v.name ?? '').trim(),
      complex_type: v.complex_type ?? null,
      mef_compendium_id: v.mef_compendium_id === null || `${v.mef_compendium_id}` === '' ? null : Number(v.mef_compendium_id),
      toponym: text(v.toponym),
      address: text(v.address),
      civic_number: text(v.civic_number),
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      notes: text(v.notes),
      asset_ids: v.asset_ids ?? [],
    };
    this.saving = true;
    this.error = null;
    const req = this.complex ? this.service.update(this.complex.id, payload) : this.service.create(payload);
    req.subscribe({
      next: c => {
        this.saving = false;
        this.saved = true;
        this.complex = c;
        this.patch(c);
        this.refreshLinks();
        this.loadLinked(c.id);
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = err.error?.message ?? 'Salvataggio non riuscito.';
      },
    });
  }
}
```

Verificare i nomi esatti degli helper usati prima di scrivere: `grantStatus`, `plantStatus`, `utilityStatus`, `assetStatus` in `core/helpers/entity-status.ts`; `partyName` in `core/helpers/party-name.helper.ts`; `Asset.assetFunction` e `Utility.utilityType` già presenti; `UtilizerGrant.computed_status`, `parties`, `kind`, `direction` già presenti (usati da `third-party-edit-dialog`). Il tono `'info'` di `StatusInfo`: se il tipo non lo prevede, usare il tono neutro già definito in `entity-status.ts`. `createAsset()` del navigatore esiste (usato da `plant-edit-dialog`). `Asset.complex` arriva al Task 8: fino ad allora l'accesso `a.complex` va dichiarato in `asset.entity.ts` (fatto al Task 8 Step 1; se si esegue questo task prima, anticipare quello step).

- [ ] **Step 2: Template.** `complex-edit-dialog.component.html`:

```html
<app-entity-sheet
  icon="domain"
  color="var(--entity-complex)"
  [title]="title()"
  [subtitle]="subtitle()"
  [lastModified]="lastModified()">
  <ng-container sheetBadges>
    <app-status-badge [info]="countBadge()" size="sm"></app-status-badge>
  </ng-container>

  @if (loading) {
    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
  }
  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo" [error]="invalid('name')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>Nome</mat-label>
            <input matInput formControlName="name" maxlength="255">
            <mat-error>Obbligatorio</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="complex_type">
              <mat-option [value]="null">—</mat-option>
              @for (t of types; track t) {
                <mat-option [value]="t">{{ typeLabel[t] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Id compendio MEF</mat-label>
            <input matInput type="number" formControlName="mef_compendium_id">
          </mat-form-field>
        </div>

        <div class="sheet-section-title"><mat-icon>place</mat-icon>Indirizzo e posizione</div>
        <div class="sheet-location">
          <div class="sheet-grid">
            <mat-form-field>
              <mat-label>Toponimo</mat-label>
              <input matInput formControlName="toponym">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Indirizzo</mat-label>
              <input matInput formControlName="address">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Civico</mat-label>
              <input matInput formControlName="civic_number">
            </mat-form-field>
          </div>
          <app-location-map
            [latitude]="form.controls.latitude.value"
            [longitude]="form.controls.longitude.value"
            [previewOnly]="!canEdit"
            [readOnly]="!canEdit"
            (positionSelected)="onPositionSelected($event)"
            (positionCleared)="onPositionCleared()">
          </app-location-map>
        </div>
        @if (!form.controls.latitude.value) {
          <p class="sheet-hint">Senza posizione propria, in mappa il complesso sta al centro dei suoi immobili.</p>
        }

        @if (complex) {
          <div class="sheet-previews">
            <app-preview-card title="Immobili" icon="apartment" color="var(--entity-asset)"
                              [items]="assetPreview" emptyText="Nessun immobile"
                              (seeAll)="goTo('Immobili')" (open)="openAsset($event.id)"></app-preview-card>
          </div>
          <p class="sheet-hint">{{ complex.utility_count }} utenze · {{ complex.plant_count }} impianti · {{ complex.active_grant_count }} contratti immobiliari attivi</p>
        }
      </mat-tab>

      <mat-tab aria-label="Immobili">
        <ng-template mat-tab-label>
          <app-tab-label icon="apartment" label="Immobili" [count]="assetRows.length"></app-tab-label>
        </ng-template>
        <app-linked-table
          [columns]="assetColumns"
          [rows]="assetRows"
          [rowStatus]="assetStatusOf"
          [addOptions]="canEdit ? assetOptions : null"
          addLabel="Collega immobile"
          itemLabel="l'immobile"
          [unlinkable]="canEdit"
          emptyText="Nessun immobile nel complesso."
          [createLabel]="canEdit ? 'Nuovo immobile' : null"
          (create)="newAsset()"
          (add)="addAsset($event)"
          (unlink)="unlinkAsset($event.id)"
          (open)="openAsset($event.id)"></app-linked-table>
      </mat-tab>

      @if (complex) {
        <mat-tab aria-label="Utenze">
          <ng-template mat-tab-label>
            <app-tab-label icon="electric_meter" label="Utenze" [count]="utilityRows.length"></app-tab-label>
          </ng-template>
          <app-linked-table [columns]="utilityColumns" [rows]="utilityRows" [rowIcon]="utilityIconOf"
                            [rowStatus]="utilityStatusOf" emptyText="Nessuna utenza sugli immobili del complesso."
                            (open)="openUtility($event.id)"></app-linked-table>
        </mat-tab>

        <mat-tab aria-label="Impianti">
          <ng-template mat-tab-label>
            <app-tab-label icon="settings_input_component" label="Impianti" [count]="plantRows.length"></app-tab-label>
          </ng-template>
          <app-linked-table [columns]="plantColumns" [rows]="plantRows" [rowStatus]="plantStatusOf"
                            emptyText="Nessun impianto sugli immobili del complesso."
                            (open)="openPlant($event.id)"></app-linked-table>
        </mat-tab>

        <mat-tab aria-label="Contratti immobiliari">
          <ng-template mat-tab-label>
            <app-tab-label icon="real_estate_agent" label="Contratti immobiliari" [count]="grantRows.length"></app-tab-label>
          </ng-template>
          <app-linked-table [columns]="grantColumns" [rows]="grantRows" [rowStatus]="grantStatusOf"
                            emptyText="Nessun contratto immobiliare sugli immobili del complesso."
                            (open)="openGrant($event.id)"></app-linked-table>
        </mat-tab>
      }

      <mat-tab aria-label="Note">
        <ng-template mat-tab-label>
          <app-tab-label icon="notes" label="Note"></app-tab-label>
        </ng-template>
        <mat-form-field style="width: 100%;">
          <mat-label>Note</mat-label>
          <textarea matInput formControlName="notes" rows="6"></textarea>
        </mat-form-field>
      </mat-tab>

      @if (complex) {
        <mat-tab aria-label="Foto">
          <ng-template mat-tab-label>
            <app-tab-label icon="photo_library" label="Foto"></app-tab-label>
          </ng-template>
          <ng-template matTabContent>
            <app-photo-gallery [entityType]="'complex'" [entityId]="complex.id"></app-photo-gallery>
          </ng-template>
        </mat-tab>
        <mat-tab aria-label="Storico">
          <ng-template mat-tab-label>
            <app-tab-label icon="history" label="Storico"></app-tab-label>
          </ng-template>
          <ng-template matTabContent>
            <app-entity-history
              [entity]="'complexes'"
              [entityId]="complex.id"
              [lastModifiedBy]="complex.updated_by ? (complex.updated_by.firstName ?? '') + ' ' + (complex.updated_by.lastName ?? '') : null"
              [lastModifiedAt]="complex.update_date ?? null">
            </app-entity-history>
          </ng-template>
        </mat-tab>
      }
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    @if (error) {
      <p class="sheet-error">{{ error }}</p>
    }
    <button mat-stroked-button type="button" (click)="close()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving || loading">Salva</button>
    }
  </ng-container>
</app-entity-sheet>
```

Prima di scrivere, confrontare i nomi degli output di `app-linked-table` (`add`, `unlink`, `open`, `create`) e degli input di `app-location-map` con `plant-edit-dialog.component.html` righe 274–300 e 85–94, e adeguarli se diversi.

- [ ] **Step 3: Build.**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build ok (warning di budget preesistenti ammessi), nessun errore di template.

- [ ] **Step 4: Commit (Task 5 + 6).**

```bash
git add frontend/src/app/pages/complexes/complex.model.ts frontend/src/app/pages/complexes/complex.service.ts frontend/src/app/pages/complexes/complex-edit-dialog.component.ts frontend/src/app/pages/complexes/complex-edit-dialog.component.html frontend/src/app/core/services/entity-navigator.service.ts frontend/src/app/core/entities/photo.entity.ts frontend/src/app/pages/audit-log/audit-log-page.component.ts frontend/src/styles.scss
git commit -m "feat(frontend): scheda complesso"
```

---

### Task 7: Frontend — elenco complessi, rotta, menu

**Files:**
- Create: `frontend/src/app/pages/complexes/complexes-filters.ts`
- Create: `frontend/src/app/pages/complexes/complexes.component.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`
- Modify: `frontend/src/app/pages/guida/guida.ts` (`GUIDA_PER_PAGINA`)

**Interfaces:**
- Consumes: `ComplexService`, `COMPLEX_TYPE_LABEL`, `COMPLEX_TYPES`, `ComplexEditDialogComponent` (Task 5–6).
- Produces: rotta `/complexes` (`?selectedId=` apre la scheda), voce di menu "Complessi".

- [ ] **Step 1: Filtri.** `complexes-filters.ts`:

```ts
import {FilterDef} from '../../core/components/list/filter-def';
import {COMPLEX_TYPE_LABEL, COMPLEX_TYPES} from './complex.model';

// Filtri dell'elenco complessi (lato server); la ricerca libera resta lato client.
export function complexFilters(): FilterDef[] {
  return [
    {key: 'complex_type', label: 'Tipo', type: 'select', inline: true,
      options: COMPLEX_TYPES.map(t => ({label: COMPLEX_TYPE_LABEL[t], value: t}))},
  ];
}
```

- [ ] **Step 2: Elenco.** `complexes.component.ts`: copiare la struttura di `plants.component.ts` (paginatore ricordato, colonne ricordate, `app-list-filters`, `app-list-toolbar`, export CSV, `?selectedId=`), **senza** segnalazioni, con:
  - `COLUMNS_KEY = 'columns:complexes'`, `PAGE_SIZE_KEY = 'list-page-size:Complessi'`;
  - titolo `<h1>Complessi</h1>`, sottotitolo "Immobili gestiti o censiti come un insieme: palazzine, plessi scolastici, impianti sportivi.";
  - `placeholder="Cerca nome, indirizzo..."`, `createLabel="Nuovo complesso"`;
  - `allColumns`: `{field: 'name', header: 'Nome'}`, `{field: 'type', header: 'Tipo'}`, `{field: 'address', header: 'Indirizzo'}`, `{field: 'asset_count', header: 'Immobili'}`, `{field: 'utility_count', header: 'Utenze'}`, `{field: 'active_grant_count', header: 'Contratti attivi'}`;
  - celle: `name` = `item.name`; `type` = `item.complex_type ? typeLabel[item.complex_type] : ''`; `address` = `[item.toponym, item.address, item.civic_number].filter(Boolean).join(' ')` (metodo `addressText(c)`); i tre conteggi = valore numerico;
  - `filterPredicate`: haystack `[c.name, c.address, c.toponym, c.notes]`;
  - `sortingDataAccessor`: `type` → etichetta, conteggi → numero, resto → stringa minuscola;
  - `openDialog(item?, id?)` con `openSheet<ComplexEditDialogComponent, ComplexEditDialogData, Complex | null>(this.dialog, ComplexEditDialogComponent, {complexId: item?.id ?? id ?? null})`, al salvataggio `reload()`;
  - `remove(c)`: conferma `{title: 'Elimina complesso', message: \`Eliminare il complesso "${c.name}"?\`, confirmLabel: 'Elimina', danger: true}`; su errore `ToastService.add({severity: 'error', summary: 'Eliminazione non riuscita', detail: err.error?.message})` (il 400 dice quanti immobili scollegare);
  - export CSV: intestazioni `['Nome', 'Tipo', 'Indirizzo', 'Immobili', 'Utenze', 'Impianti', 'Contratti attivi', 'Note']`, file `complessi_<data>.csv`;
  - `reload()`: `this.service.list(toSearchParams(this.filterDefs, this.filterValues) as ComplexFilters)`.

- [ ] **Step 3: Rotta, menu, guida per pagina.**
  - `app.routes.ts`: `import {ComplexesComponent} from './pages/complexes/complexes.component';` e `{path: 'complexes', component: ComplexesComponent},` dopo `building`;
  - `sidebar.component.ts`, dopo la voce Immobili: `{label: 'Complessi', icon: 'domain', route: '/complexes'},`;
  - `guida.ts`, in `GUIDA_PER_PAGINA`: `'complexes': 'gestire-i-complessi',` (l'ancora nasce al Task 10; finché manca, `check-guida` fallisce: eseguire la build del Task 10 prima del commit di questo task oppure includere qui la sezione della guida del Task 10 Step 1).

- [ ] **Step 4: Build.** `docker exec utenzepa-frontend-1 pnpm run build` → ok.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/app/pages/complexes/complexes-filters.ts frontend/src/app/pages/complexes/complexes.component.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts frontend/src/app/pages/guida/guida.ts
git commit -m "feat(frontend): elenco complessi"
```

---

### Task 8: Frontend — complesso nella scheda e nell'elenco immobili

**Files:**
- Modify: `frontend/src/app/pages/assets/entity/asset.entity.ts`, `asset.interface.ts`
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`, `.html`
- Modify: `frontend/src/app/pages/assets/data-table-assets.component.ts`, `.html`
- Modify: `frontend/src/app/pages/assets/assets-filters.ts`

**Interfaces:**
- Consumes: `ComplexService.list`, `EntityNavigatorService.openComplex/createComplex` (Task 5).
- Produces: `Asset.complex_id`, `Asset.complex`.

- [ ] **Step 1: Entity.** In `asset.entity.ts`, dopo `function_id`:

```ts
  complex_id?: number | null;

  // Solo lettura (il salvataggio usa complex_id).
  @Exclude({toPlainOnly: true})
  complex?: {id: number; name: string} | null;
```

e in `asset.interface.ts` `complex_id?: number | null;`. Nel factory (`create`/default) dove compaiono `nature_id: null, function_id: null` aggiungere `complex_id: null`.

- [ ] **Step 2: Scheda immobile.** In `asset-edit-dialog.component.ts`:
  - `import {ComplexService} from '../complexes/complex.service';` e `private complexService = inject(ComplexService);`
  - form: `complex_id: [this.data.item.complex_id ?? null as number | null],`
  - campo cache `complexOptions: TOption[] = [];`, caricato in `ngOnInit`:

```ts
  private loadComplexes(after?: () => void): void {
    this.complexService.list().subscribe({
      next: list => {
        this.complexOptions = list
          .map(c => ({label: c.name, value: c.id, icon: 'domain'}))
          .sort((a, b) => a.label.localeCompare(b.label));
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei complessi:', err),
    });
  }

  newComplex(text: string): void {
    this.navigator.createComplex({name: nameFrom(text), asset_ids: this.data.item.id ? [this.data.item.id] : []}).subscribe(c => {
      if (!c) return;
      this.loadComplexes(() => this.form.controls.complex_id.setValue(c.id));
      this.form.controls.complex_id.markAsDirty();
    });
  }

  openComplex(): void {
    const id = this.form.controls.complex_id.value;
    if (id) this.navigator.openComplex(id).subscribe(saved => saved && this.loadComplexes());
  }
```

  (`nameFrom` si importa da `../../core/services/entity-navigator.service`, come già fatto per tipologia e funzione.)
  - template, tab Riepilogo, subito dopo il campo "Descrizione fabbricato":

```html
          <div class="span-all" style="display: flex; gap: 8px; align-items: flex-start;">
            <app-filterable-select label="Complesso" placeholder="Cerca complesso..." [options]="complexOptions"
              formControlName="complex_id" style="flex: 1;"
              [createLabel]="canEdit ? 'Nuovo complesso' : null" (create)="newComplex($event)">
            </app-filterable-select>
            <button mat-icon-button type="button" style="margin-top: 8px;" [disabled]="!form.controls.complex_id.value"
                    (click)="openComplex()" matTooltip="Apri il complesso" aria-label="Apri il complesso">
              <mat-icon>open_in_new</mat-icon>
            </button>
          </div>
```

  Controllare che `app-filterable-select` consenta il valore vuoto (opzione "nessuno"): se non c'è un'opzione di svuotamento, aggiungere in testa a `complexOptions` `{label: '— Nessun complesso —', value: null}`.

- [ ] **Step 3: Elenco immobili.**
  - `data-table-assets.component.ts`: in `allColumns` dopo `assetFunction.name`: `{field: 'complex.name', header: 'Complesso', minWidth: '150px'},`;
  - `.html`: colonna

```html
  <ng-container matColumnDef="complex.name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Complesso</th>
    <td mat-cell *matCellDef="let item">{{ item.complex?.name ?? '' }}</td>
  </ng-container>
```

  (se l'ordinamento usa un accessor per i campi con il punto come `assetNature.name`, riusarlo per `complex.name`);
  - `assets-filters.ts`: iniettare `ComplexService` e aggiungere, dopo `function_id`:

```ts
    {key: 'complex_id', label: 'Complesso', type: 'select', group: 'Immobile',
      options: () => complexes.list().pipe(map(list => list.map(c => ({label: c.name, value: c.id, icon: 'domain'}))))},
```

- [ ] **Step 4: Build.** `docker exec utenzepa-frontend-1 pnpm run build` → ok.

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/app/pages/assets/entity/asset.entity.ts frontend/src/app/pages/assets/entity/asset.interface.ts frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html frontend/src/app/pages/assets/data-table-assets.component.ts frontend/src/app/pages/assets/data-table-assets.component.html frontend/src/app/pages/assets/assets-filters.ts
git commit -m "feat(frontend): complesso nella scheda e nell'elenco immobili"
```

---

### Task 9: Frontend — livello Complessi in mappa

**Files:**
- Modify: `frontend/src/app/pages/map/map-point.entity.ts`
- Modify: `frontend/src/app/pages/map/map.service.ts`
- Modify: `frontend/src/app/pages/map/map.component.ts`
- Modify: `frontend/src/app/pages/map/map.component.html`

**Interfaces:**
- Consumes: punti `complex` del backend (Task 4), `EntityNavigatorService.openComplex` (Task 5), `ComplexType`/`COMPLEX_TYPE_LABEL` (Task 5).

- [ ] **Step 1: Modello e service.**
  - `map-point.entity.ts`: `export type MapPointType = 'asset' | 'utility' | 'plant' | 'complex';` e in `MapPoint`:

```ts
  // type 'asset': complesso dell'immobile (pin nascosto a complesso chiuso).
  complexId?: number | null;
  // type 'complex': immobili visibili del complesso.
  assetIds?: number[];
  complexType?: ComplexType | null;
```

  (`import type {ComplexType} from '../complexes/complex.model';`)
  - `map.service.ts` (frontend): `showComplexes?: boolean;` in `MapPointsFilters`.

- [ ] **Step 2: Stato del componente.** In `map.component.ts`:
  - `showComplexes = new FormControl(true, { nonNullable: true });` accanto a `showPlants`;
  - `layerCounts: Record<'asset' | 'utility' | 'plant' | 'complex', number> = { asset: 0, utility: 0, plant: 0, complex: 0 };`
  - `const COMPLEX_COLOR = 'var(--entity-complex)';` e `const COMPLEX_EXPAND_ZOOM = 17;` tra le costanti in testa;
  - campi: `private lastPoints: MapPoint[] = [];`, `private expandedComplexes = new Set<number>();`, `private aboveExpandZoom = false;`
  - `currentFilters()`: aggiungere `showComplexes: this.showComplexes.value,`;
  - aggiungere `this.showComplexes` all'array dei controlli che chiamano `reload()` (riga ~258);
  - nella subscribe dei punti (riga ~255) sostituire `this.renderPoints(response.points);` con:

```ts
        this.lastPoints = response.points;
        this.renderPoints(this.visiblePoints());
```

  - dopo la creazione della mappa (vicino a `this.map.on('contextmenu', ...)`):

```ts
    this.aboveExpandZoom = this.map.getZoom() >= COMPLEX_EXPAND_ZOOM;
    this.map.on('zoomend', () => {
      const above = (this.map?.getZoom() ?? 0) >= COMPLEX_EXPAND_ZOOM;
      if (above === this.aboveExpandZoom) return;
      this.aboveExpandZoom = above;
      this.renderPoints(this.visiblePoints());
    });
```

- [ ] **Step 3: Filtro dei punti visibili.** Nuovo metodo:

```ts
  // Complessi chiusi: un solo pin al posto dei loro immobili; anche utenze e
  // impianti di quegli immobili restano nascosti (altrimenti pin orfani nello
  // stesso punto). Aperti (clic) o oltre lo zoom 17: immobili e collegati, senza pin complesso.
  private visiblePoints(): MapPoint[] {
    const open = (c: MapPoint) => this.aboveExpandZoom || this.expandedComplexes.has(c.id);
    const hidden = new Set<number>();
    for (const c of this.lastPoints) {
      if (c.type === 'complex' && !open(c)) (c.assetIds ?? []).forEach((id) => hidden.add(id));
    }
    return this.lastPoints.filter((p) => {
      if (p.type === 'complex') return !open(p);
      if (p.type === 'asset') return !hidden.has(p.id);
      return p.assetId == null || !hidden.has(p.assetId);
    });
  }
```

  In `renderPoints` il conteggio dei livelli va calcolato su `this.lastPoints` (non sui visibili):

```ts
    const countOf = (t: MapPoint['type']) => new Set(this.lastPoints.filter((p) => p.type === t).map((p) => p.id)).size;
    this.layerCounts = { asset: countOf('asset'), utility: countOf('utility'), plant: countOf('plant'), complex: countOf('complex') };
```

- [ ] **Step 4: Icona, etichetta, clic.**
  - `pointIcon`, in testa:

```ts
    if (point.type === 'complex') {
      return { iconHtml: `<span class="material-icons">domain</span>`, color: COMPLEX_COLOR };
    }
```

  - `pointLabel`, in testa: `if (point.type === 'complex') return \`${point.name} (complesso, ${point.assetIds?.length ?? 0} immobili)\`;`
  - nel `marker.on('click', ...)` di `renderPoints`, prima di `if (principal) {`:

```ts
        if (principal?.type === 'complex') {
          this.openComplexPopup(principal, L.latLng(lat, lng));
          return;
        }
```

  - `openDetail`, in testa:

```ts
    if (point.type === 'complex') {
      this.navigator.openComplex(point.id).subscribe((saved) => saved && this.reload());
      return;
    }
```

  - nuovo metodo (stesso pattern DOM di `openAddPicker`: innerHTML e bind dei click dopo l'apertura):

```ts
  private openComplexPopup(c: MapPoint, at: L.LatLng): void {
    if (!this.map) return;
    const type = c.complexType ? COMPLEX_TYPE_LABEL[c.complexType] : 'Complesso';
    const html = `<div class="map-complex-popup">
        <strong>${this.escapeAttr(c.name)}</strong>
        <div>${this.escapeAttr(type)} · ${c.assetIds?.length ?? 0} immobili</div>
        <button type="button" data-action="open">Apri scheda</button>
        <button type="button" data-action="expand">Mostra immobili</button>
      </div>`;
    const popup = L.popup().setLatLng(at).setContent(html).openOn(this.map);
    const el = popup.getElement();
    el?.querySelector('[data-action="open"]')?.addEventListener('click', () => {
      this.map?.closePopup();
      this.openDetail(c);
    });
    el?.querySelector('[data-action="expand"]')?.addEventListener('click', () => {
      this.map?.closePopup();
      this.expandedComplexes.add(c.id);
      this.renderPoints(this.visiblePoints());
      const bounds = (c.assetIds ?? [])
        .map((id) => this.assetMarkers.get(id)?.getLatLng())
        .filter((ll): ll is L.LatLng => !!ll);
      if (bounds.length) this.map?.fitBounds(L.latLngBounds(bounds), { maxZoom: COMPLEX_EXPAND_ZOOM - 1, padding: [40, 40] });
    });
  }
```

  (importare `COMPLEX_TYPE_LABEL` da `../complexes/complex.model`; `escapeAttr` esiste già.) Il `maxZoom` sotto la soglia evita che lo zoom chiuda/apra di nuovo tutti i complessi.
  - In `classifyGroup` un punto `complex` da solo è già `principal` (gruppo di 1). Se un complesso cade sulla stessa coordinata di un altro punto, diventa un gruppo misto: nessun cambiamento richiesto.
  - Dove il codice usa `'asset' | 'utility' | 'plant'` come tipo di filtro dei badge (`data-badge-filter`), il complesso non ha badge: nessun cambiamento.

- [ ] **Step 5: Pannello livelli.** In `map.component.html`, dopo il blocco `<!-- Impianti -->`:

```html
      <!-- Complessi -->
      <div class="mp-layer" [class.off]="!showComplexes.value">
        <div class="mp-layer-row">
          <mat-checkbox [formControl]="showComplexes" aria-label="Mostra complessi"></mat-checkbox>
          <span class="map-pin mp-sample" style="background: var(--entity-complex)"><span class="material-icons">domain</span></span>
          <span class="mp-name">Complessi</span>
          <span class="mp-count" matTooltip="Punti visibili">{{ layerCounts.complex }}</span>
        </div>
      </div>
```

  Stile del popup in `styles.scss` globale (CSS di Leaflet, prefisso `html`):

```scss
html .map-complex-popup { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
html .map-complex-popup button { cursor: pointer; text-align: left; }
```

- [ ] **Step 6: Build e prova manuale.** `docker exec utenzepa-frontend-1 pnpm run build` → ok. Poi con `ng serve` attivo e utente temporaneo: creare un complesso con 2 immobili localizzati vicini, aprire `/map`. Expected:
  - a zoom 14 un pin `domain` al centro dei due, nessun pin dei due immobili né delle loro utenze;
  - clic → popup con nome, tipo, "2 immobili"; "Mostra immobili" → compaiono i 2 immobili (e le utenze), sparisce il pin complesso;
  - zoom ≥ 17 → tutti i complessi aperti; tornando sotto 17 restano aperti solo quelli espansi col clic;
  - togliendo la spunta "Complessi" gli immobili ricompaiono normalmente (nessun punto complesso dal backend).

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/app/pages/map/map-point.entity.ts frontend/src/app/pages/map/map.service.ts frontend/src/app/pages/map/map.component.ts frontend/src/app/pages/map/map.component.html frontend/src/styles.scss
git commit -m "feat(frontend): livello complessi in mappa"
```

---

### Task 10: Guida, versione, verifica E2E

**Files:**
- Modify: `frontend/public/guida/guida.md`
- Modify: `publiccode.yml`

- [ ] **Step 1: Guida.** In `guida.md`:
  - data in testa: `_Ultimo aggiornamento: <data della PR>_`;
  - in "Operazioni frequenti", dopo "Consultare la mappa", nuova sezione (ancora `gestire-i-complessi`, usata da `GUIDA_PER_PAGINA`):

```markdown
### Gestire i complessi

Un **complesso** raggruppa immobili gestiti o censiti come un insieme: una palazzina di alloggi, un plesso scolastico, un impianto sportivo con più edifici.

1. Apri **Complessi** dal menu e premi **Nuovo complesso**, oppure scegli **Nuovo complesso** dal campo **Complesso** nella scheda di un immobile.
2. Nel tab **Immobili** collega gli immobili del complesso. Un immobile sta in un solo complesso: collegarlo qui lo toglie da quello precedente.
3. I tab **Utenze**, **Impianti** e **Contratti immobiliari** mostrano quelli degli immobili del complesso, in sola lettura: si modificano dalle loro schede.
4. Un complesso con immobili collegati non si può eliminare: scollega prima gli immobili.

In **Mappa** il livello **Complessi** mostra un solo pin per complesso. Clicca il pin e scegli **Mostra immobili**, oppure avvicinati (zoom alto): compaiono gli immobili e le loro utenze.
```

  - in "Consultare la mappa" aggiungere la riga: `- Il livello **Complessi** raggruppa gli immobili di un complesso in un solo pin (vedi «Gestire i complessi»).`

- [ ] **Step 2: Versione.** `publiccode.yml`: `softwareVersion: "v1.18.0"`, `releaseDate: "<data della PR>"`.

- [ ] **Step 3: Build completa.** `docker exec utenzepa-frontend-1 pnpm run build` → ok (include `check-guida`).

- [ ] **Step 4: Test backend toccati.**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/complexes src/apis/map src/apis/asset src/apis/photos --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: E2E Playwright** (utente temporaneo, login via API, screenshot solo in `.playwright-mcp/`):
  1. `/complexes` → "Nuovo complesso" → nome "Prova E2E", tipo "Altro" → Salva: la scheda resta aperta con i tab Utenze/Impianti/Contratti.
  2. Tab Immobili → "Collega immobile" ×2 → Salva → tab Utenze mostra le utenze dei due immobili.
  3. `/building?selectedId=<id di uno dei due>` → campo Complesso = "Prova E2E"; "Apri il complesso" apre la scheda.
  4. `/map` → pin complesso, clic → "Mostra immobili" → pin immobili visibili.
  5. Scheda complesso → scollegare i due immobili → Salva → eliminare il complesso dall'elenco (prima con immobili collegati: messaggio di errore con il numero).
  6. Eliminare l'utente temporaneo.

- [ ] **Step 6: Commit.**

```bash
git add frontend/public/guida/guida.md publiccode.yml
git commit -m "docs: guida complessi e versione 1.18.0"
```
