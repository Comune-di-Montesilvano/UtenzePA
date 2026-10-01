# Contratti immobiliari Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il modulo Concessioni (`utilizer_grant`) in un registro unico di contratti immobiliari attivi/passivi con canone, scadenze, rinnovo tacito, avvisi in dashboard, e pulire/importare i dati reali.

**Architecture:** Si estendono le tabelle esistenti `utilizer_grant` (contratto) e `utilizer` (controparte) con una migration scritta a mano; gli immobili passano a molti-a-molti (`utilizer_grant_assets`). I valori derivati (canone annuo, scadenza effettiva, termine disdetta, stato mostrato) sono funzioni pure in un helper, calcolate al volo nel service. Pulizia dati e import sono script Python in `.audit-w/` (dati reali, mai in repo) che generano SQL in transazione, come gli import precedenti.

**Tech Stack:** NestJS 11 + TypeORM 1.1 (MySQL 8), Angular 22 + Angular Material, Jest (`--maxWorkers=2`), Python 3 per gli script dati.

**Spec:** `docs/superpowers/specs/2026-10-01-contratti-immobiliari-design.md`

**Scostamento dalla spec (deciso):** la spec indica `backend/tools/` per gli script di pulizia e import; il piano li mette in `.audit-w/contratti/` (Python → SQL), come gli import precedenti (storico CONSIP, fatture ACA), perché leggono e producono dati reali che non devono finire nel repo. Il commento nell'importer Access rimanda allo script.

## Global Constraints

