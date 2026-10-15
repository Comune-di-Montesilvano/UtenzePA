# Impianto elettrico dell'edificio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuovo tipo di impianto `ELECTRICAL_SYSTEM` con scheda richiesta dalla normativa (DM 37/08, DPR 462/01) e verifiche DPR 462 create/aggiornate in automatico (v1.28.0).

**Architecture:** Tabella 1:1 `plant_electrical` sul modello di `plant_elevator`; funzione pura `electricalInspectionPlan` in `plant.calc.ts` applicata da `PlantsService` dopo il salvataggio dei dettagli; frontend: gruppo `electrical` nel form del dialog impianto, tab Dati tecnici e Verifiche.

**Tech Stack:** NestJS 11 + TypeORM (MySQL 8), Jest; Angular 22 + Material; Playwright dall'host.

**Spec:** `docs/superpowers/specs/2026-10-15-impianto-elettrico-design.md`

## Global Constraints

- Comandi Docker uno alla volta; jest `--maxWorkers=2`, solo file rilevanti.
- Sorgenti CRLF: modifiche con script Python che preserva `\r\n` (helper `crlf_edit.py` nello scratchpad); mai `sed -i` sui `.ts`; in heredoc Bash `\\` diventa `\`: patch scritte col Write tool.
- `pnpm run lint` nel container riformatta e converte CRLF: dopo, scartare tutto tranne i file della feature.
- Mai `git add .`/`-A`; niente HTTP 409; colonne stringa nullable con `type: 'varchar'`.
- Migration scritta in `backend/scratch/`, spostata a contenuto finale; verificare riga in `migrations`, `schema:log`, ciclo down → up.
- Etichette: tipo «Impianto elettrico», icona `bolt`; verifiche `Messa a terra (DPR 462/01)` e `Scariche atmosferiche (DPR 462/01)`; periodicità `ORDINARY` 60, `HIGH_RISK` 24, `EXPLOSION` 24 mesi.
- Guida aggiornata nella stessa PR con data in testa; `publiccode.yml` → `v1.28.0`.
- Nessun dato personale in test, commit, PR.

## Review Focus

1. **Cambio classificazione su impianto con verifica già registrata (ultima data, esito)**: si aggiorna solo la periodicità e la prossima scadenza ricalcolata, non si perdono data/esito/ente → test in Task 2 (calc) e Task 3 (service: `next_date` ricalcolato con `computeNextDate`).
2. **Verifica creata a mano con nome simile** (es. «Verifica messa a terra»): non viene riconosciuta, il sistema ne aggiunge una con il nome standard → comportamento accettato; il confronto è sul nome esatto (trim, maiuscole ignorate) → test in Task 2.
3. **Cambio tipo da elettrico ad altro**: dettaglio eliminato, verifiche lasciate (storico) → test in Task 3.
4. **Scariche atmosferiche = sì senza classificazione**: nessuna verifica creata (manca la periodicità) e la scheda lo dice → test in Task 2; suggerimento in Task 5.
5. **Rollback della migration con impianti elettrici presenti**: si ferma con errore esplicito → verificato in Task 1 (ciclo down → up a tabella vuota; down con una riga di prova → errore).

---

### Task 1: Migration, enum, entity, DTO

**Files:**
- Create: `backend/src/database/migrations/1794600000000-ElectricalSystem.ts` (prima in `backend/scratch/`)
- Create: `backend/src/apis/plants/entity/plant-electrical.entity.ts`
- Create: `backend/src/apis/plants/dto/plant-electrical.dto.ts`
- Create: `backend/src/apis/plants/dto/plant-electrical.dto.spec.ts`
- Modify: `backend/src/apis/plants/enum/plant.enum.ts` (PlantType + nuovi enum)
- Modify: `backend/src/apis/plants/entity/plant.entity.ts` (relazione `electrical`)
- Modify: `backend/src/apis/plants/dto/create-plant.dto.ts` (campo `electrical`)
- Modify: `backend/src/apis/plants/plants.module.ts` (`TypeOrmModule.forFeature([... PlantElectrical])`)

**Interfaces:**
- Produces: `PlantType.ELECTRICAL_SYSTEM`; enum `ElectricalSupply { LV, MV }`, `GroundingClass { ORDINARY, HIGH_RISK, EXPLOSION }`, `ConformityType { DICO, DIRI }`; entity `PlantElectrical` (tabella `plant_electrical`); `PlantElectricalDto`; `Plant.electrical`.

- [ ] **Step 1: Test del DTO (RED)**

`plant-electrical.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PlantElectricalDto } from './plant-electrical.dto';