- Nomi tabelle DB invariati: `utilizer_grant`, `utilizer`. Nuova join `utilizer_grant_assets(utilizer_grant_id, asset_id)`.
- Path API invariati: `utilizer-grant`, `utilizer`; route frontend invariate (`/utilizer-grant`, `/utilizer`).
- UI: "Concessioni" → **"Contratti immobiliari"**; "Utilizzatori" → **"Controparti"**.
- Enum: `direction` `ACTIVE|PASSIVE` (default `ACTIVE`); `kind` `LEASE|CONCESSION|LOAN_FOR_USE|HOUSING_ASSIGNMENT|LAND_OCCUPATION` (default `CONCESSION`); `rent_period` `MONTHLY|BIMONTHLY|QUARTERLY|SEMIANNUAL|ANNUAL|ONE_OFF`; `status` `ACTIVE|RETURNED|TERMINATED|DISPUTED` (default `ACTIVE`); stato mostrato `ACTIVE|EXPIRING|EXPIRED|RETURNED|TERMINATED|DISPUTED`.
- Soglie: disdetta entro **60 giorni**, in scadenza entro **4 mesi**.
- Ruolo Lettore: `tax_code` e `contacts` sempre `null`; `name` = "Assegnatario riservato" sui contratti `HOUSING_ASSIGNMENT`. Lato backend, anche nelle risposte annidate di immobili/utenze.
- Migration: scritta in `.audit-w/` (o scratchpad) e spostata in `backend/src/database/migrations/` solo a contenuto finale (il watcher la esegue appena compare).
- Jest sempre con `--maxWorkers=2`, dentro il container: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest <path> --maxWorkers=2`.
- Comandi Docker uno alla volta, mai in parallelo.
- Commit: mai `git add .`/`-A`; elencare i file. Conventional Commits.
- Frontend: nessuna pagina conclusa senza `ng build` reale (`MSYS_NO_PATHCONV=1 docker exec utenzepa-frontend-1 sh -c 'cd /app; npx ng build --configuration development --output-path /tmp/ngcheck; rm -rf /tmp/ngcheck'`).
- Service frontend che non estendono `AbstractService` allegano a mano `Authorization: Bearer`.
- Nessun `LOCALE_ID`: importi con `toLocaleString('it-IT', {style:'currency', currency:'EUR'})`.

## Review Focus

1. Rinnovo tacito con scadenza originaria molto vecchia (es. 1992 + rinnovi di 6 anni) → la scadenza effettiva deve essere la prima data ≥ oggi, mai un ciclo infinito; `renewal_months = 0` o `null` non deve bloccare il server.
2. Contratto senza immobili (import non abbinato) → elenco, dialog e dashboard funzionano; compare nell'anomalia "senza immobile".
3. Utente Lettore che apre utenze/immobili → i nomi degli assegnatari di alloggio non compaiono neppure nelle colonne "Controparti" della tabella utenze.
4. Modifica di un contratto esistente importato da Access (senza canone, senza date) → il salvataggio non deve fallire per validazioni pensate per i contratti nuovi.
5. Contratto padre eliminato (soft delete) → i figli restano visibili e il dialog non va in errore.

---

## File Structure

Backend (`backend/src/apis/utilizer-grant/`):
- Create `enum/real-estate-contract.enum.ts` — gli enum della spec.
- Create `real-estate-contract.calc.ts` (+ `.spec.ts`) — funzioni pure: canone annuo, scadenza effettiva, termine disdetta, stato mostrato, avvisi.
- Create `real-estate-contract.privacy.ts` (+ `.spec.ts`) — oscuramento controparte per ruolo.
- Create `real-estate-contract.validation.ts` (+ `.spec.ts`) — validazioni di coerenza del contratto risultante.
- Modify `entity/utilizer-grant.entity.ts`, `dto/*.ts`, `utilizer-grant.service.ts` (+ nuovo `.spec.ts`), `utilizer-grant.controller.ts`, `utilizer-grant.module.ts`.
- Modify `../utilizer/entity/utilizer.entity.ts`, `../utilizer/dto/create-utilizer.dto.ts`, `../utilizer/dto/update-utilizer.dto.ts`.
- Modify `../asset/entity/asset.entity.ts`, `../asset/assets.controller.ts`, `../utility/utility.controller.ts`.
- Modify `../anomalies/anomalies.service.ts` (+ spec).
- Modify `../../data-importer/data-importer.service.ts` (import Access concessioni).
- Create `../../database/migrations/1791000000000-RealEstateContracts.ts`.

Frontend (`frontend/src/app/pages/utilizer-grant/`):
- Modify `entity/utilizer-grant.entity.ts`, `entity/utilizer-grant.interface.ts`, `utilizer-grant.service.ts`.
- Create `real-estate-contract.model.ts` — etichette enum, badge, formattazione.
- Modify `data-table-utilizer-grant.component.{ts,html}`, `search-utilizer-grant.component.ts`, `utilizer-grant-filter-dialog.component.ts`, `utilizer-grant.component.{ts,html}`, `utilizer-grant-edit-dialog.component.{ts,html}`.
- Modify `../assets/asset-edit-dialog.component.{ts,html}`, `../utilities/data-table-utilities.component.ts`, `../utilities/utility-filter-dialog.component.html`, `../utilizer/*` (campi controparte), `../../comp/sidebar/sidebar.component.ts`.
- Create `../dashboard/real-estate-contracts-card.component.ts`; modify `../dashboard/dashboard.component.{ts,html}`, `../dashboard/anomalies-card.component.ts`.

Dati (non in repo): `.audit-w/contratti/cleanup_grants.py`, `.audit-w/contratti/import_contracts.py`, output `.sql` + `_report.json`.

---

### Task 1: Enum e calcoli puri

**Files:**
- Create: `backend/src/apis/utilizer-grant/enum/real-estate-contract.enum.ts`
- Create: `backend/src/apis/utilizer-grant/real-estate-contract.calc.ts`
- Test: `backend/src/apis/utilizer-grant/real-estate-contract.calc.spec.ts`

**Interfaces:**
- Produces: enum `ContractDirection`, `ContractKind`, `RentPeriod`, `ContractStatus`, `DisplayStatus`; `annualRent(amount, period): number | null`; `effectiveEndDate(c, today): string | null`; `noticeDeadline(c, today): string | null`; `displayStatus(c, today): DisplayStatus`; `contractAlerts(c, today): { notice: boolean; expiring: boolean; expiredActive: boolean }`; costanti `NOTICE_ALERT_DAYS = 60`, `EXPIRING_MONTHS = 4`. Le date sono stringhe ISO `YYYY-MM-DD`; `c` è `CalcInput`.

- [ ] **Step 1: Enum**

```ts
// backend/src/apis/utilizer-grant/enum/real-estate-contract.enum.ts
export enum ContractDirection {
  ACTIVE = 'ACTIVE', // il Comune incassa
  PASSIVE = 'PASSIVE', // il Comune paga
}

export enum ContractKind {
  LEASE = 'LEASE',
  CONCESSION = 'CONCESSION',
  LOAN_FOR_USE = 'LOAN_FOR_USE',
  HOUSING_ASSIGNMENT = 'HOUSING_ASSIGNMENT',
  LAND_OCCUPATION = 'LAND_OCCUPATION',
}

export enum RentPeriod {
  MONTHLY = 'MONTHLY',
  BIMONTHLY = 'BIMONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
  ONE_OFF = 'ONE_OFF',
}

// Stato dichiarato dall'utente.
export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
}

// Stato mostrato: dichiarato + derivato dalle date.
export enum DisplayStatus {
  ACTIVE = 'ACTIVE',
  EXPIRING = 'EXPIRING',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
  TERMINATED = 'TERMINATED',
  DISPUTED = 'DISPUTED',
}
```

- [ ] **Step 2: Test che falliscono**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.calc.spec.ts
import {
  annualRent,
  contractAlerts,
  displayStatus,
  effectiveEndDate,
  noticeDeadline,
} from './real-estate-contract.calc';
import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

const TODAY = '2026-10-02';
const base = {
  end_date: null as string | null,
  tacit_renewal: false,
  renewal_months: null as number | null,
  notice_months: null as number | null,
  status: ContractStatus.ACTIVE,
};

describe('annualRent', () => {
  it.each([
    [RentPeriod.MONTHLY, 100, 1200],
    [RentPeriod.BIMONTHLY, 100, 600],
    [RentPeriod.QUARTERLY, 100, 400],
    [RentPeriod.SEMIANNUAL, 100, 200],
    [RentPeriod.ANNUAL, 100, 100],
    [RentPeriod.ONE_OFF, 100, 0],
  ])('%s', (period, amount, expected) => {
    expect(annualRent(amount, period)).toBe(expected);
  });

  it('accetta il decimale MySQL come stringa', () => {
    expect(annualRent('354.97' as unknown as number, RentPeriod.MONTHLY)).toBeCloseTo(4259.64, 2);
  });

  it('null se manca importo o periodo', () => {
    expect(annualRent(null, RentPeriod.MONTHLY)).toBeNull();
    expect(annualRent(100, null)).toBeNull();
  });
});

describe('effectiveEndDate', () => {
  it('senza rinnovo tacito è la scadenza originaria anche se passata', () => {
    expect(effectiveEndDate({ ...base, end_date: '2023-06-17' }, TODAY)).toBe('2023-06-17');
  });

  it('con rinnovo tacito si sposta di cicli interi fino a una data >= oggi', () => {
    const c = { ...base, end_date: '2015-12-31', tacit_renewal: true, renewal_months: 72, notice_months: 6 };
    expect(effectiveEndDate(c, TODAY)).toBe('2027-12-31');
  });

  it('scadenza oggi resta oggi', () => {
    const c = { ...base, end_date: TODAY, tacit_renewal: true, renewal_months: 12, notice_months: 1 };
    expect(effectiveEndDate(c, TODAY)).toBe(TODAY);
  });

  it('scadenza molto vecchia non va in ciclo infinito', () => {
    const c = { ...base, end_date: '1992-07-24', tacit_renewal: true, renewal_months: 1, notice_months: 0 };
    expect(effectiveEndDate(c, TODAY)).toBe('2026-10-24');
  });

  it('rinnovo tacito senza durata valida: torna alla scadenza originaria', () => {
    const c = { ...base, end_date: '2020-01-01', tacit_renewal: true, renewal_months: 0, notice_months: 3 };
    expect(effectiveEndDate(c, TODAY)).toBe('2020-01-01');
  });

  it('fine mese: 31 gennaio + 1 mese = 28/29 febbraio', () => {
    const c = { ...base, end_date: '2026-01-31', tacit_renewal: true, renewal_months: 1, notice_months: 0 };
    expect(effectiveEndDate(c, '2026-02-15')).toBe('2026-02-28');
  });

  it('null senza scadenza', () => {
    expect(effectiveEndDate(base, TODAY)).toBeNull();
  });
});

describe('noticeDeadline', () => {
  it('scadenza effettiva meno preavviso, solo con rinnovo tacito', () => {
    const c = { ...base, end_date: '2027-06-30', tacit_renewal: true, renewal_months: 48, notice_months: 6 };
    expect(noticeDeadline(c, TODAY)).toBe('2026-12-30');
    expect(noticeDeadline({ ...c, tacit_renewal: false }, TODAY)).toBeNull();
  });
});

describe('displayStatus', () => {
  it('lo stato dichiarato non attivo vince sulle date', () => {
    expect(displayStatus({ ...base, end_date: '2030-01-01', status: ContractStatus.DISPUTED }, TODAY)).toBe(
      DisplayStatus.DISPUTED,
    );
  });

  it('scaduto, in scadenza entro 4 mesi, attivo', () => {
    expect(displayStatus({ ...base, end_date: '2026-10-01' }, TODAY)).toBe(DisplayStatus.EXPIRED);
    expect(displayStatus({ ...base, end_date: '2027-02-01' }, TODAY)).toBe(DisplayStatus.EXPIRING);
    expect(displayStatus({ ...base, end_date: '2027-03-01' }, TODAY)).toBe(DisplayStatus.ACTIVE);
    expect(displayStatus(base, TODAY)).toBe(DisplayStatus.ACTIVE);
  });
});

describe('contractAlerts', () => {
  it('disdetta entro 60 giorni', () => {
    const c = { ...base, end_date: '2027-06-30', tacit_renewal: true, renewal_months: 48, notice_months: 7 };
    expect(contractAlerts(c, TODAY)).toEqual({ notice: true, expiring: false, expiredActive: false });
  });

  it('in scadenza (senza rinnovo tacito) e scaduto ancora attivo', () => {
    expect(contractAlerts({ ...base, end_date: '2026-12-01' }, TODAY).expiring).toBe(true);
    expect(contractAlerts({ ...base, end_date: '2025-01-01' }, TODAY).expiredActive).toBe(true);
    expect(contractAlerts({ ...base, end_date: '2025-01-01', status: ContractStatus.RETURNED }, TODAY)).toEqual({
      notice: false,
      expiring: false,
      expiredActive: false,
    });
  });
});
```

- [ ] **Step 3: Verifica che fallisca**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant/real-estate-contract.calc.spec.ts --maxWorkers=2`
Expected: FAIL, `Cannot find module './real-estate-contract.calc'`.

- [ ] **Step 4: Implementazione**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.calc.ts
import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

export const NOTICE_ALERT_DAYS = 60;
export const EXPIRING_MONTHS = 4;
// Limite di sicurezza sui cicli di rinnovo (es. rinnovo mensile dal 1900).
const MAX_RENEWAL_CYCLES = 2000;

const PERIOD_FACTOR: Record<RentPeriod, number> = {
  [RentPeriod.MONTHLY]: 12,
  [RentPeriod.BIMONTHLY]: 6,
  [RentPeriod.QUARTERLY]: 4,
  [RentPeriod.SEMIANNUAL]: 2,
  [RentPeriod.ANNUAL]: 1,
  [RentPeriod.ONE_OFF]: 0,
};

export interface CalcInput {
  end_date: string | null;
  tacit_renewal: boolean;
  renewal_months: number | null;
  notice_months: number | null;
  status: ContractStatus;
}

export function annualRent(amount: number | null | undefined, period: RentPeriod | null | undefined): number | null {
  if (amount === null || amount === undefined || !period) return null;
  return Math.round(Number(amount) * PERIOD_FACTOR[period] * 100) / 100;
}

// Somma mesi a una data ISO; se il giorno non esiste nel mese di arrivo si
// usa l'ultimo giorno (31/01 + 1 mese = 28/02).
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function effectiveEndDate(c: CalcInput, today: string): string | null {
  if (!c.end_date) return null;
  const end = c.end_date.slice(0, 10);
  const step = Number(c.renewal_months ?? 0);
  if (!c.tacit_renewal || !(step > 0) || end >= today) return end;
  let cycles = 1;
  let next = addMonths(end, step);
  while (next < today && cycles < MAX_RENEWAL_CYCLES) {
    cycles++;
    // Sempre dalla data originaria: evita la deriva del fine mese (31 → 28 → 28).
    next = addMonths(end, step * cycles);
  }
  return next;
}

export function noticeDeadline(c: CalcInput, today: string): string | null {
  if (!c.tacit_renewal) return null;
  const end = effectiveEndDate(c, today);
  if (!end) return null;
  return addMonths(end, -Number(c.notice_months ?? 0));
}

export function displayStatus(c: CalcInput, today: string): DisplayStatus {
  if (c.status !== ContractStatus.ACTIVE) return c.status as unknown as DisplayStatus;
  const end = effectiveEndDate(c, today);
  if (!end) return DisplayStatus.ACTIVE;
  if (end < today) return DisplayStatus.EXPIRED;
  if (end <= addMonths(today, EXPIRING_MONTHS)) return DisplayStatus.EXPIRING;
  return DisplayStatus.ACTIVE;
}

export function contractAlerts(c: CalcInput, today: string): { notice: boolean; expiring: boolean; expiredActive: boolean } {
  const none = { notice: false, expiring: false, expiredActive: false };
  if (c.status !== ContractStatus.ACTIVE) return none;
  const status = displayStatus(c, today);
  const deadline = noticeDeadline(c, today);
  return {
    notice: !!deadline && deadline >= today && deadline <= addDays(today, NOTICE_ALERT_DAYS),
    expiring: !c.tacit_renewal && status === DisplayStatus.EXPIRING,
    expiredActive: status === DisplayStatus.EXPIRED,
  };
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Verifica che passi**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant/real-estate-contract.calc.spec.ts --maxWorkers=2`
Expected: PASS (tutti i test). Se `1992-07-24` con rinnovo mensile non dà `2026-10-24`, ricontrollare `addMonths` (deve restare il giorno 24).

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/utilizer-grant/enum/real-estate-contract.enum.ts backend/src/apis/utilizer-grant/real-estate-contract.calc.ts backend/src/apis/utilizer-grant/real-estate-contract.calc.spec.ts
git commit -m "feat(contratti-immobiliari): enum e calcoli di scadenza, disdetta e stato"
```

---

### Task 2: Schema: entity e migration

**Files:**
- Modify: `backend/src/apis/utilizer-grant/entity/utilizer-grant.entity.ts`
- Modify: `backend/src/apis/utilizer/entity/utilizer.entity.ts`
- Modify: `backend/src/apis/asset/entity/asset.entity.ts:135-136`
- Create: `backend/src/database/migrations/1791000000000-RealEstateContracts.ts`

**Interfaces:**
- Consumes: enum del Task 1.
- Produces: `UtilizerGrant` con `assets: Asset[]` (ManyToMany, join `utilizer_grant_assets`), `start_date`, `end_date` (`string | null`, tipo `date`), nuove colonne della spec, `parent: UtilizerGrant | null`, `children: UtilizerGrant[]`; `Utilizer.tax_code`, `Utilizer.contacts`; `Asset.utilizerGrants` diventa `@ManyToMany(() => UtilizerGrant, (g) => g.assets)`.

- [ ] **Step 1: Entity contratto**

Sostituire in `utilizer-grant.entity.ts` i campi `grant_date`, `expire_date`, `asset_id_fk`, la relazione `asset` e aggiungere i nuovi campi (gli altri restano):

```ts
  @Column({ type: 'date', nullable: true })
  start_date: string | null;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'enum', enum: ContractDirection, default: ContractDirection.ACTIVE })
  direction: ContractDirection;

  @Column({ type: 'enum', enum: ContractKind, default: ContractKind.CONCESSION })
  kind: ContractKind;

  @Column({ length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  rent_amount: number | null;

  @Column({ type: 'enum', enum: RentPeriod, nullable: true })
  rent_period: RentPeriod | null;

  @Column({ type: 'boolean', default: false })
  vat_applicable: boolean;

  @Column({ type: 'boolean', default: false })
  tacit_renewal: boolean;

  @Column({ type: 'int', nullable: true })
  renewal_months: number | null;

  @Column({ type: 'int', nullable: true })
  notice_months: number | null;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.ACTIVE })
  status: ContractStatus;

  @Column({ length: 255, nullable: true })
  registration_ref: string | null;

  @Column({ length: 255, nullable: true })
  cadastral_ref: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  area_sqm: number | null;

  @Column({ length: 50, nullable: true })
  department: string | null;

  @Column({ type: 'int', nullable: true })
  parent_contract_id: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Immobili oggetto del contratto (facoltativi: contratti importati non abbinati).
  @ManyToMany(() => Asset, (asset) => asset.utilizerGrants)
  @JoinTable({
    name: 'utilizer_grant_assets',
    joinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'asset_id', referencedColumnName: 'id' },
  })
  assets: Asset[];

  @ManyToOne(() => UtilizerGrant, (g) => g.children, { nullable: true })
  @JoinColumn({ name: 'parent_contract_id' })
  parent: UtilizerGrant | null;

  @OneToMany(() => UtilizerGrant, (g) => g.parent)
  children: UtilizerGrant[];
```

Import aggiuntivi: `JoinTable, ManyToMany, OneToMany` da `typeorm` e gli enum da `../enum/real-estate-contract.enum`.

In `asset.entity.ts` sostituire:

```ts
  @OneToMany(() => UtilizerGrant, (utilizerGrant) => utilizerGrant.asset)
  utilizerGrants: UtilizerGrant[];
```

con:

```ts
  @ManyToMany(() => UtilizerGrant, (utilizerGrant) => utilizerGrant.assets)
  utilizerGrants: UtilizerGrant[];
```

(aggiungere `ManyToMany` all'import se manca).

In `utilizer.entity.ts` dopo `description`:

```ts
  @Column({ length: 16, nullable: true })
  tax_code: string | null;

  // Telefoni, email, referente: testo libero come nelle fonti.
  @Column({ type: 'text', nullable: true })
  contacts: string | null;
```

- [ ] **Step 2: Migration in scratch**

Generare lo statement grezzo per avere nomi di FK/indici coerenti con TypeORM, senza toccare la cartella migrations:

Run: `MSYS_NO_PATHCONV=1 docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate /tmp/mig/RealEstateContracts -d src/database/data-source.ts`

Tenere solo gli statement su `utilizer_grant`, `utilizer`, `utilizer_grant_assets` (scartare il drift su altre tabelle). Poi scrivere a mano la migration finale, con la parte dati, in `.audit-w/contratti/1791000000000-RealEstateContracts.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Concessioni → contratti immobiliari (spec 2026-10-01). grant_date era un
// @CreateDateColumn: tutti i valori sono l'istante di import, quindi si azzera;
// expire_date si conserva dove diverso da create_date. Gli immobili passano
// alla join utilizer_grant_assets.
export class RealEstateContracts1791000000000 implements MigrationInterface {
  name = 'RealEstateContracts1791000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`utilizer\` ADD \`tax_code\` varchar(16) NULL, ADD \`contacts\` text NULL`);

    await q.query(
      `CREATE TABLE \`utilizer_grant_assets\` (\`utilizer_grant_id\` int NOT NULL, \`asset_id\` int NOT NULL, INDEX \`IDX_uga_grant\` (\`utilizer_grant_id\`), INDEX \`IDX_uga_asset\` (\`asset_id\`), PRIMARY KEY (\`utilizer_grant_id\`, \`asset_id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_assets\` ADD CONSTRAINT \`FK_uga_grant\` FOREIGN KEY (\`utilizer_grant_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant_assets\` ADD CONSTRAINT \`FK_uga_asset\` FOREIGN KEY (\`asset_id\`) REFERENCES \`assets\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await q.query(
      `INSERT INTO \`utilizer_grant_assets\` (\`utilizer_grant_id\`, \`asset_id\`) SELECT \`id\`, \`asset_id_fk\` FROM \`utilizer_grant\` WHERE \`asset_id_fk\` IS NOT NULL`,
    );

    await q.query(`ALTER TABLE \`utilizer_grant\` ADD \`start_date\` date NULL, ADD \`end_date\` date NULL`);
    await q.query(
      `UPDATE \`utilizer_grant\` SET \`end_date\` = DATE(\`expire_date\`), \`update_date\` = \`update_date\` WHERE \`expire_date\` IS NOT NULL AND \`expire_date\` <> \`create_date\``,
    );
    // utilizer_grant non ha FK né indici su asset_id_fk (verificato con
    // SHOW CREATE TABLE): basta il DROP COLUMN.
    await q.query(`ALTER TABLE \`utilizer_grant\` DROP COLUMN \`asset_id_fk\`, DROP COLUMN \`grant_date\`, DROP COLUMN \`expire_date\``);

    await q.query(
      `ALTER TABLE \`utilizer_grant\`
        ADD \`direction\` enum ('ACTIVE','PASSIVE') NOT NULL DEFAULT 'ACTIVE',
        ADD \`kind\` enum ('LEASE','CONCESSION','LOAN_FOR_USE','HOUSING_ASSIGNMENT','LAND_OCCUPATION') NOT NULL DEFAULT 'CONCESSION',
        ADD \`subject\` varchar(500) NULL,
        ADD \`rent_amount\` decimal(12,2) NULL,
        ADD \`rent_period\` enum ('MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','ONE_OFF') NULL,
        ADD \`vat_applicable\` tinyint NOT NULL DEFAULT 0,
        ADD \`tacit_renewal\` tinyint NOT NULL DEFAULT 0,
        ADD \`renewal_months\` int NULL,
        ADD \`notice_months\` int NULL,
        ADD \`status\` enum ('ACTIVE','RETURNED','TERMINATED','DISPUTED') NOT NULL DEFAULT 'ACTIVE',
        ADD \`registration_ref\` varchar(255) NULL,
        ADD \`cadastral_ref\` varchar(255) NULL,
        ADD \`area_sqm\` decimal(10,2) NULL,
        ADD \`department\` varchar(50) NULL,
        ADD \`parent_contract_id\` int NULL,
        ADD \`notes\` text NULL`,
    );
    await q.query(
      `ALTER TABLE \`utilizer_grant\` ADD CONSTRAINT \`FK_ug_parent\` FOREIGN KEY (\`parent_contract_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`utilizer_grant\` DROP FOREIGN KEY \`FK_ug_parent\``);
    await q.query(
      `ALTER TABLE \`utilizer_grant\` DROP COLUMN \`notes\`, DROP COLUMN \`parent_contract_id\`, DROP COLUMN \`department\`, DROP COLUMN \`area_sqm\`, DROP COLUMN \`cadastral_ref\`, DROP COLUMN \`registration_ref\`, DROP COLUMN \`status\`, DROP COLUMN \`notice_months\`, DROP COLUMN \`renewal_months\`, DROP COLUMN \`tacit_renewal\`, DROP COLUMN \`vat_applicable\`, DROP COLUMN \`rent_period\`, DROP COLUMN \`rent_amount\`, DROP COLUMN \`subject\`, DROP COLUMN \`kind\`, DROP COLUMN \`direction\``,
    );
    await q.query(`ALTER TABLE \`utilizer_grant\` ADD \`asset_id_fk\` int NULL, ADD \`grant_date\` timestamp NULL, ADD \`expire_date\` timestamp NULL`);
    // Un contratto con più immobili torna al primo.
    await q.query(
      `UPDATE \`utilizer_grant\` g SET g.\`asset_id_fk\` = (SELECT MIN(a.\`asset_id\`) FROM \`utilizer_grant_assets\` a WHERE a.\`utilizer_grant_id\` = g.\`id\`), g.\`expire_date\` = g.\`end_date\``,
    );
    await q.query(`ALTER TABLE \`utilizer_grant\` DROP COLUMN \`start_date\`, DROP COLUMN \`end_date\``);
    await q.query(`DROP TABLE \`utilizer_grant_assets\``);
    await q.query(`ALTER TABLE \`utilizer\` DROP COLUMN \`contacts\`, DROP COLUMN \`tax_code\``);
  }
}
```

- [ ] **Step 3: Backup e applicazione**

```bash
cd /c/Users/mirko.daddiego/Documents/utenzepa
PW=$(grep '^MYSQL_PASSWORD=' .env | cut -d= -f2-)
docker exec utenzepa-mysql-1 mysqldump -uroot -p"$PW" --single-transaction mydatabase 2>/dev/null > "$SCRATCH/backup-pre-contratti-immobiliari.sql"
cp .audit-w/contratti/1791000000000-RealEstateContracts.ts backend/src/database/migrations/
```

Attendere la ricompilazione del watcher ("Found 0 errors") e verificare:

Run: `docker exec utenzepa-mysql-1 mysql -uroot -p"$PW" mydatabase -e "SELECT name FROM migrations ORDER BY id DESC LIMIT 1; SELECT COUNT(*) FROM utilizer_grant_assets; SELECT COUNT(*) FROM utilizer_grant WHERE end_date IS NOT NULL; SELECT COUNT(*) FROM utilizer_grant WHERE start_date IS NOT NULL;"`
Expected: `RealEstateContracts1791000000000`; join = numero di righe con immobile (480); `end_date` non null = 19; `start_date` non null = 0.

Se il container va in crash-loop con errori di join su `asset_id_fk`, il Task 3 non è ancora fatto: è atteso solo se si avvia prima di compilare i service; in quel caso proseguire subito col Task 3 prima di riverificare.

- [ ] **Step 4: Commit**

```bash
git add backend/src/apis/utilizer-grant/entity/utilizer-grant.entity.ts backend/src/apis/utilizer/entity/utilizer.entity.ts backend/src/apis/asset/entity/asset.entity.ts backend/src/database/migrations/1791000000000-RealEstateContracts.ts
git commit -m "feat(contratti-immobiliari): schema contratto, controparte e immobili molti-a-molti"
```

---

### Task 3: Validazione, DTO e service del contratto

**Files:**
- Create: `backend/src/apis/utilizer-grant/real-estate-contract.validation.ts`
- Test: `backend/src/apis/utilizer-grant/real-estate-contract.validation.spec.ts`
- Modify: `backend/src/apis/utilizer-grant/dto/create-utilizer-grant.dto.ts`, `dto/update-utilizer-grant.dto.ts`, `dto/search-utilizer-grant.dto.ts`
- Modify: `backend/src/apis/utilizer-grant/utilizer-grant.service.ts`, `utilizer-grant.module.ts`
- Test: `backend/src/apis/utilizer-grant/utilizer-grant.service.spec.ts`
- Modify: `backend/src/data-importer/data-importer.service.ts:801-900`

**Interfaces:**
- Consumes: Task 1 (`annualRent`, `effectiveEndDate`, `noticeDeadline`, `displayStatus`, `contractAlerts`, `todayIso`), Task 2 (entity).
- Produces: `validateContract(c: ContractShape): string | null`; `UtilizerGrantService.findAll(filters): Promise<ContractRow[]>`, `summary(): Promise<ContractSummary>`, `create(dto, userId)`, `update(id, dto, userId)`; tipo `ContractRow = UtilizerGrant & { annual_rent: number | null; effective_end_date: string | null; notice_deadline: string | null; computed_status: DisplayStatus }`; `ContractSummary = { notice: number; expiring: number; expired_active: number; without_assets: number; annual_income: number; annual_expense: number }`.

- [ ] **Step 1: Test validazione (falliscono)**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.validation.spec.ts
import { validateContract } from './real-estate-contract.validation';
import { RentPeriod } from './enum/real-estate-contract.enum';

const ok = {
  id: 10,
  start_date: null,
  end_date: null,
  rent_amount: null,
  rent_period: null,
  tacit_renewal: false,
  renewal_months: null,
  notice_months: null,
  parent_contract_id: null,
  parentHasParent: false,
};

describe('validateContract', () => {
  it('accetta un contratto Access senza canone né date', () => {
    expect(validateContract(ok)).toBeNull();
  });

  it('canone e periodicità vanno in coppia', () => {
    expect(validateContract({ ...ok, rent_amount: 100 })).toMatch(/periodicità/);
    expect(validateContract({ ...ok, rent_period: RentPeriod.MONTHLY })).toMatch(/canone/);
  });

  it('rinnovo tacito richiede scadenza, durata rinnovo e preavviso', () => {
    expect(validateContract({ ...ok, tacit_renewal: true })).toMatch(/scadenza/);
    expect(validateContract({ ...ok, tacit_renewal: true, end_date: '2027-01-01', notice_months: 3 })).toMatch(/durata/);
    expect(
      validateContract({ ...ok, tacit_renewal: true, end_date: '2027-01-01', renewal_months: 48 }),
    ).toMatch(/preavviso/);
  });

  it('scadenza non precedente alla decorrenza', () => {
    expect(validateContract({ ...ok, start_date: '2026-01-02', end_date: '2026-01-01' })).toMatch(/decorrenza/);
  });

  it('padre: non sé stesso, un solo livello', () => {
    expect(validateContract({ ...ok, parent_contract_id: 10 })).toMatch(/sé stesso/);
    expect(validateContract({ ...ok, parent_contract_id: 5, parentHasParent: true })).toMatch(/livello/);
  });
});
```

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant/real-estate-contract.validation.spec.ts --maxWorkers=2`
Expected: FAIL, modulo mancante.

- [ ] **Step 2: Implementazione validazione**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.validation.ts
import { RentPeriod } from './enum/real-estate-contract.enum';

export interface ContractShape {
  id: number | null;
  start_date: string | null;
  end_date: string | null;
  rent_amount: number | null;
  rent_period: RentPeriod | null;
  tacit_renewal: boolean;
  renewal_months: number | null;
  notice_months: number | null;
  parent_contract_id: number | null;
  parentHasParent: boolean;
}

// Coerenza del contratto risultante (dopo il merge con il persistito):
// i contratti importati da Access senza canone né date restano validi.
export function validateContract(c: ContractShape): string | null {
  const hasAmount = c.rent_amount !== null && c.rent_amount !== undefined;
  if (hasAmount && !c.rent_period) return 'Indicare la periodicità del canone.';
  if (!hasAmount && c.rent_period) return 'Indicare il canone per la periodicità scelta.';
  if (c.start_date && c.end_date && c.end_date.slice(0, 10) < c.start_date.slice(0, 10)) {
    return 'La scadenza non può precedere la decorrenza.';
  }
  if (c.tacit_renewal) {
    if (!c.end_date) return 'Con il rinnovo tacito serve la scadenza.';
    if (!(Number(c.renewal_months) > 0)) return 'Con il rinnovo tacito serve la durata del rinnovo (mesi).';
    if (c.notice_months === null || c.notice_months === undefined || Number(c.notice_months) < 0) {
      return 'Con il rinnovo tacito serve il preavviso di disdetta (mesi).';
    }
  }
  if (c.parent_contract_id !== null && c.parent_contract_id !== undefined) {
    if (c.id !== null && c.parent_contract_id === c.id) return 'Un contratto non può essere padre di sé stesso.';
    if (c.parentHasParent) return 'Il contratto padre non può avere a sua volta un padre (un solo livello).';
  }
  return null;
}
```

Run lo stesso comando. Expected: PASS.

- [ ] **Step 3: DTO**

`create-utilizer-grant.dto.ts` — rimuovere `grant_date`, `expire_date`, `asset_id_fk`; aggiungere (oltre ai campi invariati `concession_act`, `utilities_to_be_taken_over`, `usage_type`, `utilizer_id_fk`):

```ts
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  asset_ids?: number[];

  @IsOptional()
  @IsDateString({ strict: true })
  start_date?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  end_date?: string | null;

  @IsOptional()
  @IsEnum(ContractDirection)
  direction?: ContractDirection;

  @IsOptional()
  @IsEnum(ContractKind)
  kind?: ContractKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rent_amount?: number | null;

  @IsOptional()
  @IsEnum(RentPeriod)
  rent_period?: RentPeriod | null;

  @IsOptional()
  @IsBoolean()
  vat_applicable?: boolean;

  @IsOptional()
  @IsBoolean()
  tacit_renewal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  renewal_months?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  notice_months?: number | null;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  registration_ref?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  cadastral_ref?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  area_sqm?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  department?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parent_contract_id?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
```

`update-utilizer-grant.dto.ts`: stessi campi, tutti `@IsOptional()`, più `utilizer_id_fk?` opzionale; mantenere i campi tecnici già presenti (`id`, `create_date`, `update_date`, `created_by_user_id`, `updated_by_user_id`, `deleted`).

`search-utilizer-grant.dto.ts`: rimuovere `grant_date`, `expire_date`, `asset_id_fk`; aggiungere `asset_id?` (int, `Transform` come gli altri id), `direction?`, `kind?` (`@IsEnum`), `department?` (string), `computed_status?` (`@IsEnum(DisplayStatus)`), `alert?` (`@IsIn(['notice', 'expiring', 'expired_active', 'without_assets'])`), `q?` (string, ricerca libera).

- [ ] **Step 4: Test service (falliscono)**

```ts
// backend/src/apis/utilizer-grant/utilizer-grant.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { UtilizerGrantService } from './utilizer-grant.service';
import { ContractStatus, DisplayStatus, RentPeriod } from './enum/real-estate-contract.enum';

describe('UtilizerGrantService', () => {
  let service: UtilizerGrantService;
  let qb: Record<string, jest.Mock>;
  let repo: { createQueryBuilder: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let assetRepo: { count: jest.Mock };

  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    status: ContractStatus.ACTIVE,
    end_date: null,
    tacit_renewal: false,
    renewal_months: null,
    notice_months: null,
    rent_amount: '100.00',
    rent_period: RentPeriod.MONTHLY,
    direction: 'ACTIVE',
    assets: [{ id: 3 }],
    ...over,
  });

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
      save: jest.fn(async (d) => ({ id: 99, ...d })),
      find: jest.fn().mockResolvedValue([]),
    };
    assetRepo = { count: jest.fn().mockResolvedValue(1) };
    service = new UtilizerGrantService(repo as never, assetRepo as never);
    jest.spyOn(service as never, 'today' as never).mockReturnValue('2026-10-02' as never);
  });

  it('aggiunge canone annuo e stato mostrato a ogni riga', async () => {
    qb.getMany.mockResolvedValue([row({ end_date: '2025-01-01' })]);
    const [r] = await service.findAll({});
    expect(r.annual_rent).toBe(1200);
    expect(r.computed_status).toBe(DisplayStatus.EXPIRED);
  });

  it('filtro alert=expired_active tiene solo gli scaduti dichiarati attivi', async () => {
    qb.getMany.mockResolvedValue([
      row({ id: 1, end_date: '2025-01-01' }),
      row({ id: 2, end_date: '2025-01-01', status: ContractStatus.RETURNED }),
      row({ id: 3, end_date: '2030-01-01' }),
    ]);
    const rows = await service.findAll({ alert: 'expired_active' });
    expect(rows.map((r) => r.id)).toEqual([1]);
  });

  it('filtro alert=without_assets', async () => {
    qb.getMany.mockResolvedValue([row({ id: 1, assets: [] }), row({ id: 2 })]);
    expect((await service.findAll({ alert: 'without_assets' })).map((r) => r.id)).toEqual([1]);
  });

  it('summary: conteggi e totali solo su contratti attivi o in scadenza', async () => {
    qb.getMany.mockResolvedValue([
      row({ id: 1 }),
      row({ id: 2, direction: 'PASSIVE', rent_amount: '50.00' }),
      row({ id: 3, end_date: '2025-01-01' }),
      row({ id: 4, assets: [] }),
    ]);
    const s = await service.summary();
    expect(s.expired_active).toBe(1);
    expect(s.without_assets).toBe(1);
    expect(s.annual_income).toBe(2400);
    expect(s.annual_expense).toBe(600);
  });

  it('rifiuta un contratto con canone senza periodicità', async () => {
    await expect(service.create({ utilizer_id_fk: 1, rent_amount: 10 } as never, 3)).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rifiuta immobili inesistenti', async () => {
    assetRepo.count.mockResolvedValue(0);
    await expect(service.create({ utilizer_id_fk: 1, asset_ids: [7] } as never, 3)).rejects.toThrow(/immobili/);
  });

  it('crea con immobili collegati', async () => {
    repo.findOne.mockResolvedValue({ id: 99, assets: [{ id: 7 }] });
    await service.create({ utilizer_id_fk: 1, asset_ids: [7] } as never, 3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ utilizer_id_fk: 1, assets: [{ id: 7 }], created_by_user_id: 3 }),
    );
  });
});
```

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant/utilizer-grant.service.spec.ts --maxWorkers=2`
Expected: FAIL (costruttore a due argomenti, `summary`, campi calcolati inesistenti).

- [ ] **Step 5: Service**

```ts
// backend/src/apis/utilizer-grant/utilizer-grant.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BaseService, toFindOptionsRelations } from '@apis/shared/base.service';
import { AuditAction } from '@apis/audit-log/entity/audit-log.entity';
import { Asset } from '@apis/asset/entity/asset.entity';
import { UtilizerGrant } from './entity/utilizer-grant.entity';
import { CreateUtilizerGrantDto } from './dto/create-utilizer-grant.dto';
import { UpdateUtilizerGrantDto } from './dto/update-utilizer-grant.dto';
import { SearchUtilizerGrantDto } from './dto/search-utilizer-grant.dto';
import { ContractDirection, DisplayStatus } from './enum/real-estate-contract.enum';
import {
  annualRent,
  CalcInput,
  contractAlerts,
  displayStatus,
  effectiveEndDate,
  noticeDeadline,
  todayIso,
} from './real-estate-contract.calc';
import { validateContract } from './real-estate-contract.validation';

export type ContractRow = UtilizerGrant & {
  annual_rent: number | null;
  effective_end_date: string | null;
  notice_deadline: string | null;
  computed_status: DisplayStatus;
};

export interface ContractSummary {
  notice: number;
  expiring: number;
  expired_active: number;
  without_assets: number;
  annual_income: number;
  annual_expense: number;
}

const FILTERS_HANDLED_HERE = ['deleted', 'asset_id', 'alert', 'computed_status', 'q'];

@Injectable()
export class UtilizerGrantService extends BaseService<UtilizerGrant, CreateUtilizerGrantDto, UpdateUtilizerGrantDto> {
  protected readonly entityName = 'utilizer_grant';
  protected readonly relations = ['assets', 'utilizer', 'parent', 'parent.utilizer', 'children', 'children.utilizer', 'created_by', 'updated_by'];

  constructor(
    @InjectRepository(UtilizerGrant)
    protected readonly repo: Repository<UtilizerGrant>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
  ) {
    super();
  }

  // Isolato per i test.
  protected today(): string {
    return todayIso();
  }

  async findAll(filters: SearchUtilizerGrantDto = {}): Promise<ContractRow[]> {
    const qb = this.repo.createQueryBuilder('UtilizerGrant');
    qb.leftJoinAndSelect('UtilizerGrant.assets', 'asset', 'asset.deleted = 0');
    qb.leftJoinAndSelect('UtilizerGrant.utilizer', 'utilizer', 'utilizer.deleted = 0');
    qb.leftJoinAndSelect('UtilizerGrant.parent', 'parent', 'parent.deleted = 0');
    qb.where('UtilizerGrant.deleted = :deleted', { deleted: filters.deleted ? 1 : 0 });
    if (filters.asset_id) {
      qb.andWhere(
        'UtilizerGrant.id IN (SELECT uga.utilizer_grant_id FROM utilizer_grant_assets uga WHERE uga.asset_id = :fAsset)',
        { fAsset: filters.asset_id },
      );
    }
    if (filters.q) {
      qb.andWhere(
        '(utilizer.name LIKE :q OR UtilizerGrant.subject LIKE :q OR UtilizerGrant.concession_act LIKE :q OR UtilizerGrant.registration_ref LIKE :q OR asset.asset_name LIKE :q)',
        { q: `%${filters.q}%` },
      );
    }
    this.applyFilters(qb, filters, 'UtilizerGrant', FILTERS_HANDLED_HERE);
    const today = this.today();
    let rows = (await qb.orderBy('UtilizerGrant.id', 'ASC').getMany()).map((g) => this.toRow(g, today));
    if (filters.computed_status) rows = rows.filter((r) => r.computed_status === filters.computed_status);
    if (filters.alert) {
      rows = rows.filter((r) => {
        if (filters.alert === 'without_assets') return (r.assets ?? []).length === 0;
        const a = contractAlerts(this.calcInput(r), today);
        return filters.alert === 'notice' ? a.notice : filters.alert === 'expiring' ? a.expiring : a.expiredActive;
      });
    }
    return rows;
  }

  async summary(): Promise<ContractSummary> {
    const rows = await this.findAll({});
    const today = this.today();
    const s: ContractSummary = { notice: 0, expiring: 0, expired_active: 0, without_assets: 0, annual_income: 0, annual_expense: 0 };
    for (const r of rows) {
      const a = contractAlerts(this.calcInput(r), today);
      if (a.notice) s.notice++;
      if (a.expiring) s.expiring++;
      if (a.expiredActive) s.expired_active++;
      if ((r.assets ?? []).length === 0) s.without_assets++;
      if (r.annual_rent && [DisplayStatus.ACTIVE, DisplayStatus.EXPIRING].includes(r.computed_status)) {
        if (r.direction === ContractDirection.PASSIVE) s.annual_expense += r.annual_rent;
        else s.annual_income += r.annual_rent;
      }
    }
    s.annual_income = Math.round(s.annual_income * 100) / 100;
    s.annual_expense = Math.round(s.annual_expense * 100) / 100;
    return s;
  }

  async findOne(id: number): Promise<ContractRow | null> {
    const g = await this.repo.findOne({ where: { id }, relations: toFindOptionsRelations<UtilizerGrant>(this.relations) });
    return g ? this.toRow(g, this.today()) : null;
  }

  async create(dto: CreateUtilizerGrantDto, userId?: number): Promise<ContractRow> {
    const { asset_ids, ...rest } = dto;
    await this.assertValid({ ...rest }, null);
    const assets = await this.resolveAssets(asset_ids ?? []);
    const entity = this.repo.create({
      ...rest,
      assets,
      ...(userId !== undefined && { created_by_user_id: userId, updated_by_user_id: userId }),
    } as never);
    let saved: UtilizerGrant;
    try {
      saved = (await this.repo.save(entity)) as unknown as UtilizerGrant;
    } catch (error) {
      this.manageErrors(error, 'Errore durante la creazione del contratto');
    }
    await this.recordAudit(AuditAction.CREATE, saved.id, userId ?? saved.updated_by_user_id, []);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateUtilizerGrantDto, userId?: number): Promise<ContractRow> {
    const { asset_ids, ...rest } = dto;
    const current = await this.repo.findOne({ where: { id, deleted: false } });
    if (!current) throw new BadRequestException('Contratto non trovato');
    await this.assertValid({ ...current, ...rest }, id);
    await super.update(id, rest as UpdateUtilizerGrantDto, userId);
    if (asset_ids !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { assets: true } });
      entity.assets = await this.resolveAssets(asset_ids);
      await this.repo.save(entity);
    }
    return this.findOne(id);
  }

  // BaseService.remove usa this.findOne, che qui restituisce la riga con i
  // campi calcolati e le relazioni: salvarla persisterebbe parent/children.
  async remove(id: number, updatedByUserId: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new BadRequestException('Contratto non trovato');
    entity.deleted = true;
    entity.updated_by_user_id = updatedByUserId;
    await this.repo.save(entity);
    await this.recordAudit(AuditAction.DELETE, id, updatedByUserId, []);
  }

  private async assertValid(c: Record<string, unknown>, id: number | null): Promise<void> {
    const parentId = (c.parent_contract_id as number | null | undefined) ?? null;
    const parent = parentId ? await this.repo.findOne({ where: { id: parentId } }) : null;
    if (parentId && !parent) throw new BadRequestException('Contratto padre non trovato');
    const error = validateContract({
      id,
      start_date: (c.start_date as string) ?? null,
      end_date: (c.end_date as string) ?? null,
      rent_amount: c.rent_amount === null || c.rent_amount === undefined ? null : Number(c.rent_amount),
      rent_period: (c.rent_period as never) ?? null,
      tacit_renewal: !!c.tacit_renewal,
      renewal_months: (c.renewal_months as number) ?? null,
      notice_months: (c.notice_months as number) ?? null,
      parent_contract_id: parentId,
      parentHasParent: !!parent?.parent_contract_id,
    });
    if (error) throw new BadRequestException(error);
  }

  private async resolveAssets(assetIds: number[]): Promise<Asset[]> {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) return [];
    const found = await this.assetRepo.count({ where: { id: In(ids), deleted: false } });
    if (found !== ids.length) throw new BadRequestException('Uno o più immobili non esistono o sono stati eliminati.');
    return ids.map((assetId) => ({ id: assetId }) as Asset);
  }

  private calcInput(g: UtilizerGrant): CalcInput {
    return {
      end_date: g.end_date ?? null,
      tacit_renewal: !!g.tacit_renewal,
      renewal_months: g.renewal_months ?? null,
      notice_months: g.notice_months ?? null,
      status: g.status,
    };
  }

  private toRow(g: UtilizerGrant, today: string): ContractRow {
    const c = this.calcInput(g);
    return {
      ...g,
      rent_amount: g.rent_amount === null || g.rent_amount === undefined ? null : Number(g.rent_amount),
      annual_rent: annualRent(g.rent_amount, g.rent_period),
      effective_end_date: effectiveEndDate(c, today),
      notice_deadline: noticeDeadline(c, today),
      computed_status: displayStatus(c, today),
    } as ContractRow;
  }
}
```

In `utilizer-grant.module.ts`: `TypeOrmModule.forFeature([UtilizerGrant, Asset])`.

Nel controller aggiungere, **prima** di `@Patch(':id')`:

```ts
  @Get('summary')
  summary(): Promise<ContractSummary> {
    return this.service.summary();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number): Promise<ContractRow | null> {
    return this.service.findOne(id);
  }
```

e correggere `remove` per usare l'utente corrente: `remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser) { return this.service.remove(id, user.id); }`.

- [ ] **Step 6: Importer Access**

In `data-importer.service.ts` (`importUtilizerGrants`): sostituire `asset_id_fk` con `assets: [{ id: asset_id_fk }]`, `expire_date` con `end_date: expire_date ? expire_date.toISOString().slice(0, 10) : null`, e il controllo duplicati con una query sulla join:

```ts
      const existing = await this.utilizerGrantRepo
        .createQueryBuilder('g')
        .innerJoin('g.assets', 'a', 'a.id = :assetId', { assetId: asset_id_fk })
        .where('g.utilizer_id_fk = :uid AND g.deleted = 0', { uid: utilizer_id_fk })
        .getOne();
```

Aggiungere in testa al metodo un commento: le etichette tecniche (pubblica illuminazione, cabine, "VERIFICARE"…) non sono contratti — vedi `.audit-w/contratti/cleanup_grants.py`; rieseguire la pulizia dopo un reimport.

- [ ] **Step 7: Test verdi, type-check**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant src/data-importer --maxWorkers=2`
Expected: PASS.
Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec tsc --noEmit -p tsconfig.json`
Expected: nessun errore. Se `assets.service.ts`/`utility.service.ts` segnalano errori sulla relazione `utilizerGrants`, i `leftJoinAndSelect('assets.utilizerGrants', …)` restano validi con la ManyToMany: correggere solo eventuali riferimenti a `asset_id_fk`/`grant_date`/`expire_date`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/apis/utilizer-grant backend/src/data-importer/data-importer.service.ts
git commit -m "feat(contratti-immobiliari): validazioni, filtri avvisi, riepilogo e immobili multipli"
```

---

### Task 4: Controparte e oscuramento per il ruolo Lettore

**Files:**
- Create: `backend/src/apis/utilizer-grant/real-estate-contract.privacy.ts`
- Test: `backend/src/apis/utilizer-grant/real-estate-contract.privacy.spec.ts`
- Modify: `backend/src/apis/utilizer-grant/utilizer-grant.controller.ts`, `backend/src/apis/asset/assets.controller.ts:28-47`, `backend/src/apis/utility/utility.controller.ts:29-45`, `backend/src/apis/utilizer/utilizer.controller.ts`
- Modify: `backend/src/apis/utilizer/dto/create-utilizer.dto.ts`, `dto/update-utilizer.dto.ts`

**Interfaces:**
- Consumes: Task 3 (`ContractRow`).
- Produces: `maskContract<T>(grant: T, role: string): T`; `maskAssetGrants<T extends { utilizerGrants?: unknown[] }>(asset: T, role: string): T`; `maskUtilizer<T>(u: T, role): T`; `RESERVED_ASSIGNEE = 'Assegnatario riservato'`.

- [ ] **Step 1: Test (falliscono)**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.privacy.spec.ts
import { maskAssetGrants, maskContract, maskUtilizer, RESERVED_ASSIGNEE } from './real-estate-contract.privacy';
import { ContractKind } from './enum/real-estate-contract.enum';

const grant = (kind: ContractKind) => ({
  id: 1,
  kind,
  utilizer: { id: 2, name: 'Mario Rossi', tax_code: 'RSSMRA80A01H501U', contacts: '333' },
});

describe('privacy contratti', () => {
  it('Admin e Operatore vedono tutto', () => {
    expect(maskContract(grant(ContractKind.HOUSING_ASSIGNMENT), 'Operatore').utilizer.name).toBe('Mario Rossi');
  });

  it('Lettore: codice fiscale e contatti sempre nascosti', () => {
    const m = maskContract(grant(ContractKind.LEASE), 'Lettore');
    expect(m.utilizer).toEqual({ id: 2, name: 'Mario Rossi', tax_code: null, contacts: null });
  });

  it('Lettore: nome nascosto sulle assegnazioni di alloggio', () => {
    expect(maskContract(grant(ContractKind.HOUSING_ASSIGNMENT), 'Lettore').utilizer.name).toBe(RESERVED_ASSIGNEE);
  });

  it('ruolo assente trattato come Lettore', () => {
    expect(maskContract(grant(ContractKind.LEASE), undefined).utilizer.tax_code).toBeNull();
  });

  it('immobile con contratti annidati', () => {
    const asset = { id: 9, utilizerGrants: [grant(ContractKind.HOUSING_ASSIGNMENT)] };
    expect(maskAssetGrants(asset, 'Lettore').utilizerGrants[0].utilizer.name).toBe(RESERVED_ASSIGNEE);
  });

  it('anagrafica controparte', () => {
    expect(maskUtilizer({ id: 2, name: 'X', tax_code: 'A', contacts: 'B' }, 'Lettore')).toEqual({
      id: 2,
      name: 'X',
      tax_code: null,
      contacts: null,
    });
  });

  it('non modifica l’oggetto originale', () => {
    const g = grant(ContractKind.LEASE);
    maskContract(g, 'Lettore');
    expect(g.utilizer.tax_code).toBe('RSSMRA80A01H501U');
  });
});
```

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant/real-estate-contract.privacy.spec.ts --maxWorkers=2`
Expected: FAIL, modulo mancante.

- [ ] **Step 2: Implementazione**

```ts
// backend/src/apis/utilizer-grant/real-estate-contract.privacy.ts
import { ContractKind } from './enum/real-estate-contract.enum';

export const RESERVED_ASSIGNEE = 'Assegnatario riservato';
const FULL_ACCESS = new Set(['Admin', 'Operatore']);

interface UtilizerLike {
  name?: string;
  tax_code?: string | null;
  contacts?: string | null;
}

export function maskUtilizer<T extends UtilizerLike>(u: T, role: string | undefined): T {
  if (!u || FULL_ACCESS.has(role ?? '')) return u;
  return { ...u, tax_code: null, contacts: null };
}

// Dati personali della controparte oscurati lato backend per il Lettore:
// codice fiscale e contatti sempre, il nome sulle assegnazioni di alloggio
// (persone in situazione di disagio).
export function maskContract<T extends { kind?: ContractKind; utilizer?: UtilizerLike }>(grant: T, role: string | undefined): T {
  if (!grant || FULL_ACCESS.has(role ?? '') || !grant.utilizer) return grant;
  const utilizer = maskUtilizer(grant.utilizer, role);
  if (grant.kind === ContractKind.HOUSING_ASSIGNMENT) utilizer.name = RESERVED_ASSIGNEE;
  return { ...grant, utilizer };
}

export function maskAssetGrants<T extends { utilizerGrants?: unknown[] }>(asset: T, role: string | undefined): T {
  if (!asset?.utilizerGrants || FULL_ACCESS.has(role ?? '')) return asset;
  return { ...asset, utilizerGrants: asset.utilizerGrants.map((g) => maskContract(g as never, role)) };
}
```

Run lo stesso comando. Expected: PASS.

- [ ] **Step 3: Applicazione nei controller**

`utilizer-grant.controller.ts`:

```ts
  @Get()
  async getAll(@Query() filters: SearchUtilizerGrantDto, @CurrentUser() user: ICurrentUser): Promise<ContractRow[]> {
    return (await this.service.findAll(filters)).map((g) => maskContract(g, user?.role));
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<ContractRow | null> {
    const g = await this.service.findOne(id);
    return g ? { ...maskContract(g, user?.role), children: (g.children ?? []).map((c) => maskContract(c, user?.role)) } : null;
  }
```

`assets.controller.ts` (`getAll` e `getOne`) e `utility.controller.ts` (`getAll`, `getOne`, `safeguard`): aggiungere `@CurrentUser() user: ICurrentUser` e mappare il risultato. Per le utenze i contratti sono annidati negli immobili:

```ts
const maskUtility = <T extends { assets?: { utilizerGrants?: unknown[] }[] }>(u: T, role?: string): T =>
  u?.assets ? { ...u, assets: u.assets.map((a) => maskAssetGrants(a, role)) } : u;
```

Definire `maskUtility` in `real-estate-contract.privacy.ts` (esportata) e aggiungerne un test:

```ts
  it('utenza con immobili e contratti annidati', () => {
    const utility = { id: 1, assets: [{ id: 9, utilizerGrants: [grant(ContractKind.HOUSING_ASSIGNMENT)] }] };
    expect(maskUtility(utility, 'Lettore').assets[0].utilizerGrants[0].utilizer.name).toBe(RESERVED_ASSIGNEE);
  });
```

`utilizer.controller.ts`: il `GET` mappa con `maskUtilizer(u, user?.role)`. DTO `create-utilizer.dto.ts`/`update-utilizer.dto.ts`: aggiungere

```ts
  @IsOptional()
  @IsString()
  @MaxLength(16)
  tax_code?: string | null;

  @IsOptional()
  @IsString()
  contacts?: string | null;
```

- [ ] **Step 4: Test e commit**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant src/apis/asset src/apis/utility src/apis/utilizer --maxWorkers=2`
Expected: PASS. Se gli spec esistenti dei controller asset/utility istanziano il controller senza utente, passare `{ role: 'Admin' }` nelle chiamate dei test.

```bash
git add backend/src/apis/utilizer-grant backend/src/apis/asset/assets.controller.ts backend/src/apis/utility/utility.controller.ts backend/src/apis/utilizer
git commit -m "feat(contratti-immobiliari): controparte con codice fiscale e contatti, oscuramento per Lettore"
```

---

### Task 5: Anomalia "contratti immobiliari senza immobile"

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Produces: `Anomalies.real_estate_contracts_without_assets: AnomalyList<{ id: number; counterparty: string | null; subject: string | null }>`.

- [ ] **Step 1: Test (fallisce)**

Leggere lo spec esistente per il modo in cui `dataSource.query` è mockato in sequenza, poi aggiungere un test:

```ts
  it('elenca i contratti immobiliari senza immobile', async () => {
    // Le 5 query esistenti restano in testa, la nuova è la sesta.
    query.mockResolvedValueOnce([]) /* contratti senza CIG */
      .mockResolvedValueOnce([]) /* utenze senza contratto */
      .mockResolvedValueOnce([]) /* utenze contratto senza CIG */
      .mockResolvedValueOnce([]) /* contratti sovrapposti */
      .mockResolvedValueOnce([]) /* CIG duplicati */
      .mockResolvedValueOnce([{ id: 4, counterparty: 'SPRAR', subject: null }]);
    const a = await service.getAnomalies();
    expect(a.real_estate_contracts_without_assets).toEqual({ count: 1, items: [{ id: 4, counterparty: 'SPRAR', subject: null }] });
  });
```

Lo spec esistente usa `query: jest.Mock` e 5 query in sequenza: se il numero cambia, aggiornare i `mockResolvedValueOnce` del nuovo test e di quelli esistenti (aggiungere un `.mockResolvedValueOnce([])` finale ai test esistenti).

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: FAIL, proprietà assente.

- [ ] **Step 2: Implementazione**

In fondo a `getAnomalies()`, prima del `return`:

```ts
    const contractsWithoutAssets: { id: number; counterparty: string | null; subject: string | null }[] =
      await this.dataSource.query(
        `SELECT g.id, u.name AS counterparty, g.subject
         FROM utilizer_grant g LEFT JOIN utilizer u ON u.id = g.utilizer_id_fk
         WHERE g.deleted = 0
           AND NOT EXISTS (SELECT 1 FROM utilizer_grant_assets a JOIN assets s ON s.id = a.asset_id AND s.deleted = 0
                           WHERE a.utilizer_grant_id = g.id)
         ORDER BY u.name, g.id`,
      );
```

e nel risultato `real_estate_contracts_without_assets: list(contractsWithoutAssets)`; aggiungere il campo all'interfaccia `Anomalies`.

Nota privacy: il nome della controparte qui arriva anche al Lettore. Nel controller anomalie, se `user.role` non è Admin/Operatore, sostituire `counterparty` con `null` (aggiungere `@CurrentUser()` al `GET`).

- [ ] **Step 3: Test e commit**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2`
Expected: PASS.