const errorsFor = async (payload: Record<string, unknown>) =>
  (await validate(plainToInstance(PlantElectricalDto, payload))).map((e) => e.property);

describe('PlantElectricalDto', () => {
  it('accetta una scheda completa', async () => {
    expect(
      await errorsFor({
        supply: 'LV', grounding_class: 'HIGH_RISK', conformity_type: 'DICO', conformity_date: '2012-05-10',
        conformity_number: '12/2012', inail_date: '2012-06-01', inail_number: 'P-123', lightning_protection: false,
      }),
    ).toEqual([]);
  });

  it('accetta tutti i campi vuoti', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('rifiuta classificazione e date non valide', async () => {
    const errors = await errorsFor({ grounding_class: 'ALTRO', conformity_date: '2012-02-30' });
    expect(errors).toEqual(expect.arrayContaining(['grounding_class', 'conformity_date']));
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/plants/dto/plant-electrical.dto.spec.ts --maxWorkers=2`
Expected: FAIL (modulo mancante).

- [ ] **Step 2: Enum, entity, DTO**

`plant.enum.ts`: aggiungere `ELECTRICAL_SYSTEM = 'ELECTRICAL_SYSTEM',` in fondo a `PlantType`, e:

```ts
// Impianto elettrico: alimentazione, classificazione del luogo per il DPR
// 462/01 (periodicità della verifica di terra), tipo di dichiarazione DM 37/08.
export enum ElectricalSupply {
  LV = 'LV',
  MV = 'MV',
}

export enum GroundingClass {
  ORDINARY = 'ORDINARY',
  HIGH_RISK = 'HIGH_RISK',
  EXPLOSION = 'EXPLOSION',
}

export enum ConformityType {
  DICO = 'DICO',
  DIRI = 'DIRI',
}
```

`plant-electrical.entity.ts`:

```ts
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Plant } from './plant.entity';
import { ConformityType, ElectricalSupply, GroundingClass } from '../enum/plant.enum';

// Impianto elettrico dell'edificio: dati richiesti da DM 37/08 (conformità)
// e DPR 462/01 (denuncia INAIL, classificazione per la verifica di terra).
@Entity('plant_electrical')
export class PlantElectrical {
  @PrimaryColumn({ type: 'int' })
  plant_id: number;

  @OneToOne(() => Plant, (plant) => plant.electrical, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plant_id' })
  plant: Plant;

  @Column({ type: 'enum', enum: ElectricalSupply, nullable: true })
  supply: ElectricalSupply | null;

  @Column({ type: 'enum', enum: GroundingClass, nullable: true })
  grounding_class: GroundingClass | null;

  // null = non nota.
  @Column({ type: 'enum', enum: ConformityType, nullable: true })
  conformity_type: ConformityType | null;

  @Column({ type: 'date', nullable: true })
  conformity_date: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  conformity_number: string | null;

  // Denuncia di messa in esercizio all'INAIL (la DiCo vale come omologazione).
  @Column({ type: 'date', nullable: true })
  inail_date: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  inail_number: string | null;

  // Impianto di protezione dalle scariche atmosferiche; null = non nota.
  @Column({ type: 'boolean', nullable: true })
  lightning_protection: boolean | null;
}
```

`plant-electrical.dto.ts`:

```ts
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DateOnly } from '@/common/decorators/date-only.decorator';
import { ConformityType, ElectricalSupply, GroundingClass } from '../enum/plant.enum';

export class PlantElectricalDto {
  @IsOptional()
  @IsEnum(ElectricalSupply)
  supply?: ElectricalSupply | null;

  @IsOptional()
  @IsEnum(GroundingClass)
  grounding_class?: GroundingClass | null;

  @IsOptional()
  @IsEnum(ConformityType)
  conformity_type?: ConformityType | null;

  @IsOptional()
  @DateOnly()
  conformity_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  conformity_number?: string | null;

  @IsOptional()
  @DateOnly()
  inail_date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  inail_number?: string | null;

  @IsOptional()
  @IsBoolean()
  lightning_protection?: boolean | null;
}
```

Verificare che `@DateOnly()` rifiuti `2012-02-30` (stesso decoratore dei consumi: `IsDateString({strict:true})` lo rifiuta). Se `DateOnly` non valida, aggiungere `@IsDateString({ strict: true })`.

`plant.entity.ts`: import e

```ts
  @OneToOne(() => PlantElectrical, (electrical) => electrical.plant)
  electrical: PlantElectrical | null;
```

`create-plant.dto.ts` (dopo `elevator`):

```ts
  @IsOptional()
  @ValidateNested()
  @Type(() => PlantElectricalDto)
  electrical?: PlantElectricalDto | null;
```

`plants.module.ts`: aggiungere `PlantElectrical` a `forFeature`.

- [ ] **Step 3: Migration (scratch, poi spostata)**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

const TYPES =
  "'THERMAL', 'ELEVATOR', 'FIRE_PROTECTION', 'PHOTOVOLTAIC', 'PUBLIC_LIGHTING', 'TRAFFIC_LIGHT', " +
  "'LIFTING_PUMP', 'FOUNTAIN', 'ELECTRICAL_CABIN', 'WATER_KIOSK', 'VIDEO_SURVEILLANCE', 'BIKE_STATION', " +
  "'POWER_POINT', 'WATER_POINT', 'SEWAGE', 'IRRIGATION', 'POWERED_STREET_FURNITURE', 'COMPACTOR', 'STORMWATER'";

// Impianto elettrico dell'edificio (DM 37/08, DPR 462/01): nuovo tipo e scheda.
export class ElectricalSystem1794600000000 implements MigrationInterface {
  name = 'ElectricalSystem1794600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`plants\` MODIFY \`type\` enum (${TYPES}, 'ELECTRICAL_SYSTEM') NOT NULL`);
    await q.query(
      "CREATE TABLE `plant_electrical` (`plant_id` int NOT NULL, `supply` enum ('LV', 'MV') NULL, `grounding_class` enum ('ORDINARY', 'HIGH_RISK', 'EXPLOSION') NULL, `conformity_type` enum ('DICO', 'DIRI') NULL, `conformity_date` date NULL, `conformity_number` varchar(100) NULL, `inail_date` date NULL, `inail_number` varchar(100) NULL, `lightning_protection` tinyint NULL, PRIMARY KEY (`plant_id`)) ENGINE=InnoDB",
    );
    await q.query(
      'ALTER TABLE `plant_electrical` ADD CONSTRAINT `FK_plant_electrical_plant` FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }] = await q.query("SELECT COUNT(*) AS n FROM `plants` WHERE `type` = 'ELECTRICAL_SYSTEM'");
    if (Number(n) > 0) {
      throw new Error(
        `Impossibile annullare: ${n} impianti elettrici presenti (con collegamenti, verifiche e allegati). Eliminarli prima a mano.`,
      );
    }
    await q.query('DROP TABLE `plant_electrical`');
    await q.query(`ALTER TABLE \`plants\` MODIFY \`type\` enum (${TYPES}) NOT NULL`);
  }
}
```

Prima di scriverla: controllare il nome della FK generata da TypeORM con `schema:log` (se propone un nome diverso, usare quello per avere `schema:log` pulito) e che l'enum `plants.type` attuale sia esattamente `TYPES` (`SHOW COLUMNS FROM plants LIKE 'type'`).

- [ ] **Step 4: Verifiche**

1. Test DTO: PASS.
2. Spostare la migration; attendere la riga `ElectricalSystem1794600000000` in `migrations` (altrimenti `docker restart utenzepa-api-1`).
3. `schema:log`: nessuno statement su `plants.type` né su `plant_electrical`.
4. `migration:revert` → tabella sparita, enum ridotto; riavvio → riapplicata.
5. Down bloccato: `INSERT` di un impianto `ELECTRICAL_SYSTEM` di prova, `migration:revert` → errore «Impossibile annullare: 1 impianti elettrici presenti…»; poi `DELETE` della riga di prova.
6. `tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/1794600000000-ElectricalSystem.ts backend/src/apis/plants/entity/plant-electrical.entity.ts backend/src/apis/plants/dto/plant-electrical.dto.ts backend/src/apis/plants/dto/plant-electrical.dto.spec.ts backend/src/apis/plants/enum/plant.enum.ts backend/src/apis/plants/entity/plant.entity.ts backend/src/apis/plants/dto/create-plant.dto.ts backend/src/apis/plants/plants.module.ts
git commit -m "feat(plants): tipo impianto elettrico e scheda DM 37/08 – DPR 462/01"
```

---

### Task 2: Piano delle verifiche (funzione pura)

**Files:**
- Modify: `backend/src/apis/plants/plant.calc.ts`
- Test: `backend/src/apis/plants/plant.calc.spec.ts`

**Interfaces:**
- Consumes: `GroundingClass` (Task 1).
- Produces:
  - `GROUNDING_PERIOD_MONTHS: Record<GroundingClass, number>`;
  - `GROUNDING_INSPECTION_KIND = 'Messa a terra (DPR 462/01)'`, `LIGHTNING_INSPECTION_KIND = 'Scariche atmosferiche (DPR 462/01)'`;
  - `electricalInspectionPlan(e: { grounding_class?: GroundingClass | null; lightning_protection?: boolean | null } | null | undefined, existing: { id: number; kind: string; period_months: number | null; deleted?: boolean }[]): { create: { kind: string; period_months: number }[]; update: { id: number; period_months: number }[] }`.

- [ ] **Step 1: Test (RED)**

```ts
  describe('electricalInspectionPlan', () => {
    const terra = (over = {}) => ({ id: 1, kind: 'Messa a terra (DPR 462/01)', period_months: 60, deleted: false, ...over });

    it('senza classificazione: niente', () => {
      expect(electricalInspectionPlan({ grounding_class: null, lightning_protection: true }, [])).toEqual({ create: [], update: [] });
      expect(electricalInspectionPlan(null, [])).toEqual({ create: [], update: [] });
    });

    it('scuola (maggior rischio): crea la verifica di terra a 24 mesi', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.HIGH_RISK }, [])).toEqual({
        create: [{ kind: 'Messa a terra (DPR 462/01)', period_months: 24 }],
        update: [],
      });
    });

    it('ordinario con scariche atmosferiche: due verifiche a 60 mesi', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.ORDINARY, lightning_protection: true }, []).create).toEqual([
        { kind: 'Messa a terra (DPR 462/01)', period_months: 60 },
        { kind: 'Scariche atmosferiche (DPR 462/01)', period_months: 60 },
      ]);
    });

    it('cambio classificazione: aggiorna solo la periodicità della verifica esistente', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.EXPLOSION }, [terra()])).toEqual({
        create: [],
        update: [{ id: 1, period_months: 24 }],
      });
    });

    it('verifica già allineata: niente', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.ORDINARY }, [terra()])).toEqual({ create: [], update: [] });
    });

    it('nome uguale a meno di spazi e maiuscole: riconosciuta', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.ORDINARY }, [terra({ kind: ' messa a terra (dpr 462/01) ' })]).create).toEqual([]);
    });

    it('verifica cancellata ignorata: se ne crea una nuova', () => {
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.ORDINARY }, [terra({ deleted: true })]).create).toHaveLength(1);
    });

    it('scariche atmosferiche tolte: nessuna eliminazione', () => {
      const existing = [terra(), { id: 2, kind: 'Scariche atmosferiche (DPR 462/01)', period_months: 60, deleted: false }];
      expect(electricalInspectionPlan({ grounding_class: GroundingClass.ORDINARY, lightning_protection: false }, existing)).toEqual({ create: [], update: [] });
    });
  });
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/plants/plant.calc.spec.ts --maxWorkers=2`
Expected: FAIL (funzione assente).

- [ ] **Step 2: Implementazione**

```ts
// DPR 462/01: verifica periodica dell'impianto di terra (e delle scariche
// atmosferiche, se presenti) ogni 2 anni nei luoghi a maggior rischio o con
// pericolo di esplosione, ogni 5 negli altri.
export const GROUNDING_PERIOD_MONTHS: Record<GroundingClass, number> = {
  [GroundingClass.ORDINARY]: 60,
  [GroundingClass.HIGH_RISK]: 24,
  [GroundingClass.EXPLOSION]: 24,
};
export const GROUNDING_INSPECTION_KIND = 'Messa a terra (DPR 462/01)';
export const LIGHTNING_INSPECTION_KIND = 'Scariche atmosferiche (DPR 462/01)';