```bash
git add backend/src/apis/anomalies
git commit -m "feat(contratti-immobiliari): anomalia contratti senza immobile"
```

---

### Task 6: Frontend: modello, service, elenco

**Files:**
- Create: `frontend/src/app/pages/utilizer-grant/real-estate-contract.model.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/entity/utilizer-grant.entity.ts`, `entity/utilizer-grant.interface.ts`, `utilizer-grant.service.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.{ts,html}`, `search-utilizer-grant.component.ts`, `utilizer-grant-filter-dialog.component.ts`, `utilizer-grant.component.{ts,html}`
- Modify: `frontend/src/app/comp/sidebar/sidebar.component.ts`

**Interfaces:**
- Consumes: API del Task 3/4 (`ContractRow`, `GET utilizer-grant/summary`, filtri `direction|kind|computed_status|alert|department|asset_id|q`).
- Produces: classe `UtilizerGrant` frontend con i campi della spec + calcolati; `KIND_LABEL`, `DIRECTION_LABEL`, `PERIOD_LABEL`, `STATUS_LABEL`, `statusBadge(s)`, `formatEuro(n)`; `UtilizerGrantService.summary(): Observable<ContractSummary>`.

- [ ] **Step 1: Modello**

```ts
// frontend/src/app/pages/utilizer-grant/real-estate-contract.model.ts
export type ContractDirection = 'ACTIVE' | 'PASSIVE';
export type ContractKind = 'LEASE' | 'CONCESSION' | 'LOAN_FOR_USE' | 'HOUSING_ASSIGNMENT' | 'LAND_OCCUPATION';
export type RentPeriod = 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | 'ONE_OFF';
export type ContractStatus = 'ACTIVE' | 'RETURNED' | 'TERMINATED' | 'DISPUTED';
export type DisplayStatus = ContractStatus | 'EXPIRING' | 'EXPIRED';

export const DIRECTION_LABEL: Record<ContractDirection, string> = {ACTIVE: 'Entrata', PASSIVE: 'Uscita'};
export const KIND_LABEL: Record<ContractKind, string> = {
  LEASE: 'Locazione', CONCESSION: 'Concessione', LOAN_FOR_USE: 'Comodato',
  HOUSING_ASSIGNMENT: 'Assegnazione alloggio', LAND_OCCUPATION: 'Occupazione suolo',
};
export const PERIOD_LABEL: Record<RentPeriod, string> = {
  MONTHLY: 'Mensile', BIMONTHLY: 'Bimestrale', QUARTERLY: 'Trimestrale',
  SEMIANNUAL: 'Semestrale', ANNUAL: 'Annuale', ONE_OFF: 'Una tantum',
};
export const STATUS_LABEL: Record<DisplayStatus, string> = {
  ACTIVE: 'Attivo', EXPIRING: 'In scadenza', EXPIRED: 'Scaduto',
  RETURNED: 'Restituito', TERMINATED: 'Cessato', DISPUTED: 'In contenzioso',
};

export function statusBadge(s: DisplayStatus): {bg: string; fg: string} {
  switch (s) {
    case 'ACTIVE': return {bg: '#dcfce7', fg: '#166534'};
    case 'EXPIRING': return {bg: '#fef3c7', fg: '#92400e'};
    case 'EXPIRED': return {bg: '#fee2e2', fg: '#991b1b'};
    case 'DISPUTED': return {bg: '#fde68a', fg: '#78350f'};
    default: return {bg: '#f3f4f6', fg: '#374151'};
  }
}

export const formatEuro = (v: number | null | undefined): string =>
  v === null || v === undefined ? '' : Number(v).toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});

export const formatDateIt = (iso: string | null | undefined): string =>
  iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';

export interface ContractSummary {
  notice: number;
  expiring: number;
  expired_active: number;
  without_assets: number;
  annual_income: number;
  annual_expense: number;
}

export type ContractAlert = 'notice' | 'expiring' | 'expired_active' | 'without_assets';
```