// Verifiche da creare o di cui allineare la periodicità dopo il salvataggio
// della scheda elettrica. Mai eliminazioni: le verifiche restano come storico.
export function electricalInspectionPlan(
  e: { grounding_class?: GroundingClass | null; lightning_protection?: boolean | null } | null | undefined,
  existing: { id: number; kind: string; period_months: number | null; deleted?: boolean }[],
): { create: { kind: string; period_months: number }[]; update: { id: number; period_months: number }[] } {
  const plan = { create: [] as { kind: string; period_months: number }[], update: [] as { id: number; period_months: number }[] };
  if (!e?.grounding_class) return plan;
  const period = GROUNDING_PERIOD_MONTHS[e.grounding_class];
  const kinds = [GROUNDING_INSPECTION_KIND, ...(e.lightning_protection ? [LIGHTNING_INSPECTION_KIND] : [])];
  const norm = (s: string) => s.trim().toLowerCase();
  for (const kind of kinds) {
    const found = existing.find((i) => !i.deleted && norm(i.kind) === norm(kind));
    if (!found) plan.create.push({ kind, period_months: period });
    else if (found.period_months !== period) plan.update.push({ id: found.id, period_months: period });
  }
  return plan;
}
```

- [ ] **Step 3: GREEN** — stesso comando, Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/apis/plants/plant.calc.ts backend/src/apis/plants/plant.calc.spec.ts
git commit -m "feat(plants): verifiche DPR 462/01 dalla classificazione dell'impianto elettrico"
```

---

### Task 3: Service — scheda elettrica e verifiche automatiche

**Files:**
- Modify: `backend/src/apis/plants/plants.service.ts` (costruttore, `RELATIONS`, `create`, `update`, `saveDetails`)
- Test: `backend/src/apis/plants/plants.service.spec.ts`

**Interfaces:**
- Consumes: `PlantElectrical`, `PlantElectricalDto` (Task 1), `electricalInspectionPlan`, `computeNextDate` (esistente, `plant.calc.ts`).
- Produces: `GET /plants/:id` con `electrical`; salvataggio con `electrical` nel payload.

- [ ] **Step 1: Test (RED)**

Nel `beforeEach`: `electricalRepo = { save: jest.fn(async (d) => d), delete: jest.fn() };` passato al costruttore **subito dopo** `elevatorRepo`. `inspectionRepo` riceve anche `find: jest.fn().mockResolvedValue([])`.

```ts
  it('impianto elettrico: salva la scheda e crea la verifica di terra a 24 mesi', async () => {
    repo.findOne.mockResolvedValue(plant({ id: 9, type: 'ELECTRICAL_SYSTEM' }));
    await service.create({ type: 'ELECTRICAL_SYSTEM', code: 'EL-1', name: 'Scuola', asset_ids: [1],
      electrical: { grounding_class: 'HIGH_RISK', lightning_protection: null } } as never, 3);
    expect(electricalRepo.save).toHaveBeenCalledWith(expect.objectContaining({ plant_id: 9, grounding_class: 'HIGH_RISK' }));
    expect(inspectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ plant_id: 9, kind: 'Messa a terra (DPR 462/01)', period_months: 24, created_by_user_id: 3 }),
    );
  });

  it('cambio classificazione: periodicità e prossima scadenza ricalcolate, data e esito invariati', async () => {
    repo.findOne.mockResolvedValue(plant({ id: 9, type: 'ELECTRICAL_SYSTEM', utilities: [] }));
    inspectionRepo.find.mockResolvedValue([
      { id: 4, plant_id: 9, kind: 'Messa a terra (DPR 462/01)', period_months: 60, last_date: '2024-03-10', outcome: 'Positivo', deleted: false },
    ]);
    await service.update(9, { electrical: { grounding_class: 'HIGH_RISK' } } as never, 3);
    expect(inspectionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4, period_months: 24, next_date: '2026-03-10', last_date: '2024-03-10', outcome: 'Positivo' }),
    );
  });

  it('cambio tipo da elettrico: scheda elettrica eliminata, verifiche lasciate', async () => {
    repo.findOne.mockResolvedValue(plant({ id: 9, type: 'ELECTRICAL_SYSTEM', utilities: [] }));
    await service.update(9, { type: 'ELECTRICAL_CABIN' } as never, 3);
    expect(electricalRepo.delete).toHaveBeenCalledWith({ plant_id: 9 });
    expect(inspectionRepo.save).not.toHaveBeenCalled();
  });
```