- [ ] **Step 2: Entity e service**

`entity/utilizer-grant.entity.ts`: sostituire `grant_date`, `expire_date`, `asset_id_fk`, `asset` con:

```ts
  start_date?: string | null;
  end_date?: string | null;
  asset_ids?: number[];
  direction?: ContractDirection;
  kind?: ContractKind;
  subject?: string | null;
  rent_amount?: number | null;
  rent_period?: RentPeriod | null;
  vat_applicable?: boolean;
  tacit_renewal?: boolean;
  renewal_months?: number | null;
  notice_months?: number | null;
  status?: ContractStatus;
  registration_ref?: string | null;
  cadastral_ref?: string | null;
  area_sqm?: number | null;
  department?: string | null;
  parent_contract_id?: number | null;
  notes?: string | null;

  @Exclude({toPlainOnly: true}) @Type(() => Asset) assets?: Asset[];
  @Exclude({toPlainOnly: true}) parent?: UtilizerGrant | null;
  @Exclude({toPlainOnly: true}) children?: UtilizerGrant[];
  @Exclude({toPlainOnly: true}) annual_rent?: number | null;
  @Exclude({toPlainOnly: true}) effective_end_date?: string | null;
  @Exclude({toPlainOnly: true}) notice_deadline?: string | null;
  @Exclude({toPlainOnly: true}) computed_status?: DisplayStatus;
```