(Adattare l'helper `plant()` e i mock di `repo.findOne`/`super.update` come nei test di update esistenti del file; `computeNextDate('2024-03-10', 24)` = `'2026-03-10'`: verificarlo leggendo `computeNextDate` e correggere l'attesa se la funzione usa un'altra convenzione.)

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/plants/plants.service.spec.ts --maxWorkers=2`
Expected: FAIL.

- [ ] **Step 2: Implementazione**

- Costruttore: `@InjectRepository(PlantElectrical) private readonly electricalRepo: Repository<PlantElectrical>,` dopo `elevatorRepo`.
- `RELATIONS`: `electrical: true`.
- `create`/`update`: destrutturare anche `electrical`; `update` aggiunge `if (type !== PlantType.ELECTRICAL_SYSTEM) await this.electricalRepo.delete({ plant_id: id });`; `saveDetails(id, type, thermal, elevator, electrical, userId)`.
- `saveDetails`:

```ts
    if (type === PlantType.ELECTRICAL_SYSTEM && electrical) {
      await this.electricalRepo.save({ ...electrical, plant_id: plantId });
      await this.syncElectricalInspections(plantId, electrical, userId);
    }
```

- nuovo metodo:

```ts
  // Verifiche DPR 462/01 allineate alla scheda: create o con periodicità
  // aggiornata (prossima scadenza ricalcolata), mai eliminate.
  private async syncElectricalInspections(
    plantId: number,
    electrical: PlantElectricalDto,
    userId: number | undefined,
  ): Promise<void> {
    const existing = await this.inspectionRepo.find({ where: { plant_id: plantId, deleted: false } });
    const plan = electricalInspectionPlan(electrical, existing);
    const by = userId ?? 1;
    for (const c of plan.create) {
      await this.inspectionRepo.save(
        this.inspectionRepo.create({ ...c, plant_id: plantId, last_date: null, next_date: null,
          created_by_user_id: by, updated_by_user_id: by }),
      );
    }
    for (const u of plan.update) {
      const cur = existing.find((i) => i.id === u.id);
      await this.inspectionRepo.save({ ...cur, period_months: u.period_months,
        next_date: computeNextDate(cur.last_date ?? null, u.period_months), updated_by_user_id: by });
    }
  }
```

(`userId ?? 1`: stessa convenzione dei salvataggi di sistema del service; se il service ha un fallback diverso, usare quello.)

- [ ] **Step 3: GREEN** — `docker exec utenzepa-api-1 pnpm exec jest src/apis/plants --maxWorkers=2`, Expected: PASS (tutti i test impianti).

- [ ] **Step 4: Commit**

```bash
git add backend/src/apis/plants/plants.service.ts backend/src/apis/plants/plants.service.spec.ts
git commit -m "feat(plants): scheda elettrica e verifiche DPR 462/01 al salvataggio"
```

---

### Task 4: Frontend — tipo e modello

**Files:**
- Modify: `frontend/src/app/pages/plants/plant.model.ts`

**Interfaces:**
- Produces: `PlantType` con `'ELECTRICAL_SYSTEM'`; `PLANT_TYPE_LABEL.ELECTRICAL_SYSTEM = 'Impianto elettrico'`; `PLANT_TYPE_ICON.ELECTRICAL_SYSTEM = 'bolt'`; `PLANT_TYPE_TABS.ELECTRICAL_SYSTEM = ['technical', 'inspections']`; tipi `GroundingClass`, `ElectricalSupply`, `ConformityType`; `PlantElectricalData`; `GROUNDING_CLASS_LABEL`; `PlantPayload.electrical?`, `Plant.electrical`.

- [ ] **Step 1: Modifiche**

```ts
export type ElectricalSupply = 'LV' | 'MV';
export type GroundingClass = 'ORDINARY' | 'HIGH_RISK' | 'EXPLOSION';
export type ConformityType = 'DICO' | 'DIRI';

export const GROUNDING_CLASS_LABEL: Record<GroundingClass, string> = {
  ORDINARY: 'Ordinario — verifica ogni 5 anni',
  HIGH_RISK: 'Maggior rischio (scuole, luoghi aperti al pubblico, locali medici) — 2 anni',
  EXPLOSION: 'Pericolo di esplosione — 2 anni',
};

export interface PlantElectricalData {
  supply: ElectricalSupply | null;
  grounding_class: GroundingClass | null;
  conformity_type: ConformityType | null;
  conformity_date: string | null;
  conformity_number: string | null;
  inail_date: string | null;
  inail_number: string | null;
  lightning_protection: boolean | null;
}
```

`PlantType` + `| 'ELECTRICAL_SYSTEM'`; etichetta, icona, tab; `PlantPayload.electrical?: PlantElectricalData | null`; `Plant` omette e ridichiara `electrical: PlantElectricalData | null`.

- [ ] **Step 2: Build** — `docker exec utenzepa-frontend-1 pnpm run build`, Expected: ok (eventuali `Record<PlantType, …>` incompleti segnalati dal compilatore vanno completati qui).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/pages/plants/plant.model.ts
git commit -m "feat(plants): tipo impianto elettrico nel modello frontend"
```

---

### Task 5: Frontend — scheda Dati tecnici

**Files:**
- Modify: `frontend/src/app/pages/plants/plant-edit-dialog.component.ts` / `.html`

**Interfaces:**
- Consumes: Task 4.

- [ ] **Step 1: Form**

Gruppo `electrical` nel `form`:

```ts
    electrical: this.fb.group({
      supply: [null as ElectricalSupply | null],
      grounding_class: [null as GroundingClass | null],
      conformity_type: [null as ConformityType | null],
      conformity_date: [null as Date | null],
      conformity_number: [''],
      inail_date: [null as Date | null],
      inail_number: [''],
      lightning_protection: [null as boolean | null],
    }),
```

`syncTypeGroups`: `toggle('electrical', type === 'ELECTRICAL_SYSTEM')` (allargare il tipo del parametro a `'thermal' | 'elevator' | 'electrical'`). `patch()`: valori da `p.electrical` (date con `toDate`). `save()`:

```ts
    if (type === 'ELECTRICAL_SYSTEM') {
      const el = v.electrical;
      payload.electrical = {
        supply: el.supply ?? null,
        grounding_class: el.grounding_class ?? null,
        conformity_type: el.conformity_type ?? null,
        conformity_date: el.conformity_date ? toIsoDate(el.conformity_date) : null,
        conformity_number: text(el.conformity_number),
        inail_date: el.inail_date ? toIsoDate(el.inail_date) : null,
        inail_number: text(el.inail_number),
        lightning_protection: el.lightning_protection ?? null,
      };
    }
```

Dopo il salvataggio di un impianto elettrico, la scheda ricarica l'impianto (come già fa) così il tab Verifiche mostra le verifiche create.

- [ ] **Step 2: Proposta «maggior rischio»**

Quando il tipo diventa `ELECTRICAL_SYSTEM` su un **nuovo** impianto e `grounding_class` è vuoto, se uno degli immobili collegati (`assetRows`) ha `assetFunction?.name` o `asset_name` che contiene (senza maiuscole) `istruzion`, `scuol`, `asilo`, `nido`, `infanzia`, `primaria` → `grounding_class = 'HIGH_RISK'`. Ricalcolare anche in `refreshLinks()` finché il campo non è stato toccato (`pristine`).

- [ ] **Step 3: Template** (dentro il tab Dati tecnici, accanto ai blocchi THERMAL/ELEVATOR)

```html
          @if (currentType() === 'ELECTRICAL_SYSTEM') {
            <div formGroupName="electrical">
              <div class="sheet-section-title">Impianto elettrico</div>
              <div class="sheet-grid">
                <mat-form-field>
                  <mat-label>Alimentazione</mat-label>
                  <mat-select formControlName="supply">
                    <mat-option [value]="null">Non indicata</mat-option>
                    <mat-option value="LV">Bassa tensione</mat-option>
                    <mat-option value="MV">Media tensione (cabina propria)</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field class="span-2">
                  <mat-label>Classificazione per il DPR 462/01</mat-label>
                  <mat-select formControlName="grounding_class">
                    <mat-option [value]="null">Non indicata</mat-option>
                    @for (c of groundingClasses; track c.value) {
                      <mat-option [value]="c.value">{{ c.label }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Stabilisce ogni quanto va verificato l'impianto di terra</mat-hint>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Protezione dalle scariche atmosferiche</mat-label>
                  <mat-select formControlName="lightning_protection">
                    <mat-option [value]="null">Non nota</mat-option>
                    <mat-option [value]="true">Presente</mat-option>
                    <mat-option [value]="false">Assente</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>
              <div class="sheet-section-title">Conformità (DM 37/08)</div>
              <div class="sheet-grid">
                <mat-form-field>
                  <mat-label>Dichiarazione</mat-label>
                  <mat-select formControlName="conformity_type">
                    <mat-option [value]="null">Non nota</mat-option>
                    <mat-option value="DICO">Di conformità (DiCo)</mat-option>
                    <mat-option value="DIRI">Di rispondenza (DiRi)</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Data</mat-label>
                  <input matInput [matDatepicker]="conformityPicker" formControlName="conformity_date">
                  <mat-datepicker-toggle matIconSuffix [for]="conformityPicker"></mat-datepicker-toggle>
                  <mat-datepicker #conformityPicker></mat-datepicker>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Numero</mat-label>
                  <input matInput formControlName="conformity_number" maxlength="100">
                </mat-form-field>
              </div>
              <div class="sheet-section-title">Denuncia INAIL (DPR 462/01)</div>
              <div class="sheet-grid">
                <mat-form-field>
                  <mat-label>Data di invio</mat-label>
                  <input matInput [matDatepicker]="inailPicker" formControlName="inail_date">
                  <mat-datepicker-toggle matIconSuffix [for]="inailPicker"></mat-datepicker-toggle>
                  <mat-datepicker #inailPicker></mat-datepicker>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Numero pratica</mat-label>
                  <input matInput formControlName="inail_number" maxlength="100">
                </mat-form-field>
              </div>
              <p class="sheet-hint">
                Al salvataggio, con la classificazione indicata, il tab Verifiche riceve «Messa a terra (DPR 462/01)»
                e, se la protezione è presente, «Scariche atmosferiche (DPR 462/01)», con la periodicità giusta.
                @if (form.controls.electrical.value.lightning_protection && !form.controls.electrical.value.grounding_class) {
                  Senza classificazione le verifiche non vengono create.
                }
              </p>
            </div>
          }
```

con `readonly groundingClasses = (Object.keys(GROUNDING_CLASS_LABEL) as GroundingClass[]).map(value => ({value, label: GROUNDING_CLASS_LABEL[value]}));` e `[error]="invalid('thermal', 'elevator', 'electrical')"` sull'etichetta del tab (verificare la firma di `invalid`).

- [ ] **Step 4: Build** — Expected: ok.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html
git commit -m "feat(plants): scheda dell'impianto elettrico nel dialog impianto"
```

---

### Task 6: Guida, versione, verifica reale, PR

**Files:**
- Modify: `frontend/public/guida/guida.md`, `publiccode.yml`

- [ ] **Step 1: Guida** — data in testa `2026-10-15`; nuova sezione in «Operazioni frequenti», dopo «Dati tecnici di un ascensore»: `### Impianto elettrico di un edificio` con i dati della scheda, la regola delle verifiche DPR 462 (2/5 anni, create al salvataggio, mai eliminate), i documenti da allegare (DiCo/DiRi, verbali, progetto). `pnpm run build` (esegue `check-guida`): ok.
- [ ] **Step 2: publiccode.yml** — `softwareVersion: "v1.28.0"`, `releaseDate: "2026-10-15"`.
- [ ] **Step 3: Test e lint** — `jest src/apis/plants src/apis/anomalies --maxWorkers=2` verdi; lint; scartare le riformattazioni fuori feature.
- [ ] **Step 4: Prova reale con Playwright** (utente temporaneo, eliminato dopo): nuovo impianto «Impianto elettrico» collegato a una scuola → classificazione proposta «maggior rischio»; scariche atmosferiche «Presente»; Salva → tab Verifiche con due verifiche a 24 mesi; cambio a «Ordinario» → periodicità 60; cambio tipo ad altro e ritorno; pulizia (impianto di prova, verifiche, audit, utente).
- [ ] **Step 5: Commit e PR**

```bash
git add frontend/public/guida/guida.md publiccode.yml
git commit -m "docs(guida): impianto elettrico dell'edificio (v1.28.0)"
git push -u origin feat/impianto-elettrico
gh pr create --title "feat(plants): impianto elettrico dell'edificio (DM 37/08, DPR 462/01) (v1.28.0)" --body-file <file>
```

Merge e tag solo con l'ok dell'utente.