In `create()` default: `direction: 'ACTIVE', kind: 'CONCESSION', status: 'ACTIVE', tacit_renewal: false, vat_applicable: false, asset_ids: []`. Aggiornare `utilizer-grant.interface.ts` con gli stessi campi.

`utilizer-grant.service.ts`: aggiungere

```ts
  summary(): Observable<ContractSummary> {
    return this.http.get<ContractSummary>(`${this.BASE_URL}/summary`, {headers: this.getAuthHeaders()});
  }
```

- [ ] **Step 3: Elenco**

`data-table-utilizer-grant.component.ts`: passare al pattern Contratti (colonne selezionabili, `STORAGE_KEY = 'columns:real-estate-contracts'`, `exportCellValue`). Colonne:

```ts
  readonly allColumns: IColumnDef[] = [
    {field: 'id', header: 'ID', minWidth: '60px'},
    {field: 'direction', header: 'Direzione', minWidth: '90px'},
    {field: 'kind', header: 'Tipo', minWidth: '130px'},
    {field: 'utilizer', header: 'Controparte', minWidth: '180px'},
    {field: 'assets', header: 'Immobili', minWidth: '180px'},
    {field: 'subject', header: 'Oggetto', minWidth: '200px'},
    {field: 'annual_rent', header: 'Canone annuo', minWidth: '120px'},
    {field: 'effective_end_date', header: 'Scadenza', minWidth: '110px'},
    {field: 'notice_deadline', header: 'Disdetta entro', minWidth: '110px'},
    {field: 'computed_status', header: 'Stato', minWidth: '110px'},
    {field: 'department', header: 'Settore', minWidth: '90px'},
    {field: 'concession_act', header: 'Atto', minWidth: '180px'},
    {field: 'registration_ref', header: 'Registrazione', minWidth: '140px'},
    {field: 'cadastral_ref', header: 'Catasto', minWidth: '140px'},
    {field: 'utilities_to_be_taken_over', header: 'Utenze da volturare', minWidth: '110px'},
  ];
  private readonly defaultVisibleFields = new Set([
    'direction', 'kind', 'utilizer', 'assets', 'subject', 'annual_rent', 'effective_end_date', 'notice_deadline', 'computed_status',
  ]);
```

Celle nel template (`data-table-utilizer-grant.component.html`), una `ng-container matColumnDef` per colonna; quelle non banali:

```html
<ng-container matColumnDef="direction">
  <th mat-header-cell *matHeaderCellDef mat-sort-header>Direzione</th>
  <td mat-cell *matCellDef="let item">
    <span class="badge" [class.severity-success]="item.direction === 'ACTIVE'" [class.severity-warn]="item.direction === 'PASSIVE'">
      {{ directionLabel[item.direction] }}
    </span>
  </td>
</ng-container>
<ng-container matColumnDef="assets">
  <th mat-header-cell *matHeaderCellDef>Immobili</th>
  <td mat-cell *matCellDef="let item">
    @if ((item.assets ?? []).length === 0) { <span style="color:#b91c1c;">nessuno</span> }
    @else { {{ assetNames(item) }} }
  </td>
</ng-container>
<ng-container matColumnDef="computed_status">
  <th mat-header-cell *matHeaderCellDef mat-sort-header>Stato</th>
  <td mat-cell *matCellDef="let item">
    @let b = badge(item.computed_status);
    <span [style.background]="b.bg" [style.color]="b.fg" style="border-radius:10px;padding:1px 8px;font-size:0.75rem;">
      {{ statusLabel[item.computed_status] }}
    </span>
  </td>
</ng-container>
```

con nel componente `assetNames(g) = (g.assets ?? []).map(a => a.asset_name).join(', ')`, `badge = statusBadge`, `statusLabel = STATUS_LABEL`, `directionLabel = DIRECTION_LABEL`, celle `annual_rent` con `formatEuro`, date con `formatDateIt`. `entityLabel()` → `'contratto immobiliare'`, testi dei dialog di conferma "contratto immobiliare".

`utilizer-grant.component.{ts,html}`: titolo "Contratti immobiliari", sottotitolo "Locazioni, concessioni, comodati e assegnazioni degli immobili comunali, attivi e passivi". Sopra la tabella i totali calcolati sui dati filtrati:

```ts
  totals(): {income: number; expense: number} {
    return this.list.reduce((t, g) => {
      const live = g.computed_status === 'ACTIVE' || g.computed_status === 'EXPIRING';
      if (!live || !g.annual_rent) return t;
      if (g.direction === 'PASSIVE') t.expense += g.annual_rent; else t.income += g.annual_rent;
      return t;
    }, {income: 0, expense: 0});
  }
```

```html
@let t = totals();
<div style="display:flex; gap:1.5rem; margin-top:0.75rem; color:#374151;">
  <span>Entrate annue: <strong>{{ euro(t.income) }}</strong></span>
  <span>Uscite annue: <strong>{{ euro(t.expense) }}</strong></span>
  <span>Saldo: <strong>{{ euro(t.income - t.expense) }}</strong></span>
</div>
```

`ngOnInit` legge `?alert=` e `?selectedId=` come `ContractsComponent` (stesso schema `route.queryParams`), imposta `lastFilters = {alert}` e mostra il toast "Filtro applicato".

`search-utilizer-grant.component.ts`: controlli `q`, `direction`, `kind`, `computed_status`, `alert`, `department`, `asset_id`. `utilizer-grant-filter-dialog.component.ts`: select per direzione, tipo, stato mostrato (`STATUS_LABEL`), avviso (`notice` "Disdetta entro 60 giorni", `expiring` "In scadenza", `expired_active` "Scaduti ancora attivi", `without_assets` "Senza immobile"), settore (testo), immobile (`app-filterable-select` sugli immobili), e `maxWidth` uguale a `width` (vedi CLAUDE.md, clamp MDC a 560px).

`sidebar.component.ts`: voce `{label: 'Contratti immobiliari', icon: 'real_estate_agent', route: '/utilizer-grant'}` al posto di "Concessioni"; nelle Impostazioni `Utilizzatori` → `Controparti`.

- [ ] **Step 4: Build**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-frontend-1 sh -c 'cd /app; npx ng build --configuration development --output-path /tmp/ngcheck 2>&1 | grep -E "ERROR|error TS|NG[0-9]" ; rm -rf /tmp/ngcheck'`
Expected: nessuna riga `ERROR`/`error TS` (il warning NG8113 su `FormatAmountPipe` è preesistente).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/utilizer-grant frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(contratti-immobiliari): elenco con stato, scadenze, avvisi e totali"
```

---

### Task 7: Frontend: dialog contratto e controparti

**Files:**
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.{ts,html}`
- Modify: `frontend/src/app/pages/utilizer/` (dialog, tabella, entity: campi `tax_code`, `contacts`; titoli "Controparti"/"Controparte")

**Interfaces:**
- Consumes: Task 6 (modello, entity), `MultiSelectComponent` (`frontend/src/app/core/components/multi-select.component.ts`), `EntityHistoryComponent`, `toIsoDate` (`frontend/src/app/pages/utilities/consumptions/consumption.model.ts:82`).
- Produces: dialog che chiude con `UtilizerGrant` (pattern `EditDialogData`, nessun salvataggio interno).

- [ ] **Step 1: Form**

```ts
  private readonly item = this.data.item;
  private toDate = (iso?: string | null): Date | null => {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  form = this.fb.group({
    direction: [this.item.direction ?? 'ACTIVE', Validators.required],
    kind: [this.item.kind ?? 'CONCESSION', Validators.required],
    status: [this.item.status ?? 'ACTIVE', Validators.required],
    utilizer_id_fk: [this.item.utilizer_id_fk ?? null, Validators.required],
    subject: [this.item.subject ?? ''],
    department: [this.item.department ?? ''],
    concession_act: [this.item.concession_act ?? ''],
    usage_type: [this.item.usage_type ?? ''],
    rent_amount: [this.item.rent_amount ?? null as number | null, Validators.min(0)],
    rent_period: [this.item.rent_period ?? null as RentPeriod | null],
    vat_applicable: [this.item.vat_applicable ?? false],
    start_date: [this.toDate(this.item.start_date)],
    end_date: [this.toDate(this.item.end_date)],
    tacit_renewal: [this.item.tacit_renewal ?? false],
    renewal_months: [this.item.renewal_months ?? null as number | null],
    notice_months: [this.item.notice_months ?? null as number | null],
    utilities_to_be_taken_over: [this.item.utilities_to_be_taken_over ?? false],
    registration_ref: [this.item.registration_ref ?? ''],
    cadastral_ref: [this.item.cadastral_ref ?? ''],
    area_sqm: [this.item.area_sqm ?? null as number | null],
    notes: [this.item.notes ?? ''],
    asset_ids: [(this.item.assets ?? []).map(a => a.id)],
    parent_contract_id: [this.item.parent_contract_id ?? null as number | null],
  });

  // Canone annuo calcolato mostrato sotto il canone (stessi moltiplicatori del backend).
  annualPreview(): string {
    const v = this.form.getRawValue();
    const factor: Record<string, number> = {MONTHLY: 12, BIMONTHLY: 6, QUARTERLY: 4, SEMIANNUAL: 2, ANNUAL: 1, ONE_OFF: 0};
    if (v.rent_amount === null || !v.rent_period) return '';
    return formatEuro(Number(v.rent_amount) * factor[v.rent_period]);
  }

  save(): void {
    if (!this.form.valid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const result = plainToInstance(UtilizerGrant, {
      id: this.item.id,
      ...v,
      subject: text(v.subject), department: text(v.department), concession_act: text(v.concession_act),
      usage_type: text(v.usage_type), registration_ref: text(v.registration_ref),
      cadastral_ref: text(v.cadastral_ref), notes: text(v.notes),
      start_date: v.start_date ? toIsoDate(v.start_date) : null,
      end_date: v.end_date ? toIsoDate(v.end_date) : null,
      renewal_months: v.tacit_renewal ? v.renewal_months : null,
      notice_months: v.tacit_renewal ? v.notice_months : null,
    });
    this.dialogRef.close(result);
  }
```

Opzioni: controparti da `UtilizerService.search()`, immobili da `AssetService.search({deleted:false})` (come oggi), contratti candidati padre da `UtilizerGrantService.search({})` escludendo sé stesso e quelli che hanno già un padre.

- [ ] **Step 2: Template con tab**

Tab *Dati* (fieldset "Contratto": direzione, tipo, stato, controparte, oggetto, settore, atto, tipo utilizzo; fieldset "Canone e durata": canone, periodicità, IVA, `annualPreview()` come `mat-hint`, decorrenza, scadenza, checkbox rinnovo tacito e — solo se spuntato — durata rinnovo e preavviso in mesi, scadenza effettiva e termine disdetta in sola lettura da `item.effective_end_date`/`item.notice_deadline`; fieldset "Dati amministrativi": registrazione, catasto, superficie, utenze da volturare, note). Datepicker con placeholder `GG/MM/AAAA`.

Tab *Immobili*: `app-multi-select` (`formControlName="asset_ids"`, label "Immobili"), `app-filterable-select` per il contratto padre, elenco in sola lettura dei figli (`item.children`) con controparte, tipo, stato.

Tab *Storico* (solo in modifica): `app-entity-history [entity]="'utilizer_grant'" [entityId]="data.item.id"` come negli altri dialog.

Titolo: `isNew ? 'Nuovo contratto immobiliare' : 'Contratto immobiliare #' + data.item.id`. Pulsante "Salva contratto". Larghezza dialog: `editDialogWidth()` → `'1000px'` nella tabella.

- [ ] **Step 3: Controparti**

Nelle pagine `pages/utilizer/`: titolo "Controparti", campi `tax_code` (label "Codice fiscale / P. IVA", max 16) e `contacts` (textarea "Contatti") nel dialog, colonna "Codice fiscale / P. IVA" in tabella.

- [ ] **Step 4: Build e commit**

Run: comando `ng build` del Task 6. Expected: nessun errore.

```bash
git add frontend/src/app/pages/utilizer-grant frontend/src/app/pages/utilizer
git commit -m "feat(contratti-immobiliari): dialog contratto con canone, rinnovo tacito, immobili e storico"
```

---

### Task 8: Frontend: immobile, utenze, dashboard

**Files:**
- Modify: `frontend/src/app/pages/assets/asset-edit-dialog.component.{ts,html}` (sezione "Utilizzatori" righe ~205-245)
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts:85`, `utility-edit-dialog.component.ts:361-368`, `utility-filter-dialog.component.html:290-297`
- Create: `frontend/src/app/pages/dashboard/real-estate-contracts-card.component.ts`
- Modify: `frontend/src/app/pages/dashboard/dashboard.component.{ts,html}`, `anomalies-card.component.ts`

**Interfaces:**
- Consumes: Task 6 (`UtilizerGrantService.summary`, modello), API anomalie Task 5.

- [ ] **Step 1: Dialog immobile**

Sostituire la sezione "Utilizzatori" del form con un tab "Contratti immobiliari" (dopo "Impianti termici"): tabella con direzione, tipo, controparte, oggetto, canone annuo, scadenza effettiva, stato (badge) e pulsante "Apri"; i dati arrivano da `UtilizerGrantService.search({asset_id: data.item.id})` (non da `data.item.utilizerGrants`, che non ha i campi calcolati). Pulsante "Nuovo contratto" (`appHasRole` Admin/Operatore) che apre `UtilizerGrantEditDialogComponent` in creazione con `asset_ids: [data.item.id]`, salva con `UtilizerGrantService.create` e ricarica.

- [ ] **Step 2: Utenze**

Etichette "Utilizzatori" → "Controparti" (colonna tabella, sezione dialog, pannello filtro). La logica resta invariata: legge `asset.utilizerGrants[].utilizer.name`, già oscurato dal backend.

- [ ] **Step 3: Card dashboard**

```ts
// frontend/src/app/pages/dashboard/real-estate-contracts-card.component.ts
import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {ContractAlert, ContractSummary, formatEuro} from '../utilizer-grant/real-estate-contract.model';

@Component({
  selector: 'app-real-estate-contracts-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-card>
      <mat-card-header style="padding: 1.25rem;">
        <mat-card-title style="font-size: 1.1rem;">Contratti immobiliari</mat-card-title>
        <mat-card-subtitle>Disdette, scadenze e canoni annui dei contratti attivi</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (s) {
          <div style="display:flex; flex-wrap:wrap; gap:0.75rem;">
            @for (a of alerts; track a.key) {
              <button mat-stroked-button (click)="open(a.key)" [disabled]="s[a.count] === 0"
                      [style.color]="s[a.count] > 0 ? a.color : null">
                {{ s[a.count] }} {{ a.label }}
              </button>
            }
          </div>
          <div style="display:flex; gap:1.5rem; margin-top:1rem;">
            <span>Entrate annue: <strong>{{ euro(s.annual_income) }}</strong></span>
            <span>Uscite annue: <strong>{{ euro(s.annual_expense) }}</strong></span>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
})
export class RealEstateContractsCardComponent implements OnInit {
  private service = inject(UtilizerGrantService);
  private router = inject(Router);

  readonly euro = formatEuro;
  readonly alerts: {key: ContractAlert; count: keyof ContractSummary; label: string; color: string}[] = [
    {key: 'notice', count: 'notice', label: 'disdette da inviare entro 60 giorni', color: '#b91c1c'},
    {key: 'expiring', count: 'expiring', label: 'in scadenza entro 4 mesi', color: '#92400e'},
    {key: 'expired_active', count: 'expired_active', label: 'scaduti ancora attivi', color: '#b91c1c'},
  ];
  s: ContractSummary | null = null;

  ngOnInit(): void {
    this.service.summary().subscribe({
      next: s => this.s = s,
      error: err => console.error('Errore riepilogo contratti immobiliari:', err),
    });
  }

  open(alert: ContractAlert): void {
    this.router.navigate(['/utilizer-grant'], {queryParams: {alert}});
  }
}
```

Inserirla in `dashboard.component.html` subito dopo la card "Contratti in scadenza" e registrarla negli `imports` di `dashboard.component.ts`.

In `anomalies-card.component.ts` aggiungere la voce "Contratti immobiliari senza immobile" che naviga a `/utilizer-grant?alert=without_assets`, seguendo lo schema delle voci esistenti.

- [ ] **Step 4: Build e commit**

Run: comando `ng build` del Task 6. Expected: nessun errore.

```bash
git add frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html frontend/src/app/pages/utilities/data-table-utilities.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-filter-dialog.component.html frontend/src/app/pages/dashboard
git commit -m "feat(contratti-immobiliari): tab nell'immobile, card dashboard e anomalia senza immobile"
```

---

### Task 9: Pulizia delle concessioni esistenti (dati locali)

**Files:**
- Create (non in repo): `.audit-w/contratti/cleanup_grants.py`
- Output: `.audit-w/contratti/cleanup_grants.sql`, `.audit-w/contratti/cleanup_grants_report.json`

**Interfaces:**
- Consumes: schema del Task 2.
- Produces: righe di `utilizer_grant` classificate; report con `moved_to_function`, `moved_to_utility_notes`, `school_plessi` (per i futuri complessi).

- [ ] **Step 1: Estrarre le controparti distinte**

```bash
docker exec utenzepa-mysql-1 mysql -uroot -p"$PW" --default-character-set=utf8mb4 mydatabase -B -e "SELECT u.id, u.name, COUNT(*) n, SUM(IFNULL(g.concession_act,'')<>'') atti FROM utilizer_grant g JOIN utilizer u ON u.id=g.utilizer_id_fk WHERE g.deleted=0 GROUP BY u.id ORDER BY n DESC" > .audit-w/contratti/utilizers.tsv
```

- [ ] **Step 2: Script con mappa esplicita**

`cleanup_grants.py` legge `utilizers.tsv` e contiene una mappa **esplicita** `NAME → GROUP` (gruppi `CONTRACT`, `FUNCTION:<nome funzione asset>`, `UTILITY_NOTE`, `SCHOOL`) costruita leggendo ogni nome (circa 40). Esempi certi dalla spec: `PUBBLICA ILLUMINAZIONE` → `FUNCTION:Illuminazione pubblica`; `cabina enel su area comunale` → `FUNCTION:Magazzino e autorimessa` **solo se** confermato a mano, altrimenti `FUNCTION:` vuota (resta solo il soft delete); `POMPA DI SOLLEVAMENTO` → `FUNCTION:` (nessuna funzione dedicata: soft delete senza funzione); fontane → `FUNCTION:Fontana`; `SEMAFORO…` → `FUNCTION:Semaforo`; `colonninaTAXI` → `FUNCTION:Trasporto pubblico`; `VERIFICARE`, `NO recenti fatture…` → `UTILITY_NOTE`; `DIREZIONE DIDATTICA…`, `ISTITUTO COMPRENSIVO…`, `Scuola…` → `SCHOOL`; `Azienda Speciale…`, `SPRAR`, `mobilità elettrica`, `CONCESSIONE A EGENIA…`, associazioni, parrocchia, `centro sociale anziani`, `PARCO DELLA LIBERTA'` → `CONTRACT`.

Lo script si **interrompe** se una controparte in `utilizers.tsv` non è nella mappa (stampa l'elenco dei mancanti).

SQL generato (in un'unica `START TRANSACTION … COMMIT`):
- `CONTRACT`: `UPDATE utilizer_grant SET kind='CONCESSION', direction='ACTIVE' …`; per `SPRAR`: `kind='LEASE', direction='PASSIVE'`.
- `FUNCTION:X` con X non vuoto: `UPDATE assets SET function_id=(SELECT id FROM asset_functions WHERE name='X' AND deleted=0) WHERE id IN (immobili delle righe) AND function_id IS NULL`, poi soft delete delle righe.
- `UTILITY_NOTE`: `UPDATE utilities SET notes=CONCAT_WS('\n', NULLIF(TRIM(notes),''), '[Da concessioni: <nome>]') WHERE id IN (utenze degli immobili delle righe)`, poi soft delete.
- `SCHOOL`: soft delete; nel report `{istituto, immobili}`.
- Soft delete = `UPDATE utilizer_grant SET deleted=1, updated_by_user_id=1 WHERE id IN (…)`; controparti rimaste senza contratti attivi: `UPDATE utilizer SET deleted=1 …`.

Modalità `--dry-run`: scrive solo report e conteggi, nessun SQL applicato.

- [ ] **Step 3: Esecuzione**

```bash
cd .audit-w/contratti && PYTHONIOENCODING=utf-8 python cleanup_grants.py --dry-run
```
Expected: conteggi per gruppo vicini alla spec (contratti ~90, funzione ~170, note ~25, scuole ~15), nessuna controparte non classificata. Mostrare il riepilogo all'utente prima di applicare.

Poi backup e applicazione:

```bash
docker exec utenzepa-mysql-1 mysqldump -uroot -p"$PW" --single-transaction mydatabase 2>/dev/null > "$SCRATCH/backup-pre-cleanup-grants.sql"
PYTHONIOENCODING=utf-8 python cleanup_grants.py && docker exec -i utenzepa-mysql-1 mysql -uroot -p"$PW" --default-character-set=utf8mb4 mydatabase < cleanup_grants.sql
```
Expected: `SELECT COUNT(*) FROM utilizer_grant WHERE deleted=0` ≈ 90.

Nessun commit (dati reali fuori repo).

---

### Task 10: Import iniziale dalle fonti (dati locali)

**Files:**
- Create (non in repo): `.audit-w/contratti/import_contracts.py`
- Output: `.audit-w/contratti/import_contracts.sql`, `import_contracts_report.json`, `C:/Users/mirko.daddiego/Documents/Contratti immobiliari da abbinare 2026-10-02.xlsx`

**Interfaces:**
- Consumes: JSON in `.audit-w/immobiliare/excel/` (tramite `_index.json`), schema Task 2, pulizia Task 9.

- [ ] **Step 1: Lettori per fonte**

Una funzione per fonte che restituisce dizionari normalizzati `{direction, kind, counterparty_name, counterparty_contacts, subject, rent_amount, rent_period, vat_applicable, start_date, end_date, status, registration_ref, cadastral_ref, area_sqm, department, address_hint, cadastral_hint, notes}`. Mappature dalla spec:
- Locazioni attive: `Nominativo` "Cognome Nome - Rep. N" → nome + `registration_ref='Rep. N'`; stato `RESO`→`RETURNED`, `Deceduto/a`→`TERMINATED`, `Legale`→`DISPUTED`; canone mensile.
- Locazioni passive: periodicità dalla colonna ("annuale"/"bimestrale"; altrimenti mensile, come da intestazione "Canone mensile"); `IVA` → `vat_applicable`; superficie numerica → `area_sqm`, altrimenti nelle note.
- SPRAR: passivo, canone annuo; se esiste già un contratto SPRAR sullo stesso immobile (abbinato per indirizzo) → `UPDATE` di quello invece di `INSERT`.
- Beni demaniali: `LOCAZIONE`→`LEASE`, altrimenti `LAND_OCCUPATION`; periodo "01/01/2010 AL 31/12/2015" → date; `registration_ref` = codice scheda + n. contratto.
- Case comunali (45 righe): `HOUSING_ASSIGNMENT`, attivo, figlio del contratto Azienda Speciale sullo stesso immobile; nessun canone. **Non** leggere `ALLOGGIPROPRIETA'_canoni 2017.xlsx`.
- Mercatino ittico: un `CONCESSION` attivo per box concesso, `subject` = "Box N (lettera X)", `registration_ref` = numero concessione.
- Canoni demaniali idrici: `PASSIVE`, `CONCESSION`/`LAND_OCCUPATION`, controparte "Regione Abruzzo", canone annuo dall'ultima annualità.
- Autoparco via Danubio: `PASSIVE`, `LEASE`, canone con ultimo adeguamento ISTAT del prospetto.

- [ ] **Step 2: Abbinamento immobili**

Indirizzo normalizzato (minuscolo, senza "via/viale/piazza", civico separato) e/o foglio+particella contro `assets` (export TSV come nel Task 9). Solo abbinamenti **univoci**; il resto senza immobile e nel file Excel "da abbinare" (colonne: fonte, controparte, oggetto, indirizzo, catasto, immobili candidati).

Controparti: riusare `utilizer` esistente con stesso nome normalizzato, altrimenti `INSERT` (con `contacts` dalla fonte; nessun codice fiscale inventato).

- [ ] **Step 3: Esecuzione**

Dry-run, riepilogo all'utente, backup, applicazione (stesso schema del Task 9). Rieseguibile: ogni `INSERT` è protetto da `WHERE NOT EXISTS` su (controparte, registration_ref, subject).

Expected: report con contratti inseriti per fonte, aggiornati (SPRAR), senza immobile; `GET /utilizer-grant/summary` coerente con il report.

Nessun commit.

---

### Task 11: Verifica end-to-end e rilascio

**Files:**
- Modify: `publiccode.yml` (`softwareVersion: "v1.7.0"`, `releaseDate`)
- Modify: `docs/roadmap-patrimonio.md` (voce 1 → "fatta, v1.7.0")

- [ ] **Step 1: E2E Playwright** (utente temporaneo come da CLAUDE.md, eliminato a fine prova)

1. `/utilizer-grant`: elenco con badge, totali, filtro "Disdetta entro 60 giorni" dalla dashboard.
2. Creare un contratto `LEASE` passivo: canone 500 mensile, scadenza = oggi + 4 mesi, rinnovo tacito 48 mesi, preavviso 3 mesi → termine disdetta = oggi + 1 mese: compare nella card "disdette da inviare" e nel filtro `?alert=notice`; canone annuo mostrato 6.000,00 €.
3. Modificare un contratto importato da Access senza canone né date → il salvataggio riesce (Review Focus 4).
4. Contratto senza immobili → presente nell'anomalia e nel filtro `without_assets` (Review Focus 2).
5. Utente temporaneo con ruolo Lettore: in `/utilities` la colonna "Controparti" non mostra i nomi degli assegnatari; nel dettaglio contratto `tax_code`/`contacts` assenti (Review Focus 3, verificare anche nella risposta HTTP).
6. Soft delete di un contratto padre → il figlio si apre senza errori (Review Focus 5).

- [ ] **Step 2: Suite e build**

Run: `MSYS_NO_PATHCONV=1 docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant src/apis/anomalies src/apis/asset src/apis/utility src/apis/utilizer src/data-importer --maxWorkers=2` → PASS. Build frontend come Task 6. Suite completa: lasciarla alla CI (instabilità Docker sotto carico, vedi CLAUDE.md).

- [ ] **Step 3: Versione, roadmap, PR**

```bash
git add publiccode.yml docs/roadmap-patrimonio.md
git commit -m "chore: bump softwareVersion a v1.7.0"
git push -u origin feat/contratti-immobiliari
gh pr create --repo Comune-di-Montesilvano/UtenzePA --base main --title "feat: contratti immobiliari (unificazione Concessioni) (v1.7.0)" --body-file "$SCRATCH/pr-contratti-immobiliari.md"
```

Il corpo della PR (`$SCRATCH/pr-contratti-immobiliari.md`) riassume: schema e migration, avvisi e dashboard, oscuramento Lettore, test eseguiti, e l'ordine in produzione: deploy (migration) → script di pulizia → script di import → verifica dei report.

```bash
```

Merge e tag solo su indicazione dell'utente.
