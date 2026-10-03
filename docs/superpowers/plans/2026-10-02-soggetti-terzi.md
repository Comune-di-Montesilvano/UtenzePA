# Soggetti terzi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire controparti (`utilizer`) e fornitori (`suppliers`) con un'unica anagrafica `third_parties`, con contratti immobiliari N-N verso i soggetti, ruoli derivati dai collegamenti e una pagina/scheda "Soggetti terzi".

**Architecture:** Nuovo modulo NestJS `apis/third-parties/` (entity, regole pure di validazione/ruoli/nome/privacy, service su `BaseService`, controller). `UtilizerGrant` passa da `utilizer` a `parties` (ManyToMany su `utilizer_grant_parties`); `Contract.supplier` e `ConsipAgreement.supplier` puntano a `ThirdParty`. Una migration copia i dati conservando gli id. Frontend: pagina `pages/third-parties/` con chip rapide e scheda su `entity-sheet`, helper `partyName()` in `core/helpers/` usato ovunque prima comparivano `supplier_id`/`utilizer.name`.

**Tech Stack:** NestJS 11, TypeORM 1.x, MySQL 8, class-validator, Jest; Angular 22 standalone + Angular Material 22.

**Spec:** `docs/superpowers/specs/2026-10-02-soggetti-terzi-design.md`

## Global Constraints

- Collegamenti sempre per id interno; id originali di `utilizer` (961–1274) e `suppliers` (42–54) conservati.
- `LEGAL`: denominazione e P.IVA obbligatorie; `NATURAL`: cognome, nome, codice fiscale obbligatori. Colonne nullable nel DB, obbligo solo in validazione.
- P.IVA e CF `unique` (anche sulle righe eliminate). Duplicato → **400** `BadRequestException`, **mai 409** (il reverse proxy di produzione blocca i 409).
- Nessun campo sigla: `suppliers.supplier_id` sparisce.
- Ruoli (fornitore, locatore, conduttore) mai salvati: calcolati dai collegamenti.
- Niente codice legacy: `apis/utilizer/`, `apis/suppliers/`, `pages/utilizer/`, `pages/suppliers/` eliminati, route vecchie senza redirect.
- Privacy: per ruoli diversi da Admin/Operatore, `tax_code` e `phone` dei soggetti `NATURAL` oscurati negli endpoint soggetti terzi e nei contratti immobiliari (anche annidati in immobili/utenze), come oggi per le controparti.
- Comandi Docker uno alla volta, mai in parallelo; jest sempre `--maxWorkers=2`.
- Migration scritta in scratch (fuori da `src/database/migrations/`) e spostata solo a contenuto finale (il watcher la esegue appena compare).
- Mai `git add .`/`-A`. Commit in Conventional Commits, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/soggetti-terzi` (già creato, contiene la spec), da riallineare a `main` dopo il merge della PR "rimozione importatore Access" (`git rebase origin/main`).
- Pagina frontend non conclusa senza `ng build` reale (o log "generation complete" di `ng serve`).

## Review Focus

- Restore di un soggetto storico senza identificativo (`PATCH {deleted:false}`): deve riuscire, la validazione scatta solo se il payload tocca tipo/nomi/P.IVA/CF.
- P.IVA/CF inseriti con spazi o minuscole ("it 012 345…", "rssmra…"): normalizzati prima di validazione e controllo duplicati, altrimenti due soggetti uguali passano il vincolo.
- Contratto immobiliare salvato dalla scheda di un immobile (catena `EntityNavigatorService`) senza `party_ids` nel payload: le parti esistenti non devono essere cancellate.
- Filtro utenze per controparte e ricerca testuale dei contratti: non devono restituire elenchi di parti troncati (filtro con sottoquery, non sul join).
- Lettore che apre la scheda di una persona fisica: CF e telefono vuoti, nessun errore di validazione mostrato (form disabilitato).

---

### Task 1: Duplicati → 400 ovunque

**Files:**
- Modify: `backend/src/apis/shared/base.service.ts` (`manageErrors`)
- Modify: `backend/src/apis/asset-natures/asset-natures.service.ts`, `backend/src/apis/asset-functions/asset-functions.service.ts`
- Test: `backend/src/apis/asset-natures/asset-natures.service.spec.ts`, `backend/src/apis/asset-functions/asset-functions.service.spec.ts`, `backend/src/apis/shared/base.service.spec.ts` (creare se assente)
- Modify: `docs/roadmap-patrimonio.md` (togliere la riga sui 409 aggiunta alla voce 13)

**Interfaces:**
- Produces: `BaseService.manageErrors` lancia `BadRequestException('Elemento duplicato: esiste già un elemento con gli stessi dati.')` su `ER_DUP_ENTRY`.

- [ ] **Step 1: Test che falliscono**

Negli spec di `asset-natures` e `asset-functions` sostituire ogni `ConflictException` con `BadRequestException` (import da `@nestjs/common`) e i titoli "rifiuta con 409" con "rifiuta con 400". Se `backend/src/apis/shared/base.service.spec.ts` non esiste, crearlo:

```ts
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BaseService } from './base.service';

class Dummy extends BaseService<any, any, any> {
  protected readonly entityName = 'dummy';
  protected readonly relations: string[] = [];
  constructor(protected readonly repo: Repository<any>) {
    super();
  }
}

describe('BaseService.manageErrors', () => {
  const service = new Dummy({} as Repository<any>);

  it('duplicato MySQL → 400, mai 409', () => {
    expect(() => service.manageErrors({ code: 'ER_DUP_ENTRY' }, 'x')).toThrow(BadRequestException);
    expect(() => service.manageErrors({ driverError: { errno: 1062 } }, 'x')).toThrow(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/shared src/apis/asset-natures src/apis/asset-functions --maxWorkers=2`
Expected: FAIL (lanciano `ConflictException`).

- [ ] **Step 3: Implementazione**

`base.service.ts`: in `manageErrors` sostituire `throw new ConflictException(` con `throw new BadRequestException(` e togliere `ConflictException` dagli import. In `asset-natures.service.ts` e `asset-functions.service.ts` sostituire ogni `ConflictException` con `BadRequestException` (import inclusi, stessi messaggi).

Verifica: `grep -rn "ConflictException" backend/src` → nessun risultato.

- [ ] **Step 4: Test verdi**

Run: stesso comando dello Step 2. Expected: PASS.

- [ ] **Step 5: Roadmap e commit**

In `docs/roadmap-patrimonio.md` eliminare la riga che inizia con "- `asset-natures` e `asset-functions` rispondono 409".

```bash
git add backend/src/apis/shared/base.service.ts backend/src/apis/shared/base.service.spec.ts backend/src/apis/asset-natures/asset-natures.service.ts backend/src/apis/asset-natures/asset-natures.service.spec.ts backend/src/apis/asset-functions/asset-functions.service.ts backend/src/apis/asset-functions/asset-functions.service.spec.ts docs/roadmap-patrimonio.md
git commit -m "fix(backend): conflitti e duplicati rispondono 400, non 409

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regole pure dei soggetti terzi

**Files:**
- Create: `backend/src/apis/third-parties/enum/third-party.enum.ts`
- Create: `backend/src/apis/third-parties/third-party.name.ts`
- Create: `backend/src/apis/third-parties/third-party.validation.ts`
- Create: `backend/src/apis/third-parties/third-party.roles.ts`
- Create: `backend/src/apis/third-parties/third-party.privacy.ts`
- Test: `backend/src/apis/third-parties/third-party.rules.spec.ts`

**Interfaces:**
- Consumes: `ContractDirection`, `ContractKind` da `@apis/utilizer-grant/enum/real-estate-contract.enum`.
- Produces:
  - `enum ThirdPartyType { NATURAL = 'NATURAL', LEGAL = 'LEGAL' }`
  - `enum PartyRole { SUPPLIER = 'supplier', LESSOR = 'lessor', TENANT = 'tenant', UNLINKED = 'unlinked' }`
  - `interface PartyFields { type?: ThirdPartyType | null; company_name?: string | null; last_name?: string | null; first_name?: string | null; vat_number?: string | null; tax_code?: string | null }`
  - `partyName(p: PartyFields | null | undefined): string`
  - `partyNameSql(alias: string): string`
  - `normalizeParty<T extends PartyFields>(p: T): T`
  - `touchesIdentity(dto: object): boolean`
  - `validateThirdParty(p: PartyFields): string | null`
  - `interface RoleIndex { suppliers: Set<number>; grants: { party_id: number; direction: ContractDirection; kind: ContractKind }[] }`
  - `partyRoles(id: number, index: RoleIndex, kind?: ContractKind): PartyRole[]`
  - `matchesRoles(roles: PartyRole[], wanted: PartyRole[]): boolean`
  - `maskParty<T extends { type?: ThirdPartyType | null; tax_code?: string | null; phone?: string | null }>(p: T, role?: string): T`
  - `FULL_ACCESS_ROLES: Set<string>` (`'Admin'`, `'Operatore'`)

- [ ] **Step 1: Test che falliscono**

`third-party.rules.spec.ts`:

```ts
import { ContractDirection, ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole, ThirdPartyType } from './enum/third-party.enum';
import { partyName, partyNameSql } from './third-party.name';
import { normalizeParty, touchesIdentity, validateThirdParty } from './third-party.validation';
import { matchesRoles, partyRoles, RoleIndex } from './third-party.roles';
import { maskParty } from './third-party.privacy';

const LEGAL = ThirdPartyType.LEGAL;
const NATURAL = ThirdPartyType.NATURAL;

describe('partyName', () => {
  it('giuridica: denominazione', () => {
    expect(partyName({ type: LEGAL, company_name: 'ACA SpA' })).toBe('ACA SpA');
  });
  it('fisica: cognome nome', () => {
    expect(partyName({ type: NATURAL, last_name: 'Rossi', first_name: 'Mario' })).toBe('Rossi Mario');
  });
  it('vuoto se nullo', () => {
    expect(partyName(null)).toBe('');
  });
  it('SQL con CASE sul tipo', () => {
    expect(partyNameSql('tp')).toContain("tp.type = 'NATURAL'");
  });
});

describe('normalizeParty', () => {
  it('P.IVA/CF maiuscoli senza spazi, stringhe vuote a null, nomi ripuliti', () => {
    expect(
      normalizeParty({ vat_number: ' 012 3456 7890 ', tax_code: 'rss mra80a01h501u', company_name: '  ACA ', last_name: '' }),
    ).toEqual({ vat_number: '01234567890', tax_code: 'RSSMRA80A01H501U', company_name: 'ACA', last_name: null });
  });
  it('non aggiunge campi assenti', () => {
    expect(normalizeParty({ phone: '333' } as never)).toEqual({ phone: '333' });
  });
});

describe('touchesIdentity', () => {
  it('restore senza campi identità', () => {
    expect(touchesIdentity({ deleted: false, updated_by_user_id: 1 })).toBe(false);
  });
  it('salvataggio scheda', () => {
    expect(touchesIdentity({ type: LEGAL, notes: 'x' })).toBe(true);
  });
});

describe('validateThirdParty', () => {
  const legal = { type: LEGAL, company_name: 'ACA', vat_number: '01318460688' };
  const person = { type: NATURAL, last_name: 'Rossi', first_name: 'Mario', tax_code: 'RSSMRA80A01H501U' };

  it('validi', () => {
    expect(validateThirdParty(legal)).toBeNull();
    expect(validateThirdParty(person)).toBeNull();
    expect(validateThirdParty({ ...legal, tax_code: '91015370686' })).toBeNull();
  });
  it('tipo obbligatorio', () => {
    expect(validateThirdParty({ company_name: 'X' })).toMatch(/fisica o giuridica/);
  });
  it('giuridica senza P.IVA o denominazione', () => {
    expect(validateThirdParty({ ...legal, vat_number: null })).toMatch(/Partita IVA obbligatoria/);
    expect(validateThirdParty({ ...legal, company_name: null })).toMatch(/Denominazione/);
  });
  it('formati', () => {
    expect(validateThirdParty({ ...legal, vat_number: '1219980529' })).toMatch(/11 cifre/);
    expect(validateThirdParty({ ...person, tax_code: 'RSSMRA80' })).toMatch(/16 caratteri/);
    expect(validateThirdParty({ ...person, vat_number: '123' })).toMatch(/11 cifre/);
  });
  it('fisica senza CF o nomi', () => {
    expect(validateThirdParty({ ...person, tax_code: null })).toMatch(/Codice fiscale obbligatorio/);
    expect(validateThirdParty({ ...person, first_name: null })).toMatch(/Cognome e nome/);
  });
});

describe('ruoli', () => {
  const index: RoleIndex = {
    suppliers: new Set([42]),
    grants: [
      { party_id: 1000, direction: ContractDirection.PASSIVE, kind: ContractKind.LEASE },
      { party_id: 1001, direction: ContractDirection.ACTIVE, kind: ContractKind.CONCESSION },
      { party_id: 42, direction: ContractDirection.ACTIVE, kind: ContractKind.LEASE },
    ],
  };

  it('derivati dai collegamenti', () => {
    expect(partyRoles(42, index)).toEqual([PartyRole.SUPPLIER, PartyRole.TENANT]);
    expect(partyRoles(1000, index)).toEqual([PartyRole.LESSOR]);
    expect(partyRoles(9, index)).toEqual([]);
  });
  it('limitati a un tipo di contratto', () => {
    expect(partyRoles(1001, index, ContractKind.LEASE)).toEqual([]);
    expect(partyRoles(42, index, ContractKind.LEASE)).toEqual([PartyRole.SUPPLIER, PartyRole.TENANT]);
  });
  it('filtro chip in OR, "senza collegamenti" = nessun ruolo', () => {
    expect(matchesRoles([PartyRole.LESSOR], [])).toBe(true);
    expect(matchesRoles([PartyRole.LESSOR], [PartyRole.SUPPLIER, PartyRole.LESSOR])).toBe(true);
    expect(matchesRoles([PartyRole.TENANT], [PartyRole.SUPPLIER])).toBe(false);
    expect(matchesRoles([], [PartyRole.UNLINKED])).toBe(true);
    expect(matchesRoles([PartyRole.SUPPLIER], [PartyRole.UNLINKED])).toBe(false);
  });
});

describe('maskParty', () => {
  const person = { type: NATURAL, tax_code: 'RSSMRA80A01H501U', phone: '333' };
  it('Lettore: CF e telefono delle persone oscurati', () => {
    expect(maskParty(person, 'Lettore')).toEqual({ type: NATURAL, tax_code: null, phone: null });
    expect(maskParty(person, undefined).tax_code).toBeNull();
  });
  it('Admin/Operatore: invariato', () => {
    expect(maskParty(person, 'Operatore')).toBe(person);
  });
  it('giuridica: invariata anche per il Lettore', () => {
    const legal = { type: LEGAL, tax_code: '91015370686', phone: '085' };
    expect(maskParty(legal, 'Lettore')).toBe(legal);
  });
});
```

- [ ] **Step 2: Verifica fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/third-parties --maxWorkers=2`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementazione**

`enum/third-party.enum.ts`:

```ts
export enum ThirdPartyType {
  NATURAL = 'NATURAL', // persona fisica
  LEGAL = 'LEGAL', // soggetto giuridico (società, ente, associazione, ditta)
}

// Ruoli calcolati dai collegamenti, mai salvati. UNLINKED vale solo come filtro.
export enum PartyRole {
  SUPPLIER = 'supplier',
  LESSOR = 'lessor',
  TENANT = 'tenant',
  UNLINKED = 'unlinked',
}
```

`third-party.name.ts`:

```ts
import { ThirdPartyType } from './enum/third-party.enum';

export interface PartyFields {
  type?: ThirdPartyType | null;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
}

export function partyName(p: PartyFields | null | undefined): string {
  if (!p) return '';
  const person = [p.last_name, p.first_name].filter(Boolean).join(' ');
  return p.type === ThirdPartyType.NATURAL ? person : (p.company_name ?? person);
}

// Stessa regola di partyName, per le query SQL grezze (anomalie).
export function partyNameSql(alias: string): string {
  return `(CASE WHEN ${alias}.type = 'NATURAL' THEN TRIM(CONCAT_WS(' ', ${alias}.last_name, ${alias}.first_name)) ELSE ${alias}.company_name END)`;
}
```

`third-party.validation.ts`:

```ts
import { ThirdPartyType } from './enum/third-party.enum';
import { PartyFields } from './third-party.name';

const VAT = /^\d{11}$/;
const CF_PERSON = /^[A-Z0-9]{16}$/;
// Il CF di un soggetto giuridico è spesso numerico a 11 cifre (es. ACA).
const CF_LEGAL = /^(\d{11}|[A-Z0-9]{16})$/;

const IDENTITY_FIELDS = ['type', 'company_name', 'last_name', 'first_name', 'vat_number', 'tax_code'];
const CODE_FIELDS = ['vat_number', 'tax_code'];
const NAME_FIELDS = ['company_name', 'last_name', 'first_name'];

// P.IVA/CF maiuscoli senza spazi, nomi ripuliti, stringhe vuote a null.
// Tocca solo i campi presenti nell'oggetto.
export function normalizeParty<T extends PartyFields>(p: T): T {
  const out: Record<string, unknown> = { ...p };
  for (const f of CODE_FIELDS) {
    if (!(f in out)) continue;
    const v = out[f] === null || out[f] === undefined ? '' : String(out[f]);
    const clean = v.replace(/\s+/g, '').toUpperCase();
    out[f] = clean || null;
  }
  for (const f of NAME_FIELDS) {
    if (!(f in out)) continue;
    const v = out[f] === null || out[f] === undefined ? '' : String(out[f]).trim();
    out[f] = v || null;
  }
  return out as T;
}

// La validazione scatta solo se il payload tocca l'identità: un ripristino
// ({deleted:false}) di un soggetto storico incompleto deve riuscire.
export function touchesIdentity(dto: object): boolean {
  return IDENTITY_FIELDS.some((f) => f in dto);
}

export function validateThirdParty(p: PartyFields): string | null {
  if (p.type !== ThirdPartyType.LEGAL && p.type !== ThirdPartyType.NATURAL) {
    return 'Indicare se il soggetto è una persona fisica o giuridica.';
  }
  if (p.vat_number && !VAT.test(p.vat_number)) return 'Partita IVA non valida: servono 11 cifre.';
  if (p.type === ThirdPartyType.LEGAL) {
    if (!p.company_name) return 'Denominazione obbligatoria.';
    if (!p.vat_number) return 'Partita IVA obbligatoria per i soggetti giuridici.';
    if (p.tax_code && !CF_LEGAL.test(p.tax_code)) return 'Codice fiscale non valido.';
    return null;
  }
  if (!p.last_name || !p.first_name) return 'Cognome e nome obbligatori.';
  if (!p.tax_code) return 'Codice fiscale obbligatorio per le persone fisiche.';
  if (!CF_PERSON.test(p.tax_code)) return 'Codice fiscale non valido: servono 16 caratteri.';
  return null;
}
```

`third-party.roles.ts`:

```ts
import { ContractDirection, ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole } from './enum/third-party.enum';

export interface RoleIndex {
  // Soggetti con almeno un contratto di fornitura o una convenzione CONSIP non eliminati.
  suppliers: Set<number>;
  // Partecipazioni a contratti immobiliari non eliminati.
  grants: { party_id: number; direction: ContractDirection; kind: ContractKind }[];
}

// Ordine fisso: fornitore, locatore, conduttore. Con `kind` contano solo i
// contratti immobiliari di quel tipo (il ruolo fornitore resta).
export function partyRoles(id: number, index: RoleIndex, kind?: ContractKind): PartyRole[] {
  const grants = index.grants.filter((g) => g.party_id === id && (!kind || g.kind === kind));
  const roles: PartyRole[] = [];
  if (index.suppliers.has(id)) roles.push(PartyRole.SUPPLIER);
  if (grants.some((g) => g.direction === ContractDirection.PASSIVE)) roles.push(PartyRole.LESSOR);
  if (grants.some((g) => g.direction === ContractDirection.ACTIVE)) roles.push(PartyRole.TENANT);
  return roles;
}

// Chip in OR; nessuna chip = tutti.
export function matchesRoles(roles: PartyRole[], wanted: PartyRole[]): boolean {
  if (wanted.length === 0) return true;
  return wanted.some((w) => (w === PartyRole.UNLINKED ? roles.length === 0 : roles.includes(w)));
}
```

`third-party.privacy.ts`:

```ts
import { ThirdPartyType } from './enum/third-party.enum';

// CF e telefono delle persone fisiche visibili solo ad Admin/Operatore.
// I dati dei soggetti giuridici sono pubblici.
export const FULL_ACCESS_ROLES = new Set(['Admin', 'Operatore']);

export function maskParty<
  T extends { type?: ThirdPartyType | null; tax_code?: string | null; phone?: string | null },
>(p: T, role?: string): T {
  if (!p || FULL_ACCESS_ROLES.has(role ?? '') || p.type !== ThirdPartyType.NATURAL) return p;
  return { ...p, tax_code: null, phone: null };
}
```

- [ ] **Step 4: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/third-parties --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/apis/third-parties
git commit -m "feat(backend): regole pure dei soggetti terzi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Modulo `third-parties` (entity, service, controller)

**Files:**
- Create: `backend/src/apis/third-parties/entity/third-party.entity.ts`
- Create: `backend/src/apis/third-parties/dto/create-third-party.dto.ts`, `update-third-party.dto.ts`, `search-third-party.dto.ts`
- Create: `backend/src/apis/third-parties/third-parties.service.ts`, `third-parties.controller.ts`, `third-parties.module.ts`
- Modify: `backend/src/app.module.ts` (aggiungere `ThirdPartiesModule`)
- Test: `backend/src/apis/third-parties/third-parties.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 (tutte le funzioni pure).
- Produces:
  - entity `ThirdParty` (tabella `third_parties`) con i campi della spec;
  - `type ThirdPartyRow = ThirdParty & { roles: PartyRole[] }`;
  - `ThirdPartiesService.findAll(filters: SearchThirdPartyDto): Promise<ThirdPartyRow[]>`, `findOne(id): Promise<ThirdPartyRow | null>`, `create(dto, userId)`, `update(id, dto, userId)`, `remove(id, userId)` (ereditato);
  - REST `GET /third-parties?q=&type=&roles=supplier,lessor&kind=LEASE&deleted=`, `GET /third-parties/:id`, `POST`, `PATCH /:id`, `DELETE /:id`.

- [ ] **Step 1: Entity**

`entity/third-party.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SystemUser } from '@apis/system-users/entity/system-user.entity';
import { ThirdPartyType } from '../enum/third-party.enum';

// Soggetto terzo: persona fisica o giuridica. Ruoli (fornitore, locatore,
// conduttore) calcolati dai collegamenti, mai salvati. P.IVA e CF unici anche
// tra le righe eliminate: un soggetto è uno solo.
@Entity('third_parties')
export class ThirdParty {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'enum', enum: ThirdPartyType })
  type: ThirdPartyType;

  @Column({ length: 255, nullable: true })
  company_name: string | null;

  @Column({ length: 100, nullable: true })
  last_name: string | null;

  @Column({ length: 100, nullable: true })
  first_name: string | null;

  @Index({ unique: true })
  @Column({ length: 20, nullable: true })
  vat_number: string | null;

  @Index({ unique: true })
  @Column({ length: 16, nullable: true })
  tax_code: string | null;

  @Column({ length: 255, nullable: true })
  address: string | null;

  @Column({ length: 100, nullable: true })
  city: string | null;

  @Column({ length: 10, nullable: true })
  postal_code: string | null;

  @Column({ length: 100, nullable: true })
  email: string | null;

  @Column({ length: 100, nullable: true })
  pec: string | null;

  @Column({ length: 50, nullable: true })
  phone: string | null;

  // Referente e recapiti in testo libero, come nelle fonti.
  @Column({ type: 'text', nullable: true })
  contacts: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  create_date: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  update_date: Date;

  @Column({ name: 'created_by_user_id' })
  @Index()
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

- [ ] **Step 2: DTO**

`dto/create-third-party.dto.ts` (solo tipi e formati email; le regole condizionali stanno in `validateThirdParty`, applicata dal service sul record risultante):

```ts
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ThirdPartyType } from '../enum/third-party.enum';

export class CreateThirdPartyDto {
  @IsEnum(ThirdPartyType, { message: 'Tipo soggetto non valido' })
  type: ThirdPartyType;

  @IsOptional() @IsString() @MaxLength(255) company_name?: string | null;
  @IsOptional() @IsString() @MaxLength(100) last_name?: string | null;
  @IsOptional() @IsString() @MaxLength(100) first_name?: string | null;
  @IsOptional() @IsString() @MaxLength(20) vat_number?: string | null;
  @IsOptional() @IsString() @MaxLength(20) tax_code?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(100) city?: string | null;
  @IsOptional() @IsString() @MaxLength(10) postal_code?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email non valida' })
  email?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'PEC non valida' })
  pec?: string | null;

  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsString() contacts?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
```

Nota: `tax_code` accetta 20 caratteri in ingresso perché gli spazi vengono tolti dopo (normalizzazione), la colonna è 16. `@IsEmail` con `@IsOptional` rifiuta la stringa vuota: il frontend manda `null` per i campi vuoti (Task 9).

`dto/update-third-party.dto.ts`:

```ts
import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateThirdPartyDto } from './create-third-party.dto';

export class UpdateThirdPartyDto extends PartialType(CreateThirdPartyDto) {
  @IsOptional() @IsBoolean() deleted?: boolean;
  @IsOptional() updated_by_user_id?: number;
}
```

Verificare che `@nestjs/mapped-types` sia in `backend/package.json` (`grep mapped-types backend/package.json`); se manca usare `PartialType` da `@nestjs/swagger` (già usato per Swagger: `grep -rn "PartialType" backend/src | head -3` per vedere quale import usa il progetto) — non aggiungere dipendenze.

`dto/search-third-party.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { PartyRole, ThirdPartyType } from '../enum/third-party.enum';

export class SearchThirdPartyDto {
  @IsOptional() @IsString() q?: string;

  @IsOptional() @IsEnum(ThirdPartyType) type?: ThirdPartyType;

  // "supplier,lessor" → [supplier, lessor]
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean),
  )
  @IsEnum(PartyRole, { each: true })
  roles?: PartyRole[];

  @IsOptional() @IsEnum(ContractKind) kind?: ContractKind;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  deleted?: boolean;
}
```

- [ ] **Step 3: Test del service che falliscono**

`third-parties.service.spec.ts` (repository e DataSource mockati, stesso stile degli altri spec del progetto: `grep -rn "getRepositoryToken" backend/src/apis/plants/*.spec.ts | head -2` per l'esempio):

```ts
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContractDirection, ContractKind } from '@apis/utilizer-grant/enum/real-estate-contract.enum';
import { ThirdParty } from './entity/third-party.entity';
import { PartyRole, ThirdPartyType } from './enum/third-party.enum';
import { ThirdPartiesService } from './third-parties.service';

describe('ThirdPartiesService', () => {
  let service: ThirdPartiesService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 7, ...x })),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ThirdPartiesService,
        { provide: getRepositoryToken(ThirdParty), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ThirdPartiesService);
  });

  const legal = { type: ThirdPartyType.LEGAL, company_name: 'ACA', vat_number: '01318460688' };

  it('create rifiuta un giuridico senza P.IVA con 400', async () => {
    await expect(service.create({ ...legal, vat_number: null }, 1)).rejects.toThrow(
      new BadRequestException('Partita IVA obbligatoria per i soggetti giuridici.'),
    );
  });

  it('create rifiuta una P.IVA già usata, anche normalizzata, con il nome del soggetto', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 3, type: ThirdPartyType.LEGAL, company_name: 'ACA SpA', deleted: false });
    await expect(service.create({ ...legal, vat_number: ' 0131 8460688' }, 1)).rejects.toThrow(
      new BadRequestException('Partita IVA già usata da ACA SpA.'),
    );
    expect(repo.findOne).toHaveBeenCalledWith({ where: { vat_number: '01318460688' } });
  });

  it('update consente il ripristino di un soggetto storico incompleto', async () => {
    repo.findOne.mockResolvedValue({ id: 5, type: ThirdPartyType.LEGAL, company_name: 'X', vat_number: null, deleted: true });
    const spy = jest
      .spyOn(Object.getPrototypeOf(ThirdPartiesService.prototype), 'update')
      .mockResolvedValue({ id: 5 } as never);
    await service.update(5, { deleted: false }, 1);
    expect(spy).toHaveBeenCalled();
  });

  it('update valida il record risultante se il payload tocca l\'identità', async () => {
    repo.findOne.mockResolvedValue({ id: 5, type: ThirdPartyType.LEGAL, company_name: 'X', vat_number: null, deleted: false });
    await expect(service.update(5, { notes: 'x', company_name: 'X' }, 1)).rejects.toThrow(BadRequestException);
  });

  it('findAll calcola i ruoli e filtra per chip e tipo contratto', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 42, type: ThirdPartyType.LEGAL, company_name: 'Enel' },
        { id: 1000, type: ThirdPartyType.NATURAL, last_name: 'Rossi', first_name: 'Mario' },
        { id: 1001, type: ThirdPartyType.LEGAL, company_name: 'Bar Spiaggia' },
      ]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    dataSource.query
      .mockResolvedValueOnce([{ id: 42 }])
      .mockResolvedValueOnce([
        { party_id: 1000, direction: ContractDirection.PASSIVE, kind: ContractKind.LEASE },
        { party_id: 1001, direction: ContractDirection.ACTIVE, kind: ContractKind.CONCESSION },
      ]);

    const rows = await service.findAll({ roles: [PartyRole.SUPPLIER, PartyRole.LESSOR] });
    expect(rows.map((r) => [r.id, r.roles])).toEqual([
      [42, [PartyRole.SUPPLIER]],
      [1000, [PartyRole.LESSOR]],
    ]);
  });
});
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/third-parties --maxWorkers=2`
Expected: FAIL (service inesistente).

- [ ] **Step 4: Service**

`third-parties.service.ts`:

```ts
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
        if (filters.kind && partyRoles(p.id, index, filters.kind).every((r) => r === PartyRole.SUPPLIER)) {
          return false;
        }
        return matchesRoles(partyRoles(p.id, index, filters.kind), wanted);
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
```

Nota sul filtro `kind`: con un tipo contratto selezionato restano solo i soggetti che sono parte di almeno un contratto immobiliare di quel tipo; le chip si applicano ai ruoli calcolati su quel tipo.

- [ ] **Step 5: Controller e modulo**

`third-parties.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/core/auth/guards/roles.guard';
import { Roles } from '@/core/auth/decorators/roles.decorator';
import { CurrentUser, ICurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { ThirdPartiesService, ThirdPartyRow } from './third-parties.service';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';
import { SearchThirdPartyDto } from './dto/search-third-party.dto';
import { maskParty } from './third-party.privacy';
import { ThirdParty } from './entity/third-party.entity';

@Controller('third-parties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ThirdPartiesController {
  constructor(private readonly service: ThirdPartiesService) {}

  @Get()
  async getAll(@Query() filters: SearchThirdPartyDto, @CurrentUser() user: ICurrentUser): Promise<ThirdPartyRow[]> {
    return (await this.service.findAll(filters)).map((p) => maskParty(p, user?.role));
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<ThirdPartyRow | null> {
    const p = await this.service.findOne(id);
    return p ? maskParty(p, user?.role) : null;
  }

  @Roles('Admin', 'Operatore')
  @Post()
  create(@Body() dto: CreateThirdPartyDto, @CurrentUser() user: ICurrentUser): Promise<ThirdParty> {
    return this.service.create(dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateThirdPartyDto,
    @CurrentUser() user: ICurrentUser,
  ): Promise<ThirdParty> {
    return this.service.update(id, dto, user.id);
  }

  @Roles('Admin', 'Operatore')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ICurrentUser): Promise<void> {
    return this.service.remove(id, user.id);
  }
}
```

`third-parties.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThirdParty } from './entity/third-party.entity';
import { ThirdPartiesService } from './third-parties.service';
import { ThirdPartiesController } from './third-parties.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ThirdParty])],
  providers: [ThirdPartiesService],
  controllers: [ThirdPartiesController],
  exports: [ThirdPartiesService],
})
export class ThirdPartiesModule {}
```

`app.module.ts`: `import { ThirdPartiesModule } from '@apis/third-parties/third-parties.module';` e `ThirdPartiesModule,` nell'array `imports` (vicino a `UtilizerModule`, che sparirà nel Task 4).

- [ ] **Step 6: Test verdi**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/third-parties --maxWorkers=2`
Expected: PASS. Se il test "ripristino" fallisce per come è mockato `super.update`, sostituire lo spy con un mock di `repo.save`/`repo.findOne` che faccia passare `BaseService.update`, senza cambiare l'asserzione (la validazione non deve scattare).

- [ ] **Step 7: Commit**

L'app non parte ancora (tabella `third_parties` assente fino al Task 5): niente verifica runtime qui.

```bash
git add backend/src/apis/third-parties backend/src/app.module.ts
git commit -m "feat(backend): modulo soggetti terzi con ruoli derivati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Spostare i collegamenti su `ThirdParty` ed eliminare `utilizer`/`suppliers`

**Files:**
- Modify: `backend/src/apis/utilizer-grant/entity/utilizer-grant.entity.ts`
- Modify: `backend/src/apis/utilizer-grant/dto/create-utilizer-grant.dto.ts`, `update-utilizer-grant.dto.ts`, `search-utilizer-grant.dto.ts`
- Modify: `backend/src/apis/utilizer-grant/utilizer-grant.service.ts`, `utilizer-grant.module.ts`, `utilizer-grant.service.spec.ts`
- Modify: `backend/src/apis/utilizer-grant/real-estate-contract.privacy.ts`, `real-estate-contract.privacy.spec.ts`
- Modify: `backend/src/apis/contracts/entity/contract.entity.ts`, `backend/src/apis/consip-agreement/entity/consip-agreement.entity.ts` (+ i rispettivi `*.module.ts` se registrano `Supplier`)
- Modify: `backend/src/apis/utility/utility.service.ts`, `backend/src/apis/utility/dto/search-utility.dto.ts`, `backend/src/apis/utility/utility.service.spec.ts`
- Modify: `backend/src/apis/asset/assets.service.ts`
- Modify: `backend/src/app.module.ts`
- Delete: `backend/src/apis/utilizer/`, `backend/src/apis/suppliers/`, `backend/src/apis/shared/entities/supplier.entity.ts`

**Interfaces:**
- Consumes: `ThirdParty` (Task 3), `maskParty`, `FULL_ACCESS_ROLES` (Task 2).
- Produces:
  - `UtilizerGrant.parties: ThirdParty[]` (join table `utilizer_grant_parties`, colonne `utilizer_grant_id`, `third_party_id`); colonna `utilizer_id_fk` rimossa dall'entity;
  - DTO contratto immobiliare: `party_ids: number[]` (create: obbligatorio, almeno 1; update: facoltativo, se presente almeno 1); ricerca: `party_id?: number`;
  - `Contract.supplier: ThirdParty`, `ConsipAgreement.supplier: ThirdParty` (ManyToOne);
  - ricerca utenze: `party_id?: number` al posto di `user_id_fk`;
  - privacy: `maskContract(grant, role)` maschera `grant.parties`.

- [ ] **Step 1: Entity contratto immobiliare**

In `utilizer-grant.entity.ts`:
- togliere `import { Utilizer } from '@apis/utilizer/entity/utilizer.entity';`, aggiungere `import { ThirdParty } from '@apis/third-parties/entity/third-party.entity';`;
- togliere la colonna `utilizer_id_fk` e la relazione `utilizer`;
- aggiungere:

```ts
  // Parti del contratto (co-intestatari): almeno una.
  @ManyToMany(() => ThirdParty)
  @JoinTable({
    name: 'utilizer_grant_parties',
    joinColumn: { name: 'utilizer_grant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'third_party_id', referencedColumnName: 'id' },
  })
  parties: ThirdParty[];
```

- aggiornare il commento in testa ("Tabella utilizer_grant invariata per non toccare join e import esistenti.") in "Tabella utilizer_grant invariata per non toccare join esistenti.".

- [ ] **Step 2: DTO contratto immobiliare**

`create-utilizer-grant.dto.ts`: sostituire il blocco `utilizer_id_fk` con

```ts
  @IsArray({ message: 'Indicare le parti del contratto.' })
  @ArrayMinSize(1, { message: 'Indicare almeno una parte del contratto.' })
  @IsInt({ each: true })
  party_ids: number[];
```

(`ArrayMinSize` da `class-validator`). `update-utilizer-grant.dto.ts`: stesso blocco preceduto da `@IsOptional()` e campo `party_ids?: number[]`; togliere `utilizer_id_fk`. `search-utilizer-grant.dto.ts`: rinominare `utilizer_id_fk?: number;` in `party_id?: number;` mantenendo i decorator esistenti (se c'è un `@Type(() => Number)`/`@IsInt`, restano).

- [ ] **Step 3: Test del service contratti immobiliari (rosso)**

In `utilizer-grant.service.spec.ts`: sostituire ogni `utilizer_id_fk: N` nei payload con `party_ids: [N]`; aggiungere un repository mock per `ThirdParty` nel modulo di test (`{ provide: getRepositoryToken(ThirdParty), useValue: { count: jest.fn().mockResolvedValue(1) } }`) e questi casi:

```ts
  it('create rifiuta parti inesistenti', async () => {
    partyRepo.count.mockResolvedValueOnce(0);
    await expect(service.create({ ...validDto, party_ids: [999] } as never, 1)).rejects.toThrow(
      'Una o più parti non esistono o sono state eliminate.',
    );
  });

  it('update senza party_ids non tocca le parti', async () => {
    // payload dalla catena navigatore: nessun party_ids
    await service.update(1, { subject: 'x' } as never, 1);
    expect(repo.save).not.toHaveBeenCalledWith(expect.objectContaining({ parties: expect.anything() }));
  });
```

(`validDto`, `repo`, `partyRepo` sono i nomi da usare/aggiungere nello spec esistente; adattare ai nomi già presenti nel file.)

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant --maxWorkers=2` → FAIL.

- [ ] **Step 4: Service contratti immobiliari**

`utilizer-grant.module.ts`: aggiungere `ThirdParty` a `TypeOrmModule.forFeature([...])`.

`utilizer-grant.service.ts`:
- `relations`: sostituire `'utilizer'`, `'parent.utilizer'`, `'children.utilizer'` con `'parties'`, `'parent.parties'`, `'children.parties'`;
- costruttore: aggiungere `@InjectRepository(ThirdParty) private readonly partyRepo: Repository<ThirdParty>,`;
- `FILTERS_HANDLED_HERE`: aggiungere `'party_id'`;
- `findAll`: sostituire `qb.leftJoinAndSelect('UtilizerGrant.utilizer', 'utilizer', 'utilizer.deleted = 0');` con `qb.leftJoinAndSelect('UtilizerGrant.parties', 'party', 'party.deleted = 0');`; aggiungere dopo il filtro `asset_id`:

```ts
    if (filters.party_id) {
      qb.andWhere(
        'UtilizerGrant.id IN (SELECT gp.utilizer_grant_id FROM utilizer_grant_parties gp WHERE gp.third_party_id = :fParty)',
        { fParty: filters.party_id },
      );
    }
```

  e nel filtro `q` sostituire `utilizer.name LIKE :q` con una sottoquery (così l'elenco parti del contratto trovato resta completo):

```ts
        '(UtilizerGrant.id IN (SELECT gp.utilizer_grant_id FROM utilizer_grant_parties gp JOIN third_parties tp ON tp.id = gp.third_party_id WHERE tp.company_name LIKE :q OR tp.last_name LIKE :q OR tp.first_name LIKE :q) OR UtilizerGrant.subject LIKE :q OR UtilizerGrant.concession_act LIKE :q OR UtilizerGrant.registration_ref LIKE :q OR asset.asset_name LIKE :q)',
```

- `create`: `const { asset_ids, party_ids, ...rest } = dto;` poi `const parties = await this.resolveParties(party_ids);` e `parties` nell'oggetto passato a `this.repo.create({...})` accanto ad `assets`;
- `update`: `const { asset_ids, party_ids, ...rest } = dto;` e dopo il blocco `asset_ids`:

```ts
    if (party_ids !== undefined) {
      const entity = await this.repo.findOne({ where: { id }, relations: { parties: true } });
      entity.parties = await this.resolveParties(party_ids);
      await this.repo.save(entity);
    }
```

- nuovo metodo accanto a `resolveAssets`:

```ts
  private async resolveParties(partyIds: number[]): Promise<ThirdParty[]> {
    const ids = [...new Set(partyIds)];
    const found = await this.partyRepo.count({ where: { id: In(ids), deleted: false } });
    if (found !== ids.length)
      throw new BadRequestException('Una o più parti non esistono o sono state eliminate.');
    return ids.map((partyId) => ({ id: partyId }) as ThirdParty);
  }
```

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant --maxWorkers=2` → PASS (privacy spec ancora rosso: Step 5).

- [ ] **Step 5: Privacy contratti immobiliari**

`real-estate-contract.privacy.ts` diventa:

```ts
import { FULL_ACCESS_ROLES, maskParty } from '@apis/third-parties/third-party.privacy';
import { ThirdPartyType } from '@apis/third-parties/enum/third-party.enum';

// CF e telefono delle parti persone fisiche visibili solo ad Admin/Operatore,
// anche nelle risposte annidate di immobili e utenze.
interface PartyLike {
  type?: ThirdPartyType | null;
  tax_code?: string | null;
  phone?: string | null;
}

export function maskContract<T extends { parties?: PartyLike[] }>(grant: T, role?: string): T {
  if (!grant?.parties || FULL_ACCESS_ROLES.has(role ?? '')) return grant;
  return { ...grant, parties: grant.parties.map((p) => maskParty(p, role)) };
}

export function maskAssetGrants<T extends { utilizerGrants?: unknown[] }>(asset: T, role?: string): T {
  if (!asset?.utilizerGrants || FULL_ACCESS_ROLES.has(role ?? '')) return asset;
  return {
    ...asset,
    utilizerGrants: asset.utilizerGrants.map((g) => maskContract(g as never, role)),
  };
}

export function maskUtility<T extends { assets?: { utilizerGrants?: unknown[] }[] }>(
  utility: T,
  role?: string,
): T {
  if (!utility?.assets || FULL_ACCESS_ROLES.has(role ?? '')) return utility;
  return { ...utility, assets: utility.assets.map((a) => maskAssetGrants(a, role)) };
}
```

`real-estate-contract.privacy.spec.ts`: sostituire il fixture con

```ts
const grant = () => ({
  id: 1,
  parties: [
    { id: 2, type: ThirdPartyType.NATURAL, last_name: 'Rossi', first_name: 'Mario', tax_code: 'RSSMRA80A01H501U', phone: '333' },
    { id: 3, type: ThirdPartyType.LEGAL, company_name: 'ACA', tax_code: '91015370686', phone: '085' },
  ],
});
```

e le asserzioni: Admin/Operatore vedono `parties[0].tax_code`; Lettore e ruolo assente → `parties[0].tax_code` e `parties[0].phone` `null`, `parties[1].tax_code` invariato; `maskAssetGrants`/`maskUtility` mascherano `utilizerGrants[0].parties[0].tax_code`. Eliminare il test di `maskUtilizer` (funzione rimossa). Import di `ThirdPartyType` da `@apis/third-parties/enum/third-party.enum`.

Il controller (`getOne`) usa già `maskContract` su `parent` e `children`: nessuna modifica.

- [ ] **Step 6: Fornitori su `ThirdParty`**

`contracts/entity/contract.entity.ts`: import `ThirdParty` al posto di `Supplier`; relazione:

```ts
  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'supplier_id_fk' })
  supplier: ThirdParty;
```

`consip-agreement/entity/consip-agreement.entity.ts`: import `ThirdParty`, `ManyToOne` al posto di `OneToOne` (togliere `OneToOne` dagli import se non usato altrove nel file):

```ts
  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'supplier_id' })
  supplier: ThirdParty;
```

`grep -rn "Supplier\b" backend/src --include=*.ts` → sostituire nei `*.module.ts` (`TypeOrmModule.forFeature`) `Supplier` con `ThirdParty`, o rimuoverlo se il modulo non lo usa direttamente.

- [ ] **Step 7: Utenze e immobili**

`utility.service.ts`, nelle tre query (righe ~226, ~439, ~468): sostituire

```ts
    qb.leftJoinAndSelect('utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0');
```

con

```ts
    qb.leftJoinAndSelect('utilizerGrants.parties', 'grantParties', 'grantParties.deleted = 0');
```

e il filtro (riga ~254) con una sottoquery (l'elenco parti resta completo):

```ts
    if (filters.party_id) {
      qb.andWhere(
        `Utility.id IN (SELECT ua.utility_id FROM utility_assets ua
           JOIN utilizer_grant_assets uga ON uga.asset_id = ua.asset_id
           JOIN utilizer_grant g ON g.id = uga.utilizer_grant_id AND g.deleted = 0
           JOIN utilizer_grant_parties gp ON gp.utilizer_grant_id = g.id
           WHERE gp.third_party_id = :party_id)`,
        { party_id: filters.party_id },
      );
    }
```

Se `user_id_fk` compare in un elenco di chiavi escluse da `applyFilters`, rinominarlo `party_id`. `search-utility.dto.ts:115`: `user_id_fk?: number;` → `party_id?: number;` (stessi decorator). Aggiornare `utility.service.spec.ts` se cita `user_id_fk` o `utilizerGrants.utilizer`.

`assets.service.ts` righe ~95 e ~137: `'utilizerGrants.utilizer', 'utilizer', 'utilizer.deleted = 0'` → `'utilizerGrants.parties', 'grantParties', 'grantParties.deleted = 0'`. Se nello stesso file un `where`/`orderBy` usa l'alias `utilizer.`, passarlo a `grantParties.`.

- [ ] **Step 8: Eliminare i moduli vecchi**

```bash
git rm -r -q backend/src/apis/utilizer backend/src/apis/suppliers backend/src/apis/shared/entities/supplier.entity.ts
```

`app.module.ts`: togliere import e voci `UtilizerModule`, `SuppliersModule`.

Run: `grep -rn "Utilizer\b\|utilizer/\|apis/suppliers\|supplier.entity\|utilizer_id_fk\|user_id_fk\|'utilizer'" backend/src`
Expected: nessun risultato (ok `UtilizerGrant`/`utilizer-grant`/`utilizer_grant`).

- [ ] **Step 9: Type-check e test**

Run: `docker exec utenzepa-api-1 pnpm run type-check` → nessun errore.
Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/utilizer-grant src/apis/utility src/apis/asset src/apis/contracts src/apis/consip-agreement src/apis/third-parties --maxWorkers=2` → PASS.

- [ ] **Step 10: Commit**

```bash
git add -u backend/src
git add backend/src/apis/utilizer-grant backend/src/apis/contracts backend/src/apis/consip-agreement backend/src/apis/utility backend/src/apis/asset backend/src/app.module.ts
git commit -m "feat(backend): contratti e fornitori collegati ai soggetti terzi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -u backend/src` registra le cancellazioni e le modifiche ai file già tracciati; controllare `git status` che non ci siano file estranei.)

---

### Task 5: Migration

**Files:**
- Create: `backend/src/database/migrations/1791500000000-ThirdParties.ts` (scritta prima in scratch)

**Interfaces:**
- Consumes: entity dei Task 3–4.
- Produces: schema `third_parties`, `utilizer_grant_parties`, FK di `contracts.supplier_id_fk` e `consip_agreement.supplier_id` verso `third_parties`; `utilizer`, `suppliers`, `utilizer_grant.utilizer_id_fk` eliminati.

- [ ] **Step 1: Nomi vincoli di TypeORM**

Con il container `api` su questo branch, generare la migration in scratch per leggere i nomi di indici e FK che TypeORM si aspetta:

```bash
docker exec -u root utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate /tmp/ThirdPartiesRef -d src/database/data-source.ts
docker exec utenzepa-api-1 cat /tmp/ThirdPartiesRef-*.ts
```

Annotare: nomi `IDX_…` degli unique su `vat_number`/`tax_code` e dell'indice `created_by_user_id`; nomi `FK_…` di `third_parties` → `system_users`; indici e FK di `utilizer_grant_parties`; FK di `contracts.supplier_id_fk` e `consip_agreement.supplier_id` verso `third_parties`; i nomi da droppare (FK `FK_3ffd48901e416673c6e4a7b724b` di `contracts` verso `suppliers` ed eventuali altri). Ignorare il drift non correlato (vedi CLAUDE.md: `system_users`, `purpose`, …).

- [ ] **Step 2: Scrivere la migration in scratch**

Nello scratchpad (non in `src/database/migrations/`), file `1791500000000-ThirdParties.ts`, sostituendo `<…>` con i nomi annotati allo Step 1:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Soggetti terzi: controparti (utilizer) e fornitori (suppliers) in un'unica
// tabella, id originali conservati (utilizer 961–1274, suppliers 42–54:
// disgiunti). Contratti immobiliari N-N con le parti. Il tipo di ogni
// soggetto ex utilizer è LEGAL provvisorio: si corregge nella pulizia dati.
export class ThirdParties1791500000000 implements MigrationInterface {
  name = 'ThirdParties1791500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`third_parties\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type\` enum ('NATURAL', 'LEGAL') NOT NULL,
        \`company_name\` varchar(255) NULL,
        \`last_name\` varchar(100) NULL,
        \`first_name\` varchar(100) NULL,
        \`vat_number\` varchar(20) NULL,
        \`tax_code\` varchar(16) NULL,
        \`address\` varchar(255) NULL,
        \`city\` varchar(100) NULL,
        \`postal_code\` varchar(10) NULL,
        \`email\` varchar(100) NULL,
        \`pec\` varchar(100) NULL,
        \`phone\` varchar(50) NULL,
        \`contacts\` text NULL,
        \`notes\` text NULL,
        \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`created_by_user_id\` int NOT NULL,
        \`updated_by_user_id\` int NOT NULL,
        \`deleted\` tinyint NOT NULL DEFAULT 0,
        UNIQUE INDEX \`<IDX_vat_number>\` (\`vat_number\`),
        UNIQUE INDEX \`<IDX_tax_code>\` (\`tax_code\`),
        INDEX \`<IDX_created_by>\` (\`created_by_user_id\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB`,
    );
    await q.query(`ALTER TABLE \`third_parties\` ADD CONSTRAINT \`<FK_created_by>\` FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await q.query(`ALTER TABLE \`third_parties\` ADD CONSTRAINT \`<FK_updated_by>\` FOREIGN KEY (\`updated_by_user_id\`) REFERENCES \`system_users\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);

    // Fornitori: tutte le righe, eliminate comprese. La sigla supplier_id si scarta.
    await q.query(
      `INSERT INTO \`third_parties\` (id, type, company_name, vat_number, tax_code, address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, 'LEGAL', company_name, NULLIF(TRIM(vat_number), ''), NULLIF(TRIM(tax_code), ''), address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`suppliers\``,
    );
    // Controparti: nome → denominazione, descrizione → note.
    await q.query(
      `INSERT INTO \`third_parties\` (id, type, company_name, tax_code, contacts, notes, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, 'LEGAL', name, NULLIF(TRIM(tax_code), ''), contacts, description, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`utilizer\``,
    );

    await q.query(
      `CREATE TABLE \`utilizer_grant_parties\` (\`utilizer_grant_id\` int NOT NULL, \`third_party_id\` int NOT NULL, INDEX \`<IDX_ugp_grant>\` (\`utilizer_grant_id\`), INDEX \`<IDX_ugp_party>\` (\`third_party_id\`), PRIMARY KEY (\`utilizer_grant_id\`, \`third_party_id\`)) ENGINE=InnoDB`,
    );
    await q.query(`ALTER TABLE \`utilizer_grant_parties\` ADD CONSTRAINT \`<FK_ugp_grant>\` FOREIGN KEY (\`utilizer_grant_id\`) REFERENCES \`utilizer_grant\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    await q.query(`ALTER TABLE \`utilizer_grant_parties\` ADD CONSTRAINT \`<FK_ugp_party>\` FOREIGN KEY (\`third_party_id\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    await q.query(
      `INSERT INTO \`utilizer_grant_parties\` (utilizer_grant_id, third_party_id)
       SELECT id, utilizer_id_fk FROM \`utilizer_grant\` WHERE utilizer_id_fk IS NOT NULL`,
    );

    await q.query(`ALTER TABLE \`contracts\` DROP FOREIGN KEY \`FK_3ffd48901e416673c6e4a7b724b\``);
    await q.query(`ALTER TABLE \`contracts\` ADD CONSTRAINT \`<FK_contracts_supplier>\` FOREIGN KEY (\`supplier_id_fk\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await q.query(`ALTER TABLE \`consip_agreement\` ADD CONSTRAINT \`<FK_consip_supplier>\` FOREIGN KEY (\`supplier_id\`) REFERENCES \`third_parties\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);

    await q.query(`ALTER TABLE \`utilizer_grant\` DROP COLUMN \`utilizer_id_fk\``);
    await q.query(`DROP TABLE \`utilizer\``);
    await q.query(`DROP TABLE \`suppliers\``);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`suppliers\` (\`id\` int NOT NULL AUTO_INCREMENT, \`supplier_id\` varchar(50) NOT NULL, \`vat_number\` varchar(20) NULL, \`tax_code\` varchar(20) NULL, \`company_name\` varchar(255) NOT NULL, \`address\` varchar(255) NULL, \`city\` varchar(100) NULL, \`postal_code\` varchar(10) NULL, \`email\` varchar(100) NULL, \`pec\` varchar(100) NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, UNIQUE INDEX \`IDX_a2692f796d16e0a30040860112\` (\`supplier_id\`), UNIQUE INDEX \`IDX_aee7c8464d179ea66636906349\` (\`company_name\`), INDEX \`IDX_5fa7dd93144dd478fc3606eda1\` (\`created_by_user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`utilizer\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`description\` varchar(255) NULL, \`tax_code\` varchar(16) NULL, \`contacts\` text NULL, \`create_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`update_date\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`created_by_user_id\` int NOT NULL, \`updated_by_user_id\` int NOT NULL, \`deleted\` tinyint NOT NULL DEFAULT 0, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    // Fornitore = soggetto usato da contratti di fornitura/CONSIP o con id < 961
    // (range originale suppliers); gli altri tornano controparti. La sigla
    // ripristinata è la denominazione con suffisso id (unicità).
    await q.query(
      `INSERT INTO \`suppliers\` (id, supplier_id, vat_number, tax_code, company_name, address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, LEFT(CONCAT(COALESCE(company_name, CONCAT_WS(' ', last_name, first_name)), ' #', id), 50), vat_number, tax_code, CONCAT(COALESCE(company_name, CONCAT_WS(' ', last_name, first_name)), ' #', id), address, city, postal_code, email, pec, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`third_parties\` tp
       WHERE tp.id < 961
          OR EXISTS (SELECT 1 FROM contracts c WHERE c.supplier_id_fk = tp.id)
          OR EXISTS (SELECT 1 FROM consip_agreement ca WHERE ca.supplier_id = tp.id)`,
    );
    await q.query(
      `INSERT INTO \`utilizer\` (id, name, description, tax_code, contacts, create_date, update_date, created_by_user_id, updated_by_user_id, deleted)
       SELECT id, LEFT(COALESCE(company_name, CONCAT_WS(' ', last_name, first_name)), 255), LEFT(notes, 255), tax_code, contacts, create_date, update_date, created_by_user_id, updated_by_user_id, deleted
       FROM \`third_parties\` tp
       WHERE tp.id NOT IN (SELECT id FROM \`suppliers\`)`,
    );
    await q.query(`ALTER TABLE \`utilizer_grant\` ADD \`utilizer_id_fk\` int NULL`);
    // Di più parti si conserva la prima.
    await q.query(
      `UPDATE \`utilizer_grant\` g SET g.utilizer_id_fk = (SELECT MIN(gp.third_party_id) FROM \`utilizer_grant_parties\` gp WHERE gp.utilizer_grant_id = g.id)`,
    );
    await q.query(`ALTER TABLE \`consip_agreement\` DROP FOREIGN KEY \`<FK_consip_supplier>\``);
    await q.query(`ALTER TABLE \`contracts\` DROP FOREIGN KEY \`<FK_contracts_supplier>\``);
    await q.query(`ALTER TABLE \`contracts\` ADD CONSTRAINT \`FK_3ffd48901e416673c6e4a7b724b\` FOREIGN KEY (\`supplier_id_fk\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await q.query(`DROP TABLE \`utilizer_grant_parties\``);
    await q.query(`DROP TABLE \`third_parties\``);
  }
}
```

Note:
- `utilizer_grant.utilizer_id_fk` era `NOT NULL` nella colonna originale: il `down()` la ricrea `NULL` (un contratto senza parti dopo la pulizia non avrebbe valore). Accettato: il `down()` è un rollback d'emergenza.
- Se lo Step 1 mostra per `suppliers.created_by_user_id`/`updated_by_user_id` FK dirette (`FK_5fa7dd93144dd478fc3606eda1d`, `FK_772718e7d80332bdde12cd6f52a`), il `down()` le ricrea dopo l'`INSERT` con gli stessi nomi.
- La riga `DROP FOREIGN KEY` su `contracts` usa il nome reale del DB locale (`SHOW CREATE TABLE contracts`): verificarlo anche in produzione prima del rilascio (stesso schema da `InitialSchema`, atteso identico).

- [ ] **Step 3: Backup del DB locale**

Da UI (Impostazioni → Backup e manutenzione → "Crea backup ora") oppure:

```bash
docker exec utenzepa-mysql-1 sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" mydatabase > /tmp/pre-third-parties.sql'
```

- [ ] **Step 4: Applicare**

```bash
cp <scratch>/1791500000000-ThirdParties.ts backend/src/database/migrations/
docker restart utenzepa-api-1
docker logs -f --since 30s utenzepa-api-1
```

Attendere "Found 0 errors" e l'avvio. Verifica (query su una riga):

```bash
docker exec utenzepa-mysql-1 mysql -uroot -p'<MYSQL_PASSWORD da .env>' mydatabase -e "SELECT type, COUNT(*), SUM(deleted) FROM third_parties GROUP BY type; SELECT COUNT(*) FROM utilizer_grant_parties; SELECT COUNT(*) FROM utilizer_grant WHERE deleted=0 AND id NOT IN (SELECT utilizer_grant_id FROM utilizer_grant_parties); SHOW TABLES LIKE 'utilizer';"
```

Expected: 327 righe (`LEGAL`, 13 + 314), di cui 102 eliminate (+ eventuali fornitori eliminati); 129 o più righe in `utilizer_grant_parties` (una per contratto, eliminati compresi); 0 contratti attivi senza parti; nessuna tabella `utilizer`.

- [ ] **Step 5: Rollback e riapplicazione**

```bash
docker exec utenzepa-api-1 node -r ts-node/register -r tsconfig-paths/register node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts
```

Verifica: `SELECT COUNT(*) FROM utilizer; SELECT COUNT(*) FROM suppliers; SELECT COUNT(*) FROM utilizer_grant WHERE utilizer_id_fk IS NULL;` → 314, 13, 0. Poi `docker restart utenzepa-api-1` (riapplica `up`) e ripetere la verifica dello Step 4.

- [ ] **Step 6: Drift**

Rigenerare come allo Step 1 (`/tmp/ThirdPartiesCheck`): nessuno statement su `third_parties`, `utilizer_grant_parties`, `contracts.supplier_id_fk`, `consip_agreement.supplier_id` (resta solo il drift preesistente noto). Se compaiono differenze di nome, correggere la migration e ripetere Step 5.

- [ ] **Step 7: Smoke API**

Login via API (`POST /api/v1/authModule/login`, vedi CLAUDE.md) e `GET /api/v1/third-parties?roles=supplier` (curl con `dangerouslyDisableSandbox`, porta da `.env`): elenco con i fornitori usati dai contratti, `roles` valorizzato. `GET /api/v1/utilizer-grant/1` → `parties` popolato.

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/migrations/1791500000000-ThirdParties.ts
git commit -m "feat(db): migration soggetti terzi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Anomalie

**Files:**
- Modify: `backend/src/apis/anomalies/anomalies.service.ts`
- Test: `backend/src/apis/anomalies/anomalies.service.spec.ts`

**Interfaces:**
- Consumes: `partyNameSql` (Task 2).
- Produces: in `Anomalies` due liste nuove:
  - `real_estate_contracts_without_parties: AnomalyList<{ id: number; subject: string | null }>`
  - `third_parties_without_identifier: AnomalyList<{ id: number; name: string; type: string }>`
  e `ContractAnomaly.supplier` / `RealEstateContractAnomaly.counterparty` valorizzati con il nome del soggetto.

- [ ] **Step 1: Test (rosso)**

Nello spec esistente, il mock di `dataSource.query` restituisce un array per chiamata in ordine: aggiungere in coda due risultati e le asserzioni:

```ts
    expect(result.real_estate_contracts_without_parties).toEqual({ count: 1, items: [{ id: 12, subject: 'Chiosco' }] });
    expect(result.third_parties_without_identifier).toEqual({
      count: 1,
      items: [{ id: 1207, name: 'Rossi Mario', type: 'LEGAL' }],
    });
```

con i due mock `[{ id: '12', subject: 'Chiosco' }]` e `[{ id: '1207', name: 'Rossi Mario', type: 'LEGAL' }]` (stesso ordine delle query aggiunte allo Step 2). Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2` → FAIL.

- [ ] **Step 2: Implementazione**

- import `partyNameSql` da `@apis/third-parties/third-party.name`;
- `contractsWithoutCig`: `s.supplier_id AS supplier` → `${partyNameSql('s')} AS supplier`; `LEFT JOIN suppliers s` → `LEFT JOIN third_parties s`; `ORDER BY s.supplier_id, c.id` → `ORDER BY supplier, c.id`;
- `currentContractsList`: `IFNULL(s.supplier_id, '?')` → `IFNULL(${partyNameSql('s')}, '?')`; `LEFT JOIN suppliers s` → `LEFT JOIN third_parties s`;
- `contractsWithoutAssets`: query diventa

```ts
      `SELECT g.id,
              (SELECT GROUP_CONCAT(${partyNameSql('tp')} ORDER BY tp.id SEPARATOR ', ')
                 FROM utilizer_grant_parties gp JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
                WHERE gp.utilizer_grant_id = g.id) AS counterparty,
              g.subject
         FROM utilizer_grant g
         WHERE g.deleted = 0
           AND NOT EXISTS (SELECT 1 FROM utilizer_grant_assets a JOIN assets s ON s.id = a.asset_id AND s.deleted = 0
                           WHERE a.utilizer_grant_id = g.id)
         ORDER BY counterparty, g.id`,
```

- dopo `contractsWithoutAssets` (stesso ordine dei mock):

```ts
    const contractsWithoutParties: { id: unknown; subject: string | null }[] = await this.dataSource.query(
      `SELECT g.id, g.subject FROM utilizer_grant g
        WHERE g.deleted = 0
          AND NOT EXISTS (SELECT 1 FROM utilizer_grant_parties gp JOIN third_parties tp ON tp.id = gp.third_party_id AND tp.deleted = 0
                          WHERE gp.utilizer_grant_id = g.id)
        ORDER BY g.id`,
    );

    // Identificativo obbligatorio: P.IVA per i giuridici, CF per le persone.
    const partiesWithoutIdentifier: { id: unknown; name: string; type: string }[] = await this.dataSource.query(
      `SELECT tp.id, ${partyNameSql('tp')} AS name, tp.type FROM third_parties tp
        WHERE tp.deleted = 0
          AND ((tp.type = 'LEGAL' AND IFNULL(TRIM(tp.vat_number), '') = '')
            OR (tp.type = 'NATURAL' AND IFNULL(TRIM(tp.tax_code), '') = ''))
        ORDER BY name`,
    );
```

Verificare l'ordine reale delle chiamate `query` nel metodo (le nuove due vanno subito dopo `contractsWithoutAssets`) e allineare i mock dello spec.

- interfaccia `Anomalies`: aggiungere i due campi; nel `return`:

```ts
      real_estate_contracts_without_parties: list(
        contractsWithoutParties.map((c) => ({ id: Number(c.id), subject: c.subject ?? null })),
      ),
      third_parties_without_identifier: list(
        partiesWithoutIdentifier.map((p) => ({ id: Number(p.id), name: p.name, type: p.type })),
      ),
```

- [ ] **Step 3: Test verdi e commit**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/anomalies --maxWorkers=2` → PASS.

```bash
git add backend/src/apis/anomalies
git commit -m "feat(backend): anomalie su parti e identificativo fiscale dei soggetti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — modello, service, nome soggetto ovunque

**Files:**
- Create: `frontend/src/app/pages/third-parties/entity/third-party.entity.ts`
- Create: `frontend/src/app/pages/third-parties/third-party.model.ts`
- Create: `frontend/src/app/pages/third-parties/third-parties.service.ts`
- Create: `frontend/src/app/core/helpers/party-name.helper.ts`
- Modify: entity/interface di `contracts`, `consip-agreement`, `utilities`, `utilizer-grant`
- Modify: `contracts/contract-edit-dialog.component.ts`, `contracts/contract-filter-dialog.component.ts`, `contracts/data-table-contracts.component.html`
- Modify: `consip-agreement/consip-agreement-edit-dialog.component.ts`, `consip-agreement/consip-agreement-filter-dialog.component.ts`, `consip-agreement/data-table-consip-agreement.component.html`
- Modify: `invoices/data-table-invoices.component.html`, `invoices/data-table-invoices.component.ts`, `invoices/invoice-edit-dialog.component.ts`
- Modify: `dashboard/dashboard.component.ts`, `dashboard/dashboard.component.html`
- Modify: `utilities/data-table-utilities.component.ts`, `utilities/data-table-utilities.component.html`, `utilities/utility-edit-dialog.component.ts`, `utilities/utility-filter-dialog.component.ts`
- Modify: `assets/asset-edit-dialog.component.ts`
- Modify: `utilizer-grant/data-table-utilizer-grant.component.ts`, `utilizer-grant/data-table-utilizer-grant.component.html`, `utilizer-grant/utilizer-grant-filter-dialog.component.ts`

**Interfaces:**
- Consumes: API del Task 3–4 (`/third-parties`, `parties`, `party_id`).
- Produces:
  - `class ThirdParty extends AbstractEntity` con i campi dell'entity backend + `roles: PartyRole[]`;
  - `enum ThirdPartyType`, `enum PartyRole`, `ROLE_LABEL: Record<PartyRole, string>`, `TYPE_LABEL: Record<ThirdPartyType, string>`;
  - `partyName(p): string` e `partyNames(ps: PartyNameFields[] | null | undefined): string` (nomi uniti da ", ") in `core/helpers/party-name.helper.ts`;
  - `partyIdentifier(p: ThirdParty): string` (P.IVA per giuridici, CF per persone) in `third-party.model.ts`;
  - `ThirdPartiesService extends AbstractService<ThirdParty>`, base URL `/third-parties`.

- [ ] **Step 1: Modello**

`core/helpers/party-name.helper.ts` (in `core/`, senza import da `pages/`):

```ts
// Nome visualizzato di un soggetto terzo: denominazione per i giuridici,
// "Cognome Nome" per le persone fisiche. Stessa regola del backend.
export interface PartyNameFields {
  type?: string | null;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
}

export function partyName(p: PartyNameFields | null | undefined): string {
  if (!p) return '';
  const person = [p.last_name, p.first_name].filter(Boolean).join(' ');
  return p.type === 'NATURAL' ? person : (p.company_name ?? person);
}

export function partyNames(ps: PartyNameFields[] | null | undefined): string {
  return (ps ?? []).map(partyName).filter(Boolean).join(', ');
}
```

`pages/third-parties/third-party.model.ts`:

```ts
export enum ThirdPartyType {
  NATURAL = 'NATURAL',
  LEGAL = 'LEGAL',
}

export enum PartyRole {
  SUPPLIER = 'supplier',
  LESSOR = 'lessor',
  TENANT = 'tenant',
  UNLINKED = 'unlinked',
}

export const TYPE_LABEL: Record<ThirdPartyType, string> = {
  [ThirdPartyType.LEGAL]: 'Soggetto giuridico',
  [ThirdPartyType.NATURAL]: 'Persona fisica',
};

export const ROLE_LABEL: Record<PartyRole, string> = {
  [PartyRole.SUPPLIER]: 'Fornitore',
  [PartyRole.LESSOR]: 'Locatore',
  [PartyRole.TENANT]: 'Conduttore',
  [PartyRole.UNLINKED]: 'Senza collegamenti',
};

export function partyIdentifier(p: {type?: string | null; vat_number?: string | null; tax_code?: string | null}): string {
  return (p.type === ThirdPartyType.NATURAL ? p.tax_code : p.vat_number) ?? '';
}
```

`pages/third-parties/entity/third-party.entity.ts`:

```ts
import {plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../../../core/entities/abstract.entity';
import {PartyRole, ThirdPartyType} from '../third-party.model';

export class ThirdParty extends AbstractEntity {
  type!: ThirdPartyType;
  company_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  vat_number?: string | null;
  // Persone fisiche: null per il Lettore (oscurato dal backend), come phone.
  tax_code?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  contacts?: string | null;
  notes?: string | null;
  // Calcolati dal backend dai collegamenti.
  roles: PartyRole[] = [];

  static create(data?: Partial<ThirdParty>): ThirdParty {
    return plainToInstance(ThirdParty, {type: ThirdPartyType.LEGAL, deleted: false, roles: [], ...data});
  }
}
```

(Verificare con `cat frontend/src/app/core/entities/abstract.entity.ts` che `AbstractEntity` dichiari `id`, `deleted`, date e `updated_by`; se `updated_by` non c'è, aggiungerlo qui come in `Utilizer`/`IUtilizer`: `updated_by?: {id: number; name: string} | null;`.)

`pages/third-parties/third-parties.service.ts`:

```ts
import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {AbstractService} from '../../core/services/abstract.service';
import {ThirdParty} from './entity/third-party.entity';

@Injectable({providedIn: 'root'})
export class ThirdPartiesService extends AbstractService<ThirdParty> {
  protected override readonly BASE_URL = environment.apiUrl + '/third-parties';
  protected override readonly entityClass = ThirdParty;
}
```

- [ ] **Step 2: Entity che puntavano a Supplier/Utilizer**

- `contracts/entity/contract.entity.ts`: `import {ThirdParty} from '../../third-parties/entity/third-party.entity';` al posto di `Supplier`; `supplier?: ThirdParty;`.
- `utilities/entity/utility.entity.ts`: idem (`supplier?: ThirdParty;`).
- `consip-agreement/entity/consip-agreement.entity.ts`: `supplier?: ThirdParty;`; `consip-agreement.interface.ts`: togliere `ISupplier`, `supplier?: {type?: string | null; company_name?: string | null; last_name?: string | null; first_name?: string | null};`.
- `utilizer-grant/entity/utilizer-grant.entity.ts`: togliere `Utilizer` e `utilizer_id_fk`; aggiungere `party_ids!: number[];` e `parties?: ThirdParty[];`; in `create()` sostituire `utilizer_id_fk: null` con `party_ids: []`. `utilizer-grant.interface.ts`: togliere `IUtilizer`, `utilizer_id_fk`, `utilizer`; aggiungere `party_ids: number[];` e `parties?: {id: number; type?: string | null; company_name?: string | null; last_name?: string | null; first_name?: string | null}[];`.

Se il contratto immobiliare viene trasformato in payload con una funzione che copia i campi (cercare `utilizer_id_fk` in `pages/utilizer-grant/*.ts` e in `core/services/entity-navigator.service.ts`), sostituire con `party_ids` ricavato da `parties` quando assente: `party_ids: item.party_ids?.length ? item.party_ids : (item.parties ?? []).map(p => p.id)`.

- [ ] **Step 3: Etichette fornitore**

Ovunque si mostrava la sigla, usare `partyName(…)` (import da `core/helpers/party-name.helper`; nei template esporre il metodo sul componente: `readonly partyName = partyName;`):

- `contracts/data-table-contracts.component.html:70`: `{{ item.supplier?.supplier_id || 'N/D' }}` → `{{ partyName(item.supplier) || 'N/D' }}`;
- `contracts/contract-edit-dialog.component.ts`: `SuppliersService` → `ThirdPartiesService`; opzioni fornitore:

```ts
    this.thirdPartiesService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .filter(p => p.type === 'LEGAL' || p.roles?.includes(PartyRole.SUPPLIER) || p.id === this.data.item.supplier_id_fk)
        .map(p => ({label: partyName(p), value: p.id, sublabel: p.vat_number ?? undefined}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
```

  e `supplierName()`: `?? this.data.item.supplier?.supplier_id ?? ''` → `?? partyName(this.data.item.supplier)`;
- `contracts/contract-filter-dialog.component.ts`: `ThirdPartiesService`, `search({deleted: false, roles: PartyRole.SUPPLIER} as never)`, label `partyName(s)`;
- `consip-agreement/consip-agreement-edit-dialog.component.ts` e `consip-agreement-filter-dialog.component.ts`: `SuppliersService` → `ThirdPartiesService`; opzioni come nel dialog contratto (edit) e con `roles: PartyRole.SUPPLIER` (filtro); `data-table-consip-agreement.component.html:48`: `{{ item.supplier?.company_name }}` → `{{ partyName(item.supplier) }}`;
- `invoices/data-table-invoices.component.html:80-82`: `matColumnDef="contratto.supplier.supplier_id"` → `matColumnDef="contratto.supplier"`, cella `{{ partyName(item.contratto?.supplier) || 'N/D' }}`; `data-table-invoices.component.ts:43,51`: campo `'contratto.supplier.supplier_id'` → `'contratto.supplier'`; se il componente ha `exportCellValue`/ordinamento per campo, aggiungere il caso `'contratto.supplier'` → `partyName(item.contratto?.supplier)`;
- `invoices/invoice-edit-dialog.component.ts:44,81`: `?.supplier?.supplier_id ?? null` → `partyName(...supplier) || null`;
- `dashboard/dashboard.component.html:110`: `{{ item.contract.supplier?.supplier_id ?? '—' }}` → `{{ partyName(item.contract.supplier) || '—' }}`; `dashboard.component.ts`: `SuppliersService` → `ThirdPartiesService`, conteggio: `this.thirdPartiesService.search({roles: PartyRole.SUPPLIER} as never).subscribe(list => this.suppliersCount = list.length);`;
- `utilities/data-table-utilities.component.html:65-67`, `.ts:47,88`: `supplier.company_name` → `partyName(item.supplier)` nella cella, `field` invariato o `'supplier'` + caso in `exportCellValue` come per le fatture;
- `utilities/utility-edit-dialog.component.ts:206,300`: `c.supplier?.supplier_id ?? ''` → `partyName(c.supplier)`; `sublabel: c.supplier?.supplier_id ?? undefined` → `sublabel: partyName(c.supplier) || undefined`;
- `utilities/utility-filter-dialog.component.ts`: `SuppliersService` → `ThirdPartiesService` con `roles: PartyRole.SUPPLIER`; `UtilizerService` sostituito dallo stesso service con `roles: 'lessor,tenant'`, label `partyName(u)`; campo `user_id_fk` → `party_id` (interfaccia valori, form control e template).

Run: `grep -rn "supplier_id\b\|supplier?\.supplier_id\|SuppliersService" frontend/src/app` → restano solo `consip-agreement` `supplier_id` (FK numerica, legittima) e `supplier_id_fk`.

- [ ] **Step 4: Etichette controparte**

- `utilities/data-table-utilities.component.ts:193-199`: `getUtilizersNames` diventa `getPartiesNames`:

```ts
  getPartiesNames(utility: Utility): string {
    return [...new Set((utility.assets ?? [])
      .flatMap(a => a.utilizerGrants ?? [])
      .flatMap(g => (g.parties ?? []).map(partyName))
      .filter(n => !!n))]
      .join(', ');
  }
```

  aggiornare le chiamate (riga ~135 e ~253) e il template (`data-table-utilities.component.html:254-…`). L'id colonna `asset.utilizer` può restare (è solo una chiave interna): rinominarlo `asset.parties` ovunque nel file `.ts` e `.html` per pulizia.
- `utilities/utility-edit-dialog.component.ts:520`: `(a.utilizerGrants ?? []).map(g => g.utilizer?.name ?? '').filter(n => !!n)` → `(a.utilizerGrants ?? []).flatMap(g => (g.parties ?? []).map(partyName)).filter(n => !!n)`.
- `assets/asset-edit-dialog.component.ts:190`: `value: g => g.utilizer?.name ?? ''` → `value: g => partyNames(g.parties)`; `:357`: `label: g.utilizer?.name ?? \`#${g.id}\`` → `label: partyNames(g.parties) || \`#${g.id}\``.
- `utilizer-grant/data-table-utilizer-grant.component.html:74`: `item.utilizer?.name` → `partyNames(item.parties)` (sia `matTooltip` sia `truncate(...)`); `.ts:127-128`: caso `'utilizer'` → `return partyNames(item.parties);`. Se la colonna si chiama `utilizer` in `displayedColumns`/definizioni colonne, rinominarla `parties` ovunque nel componente; intestazione "Controparti".
- `utilizer-grant/utilizer-grant-filter-dialog.component.ts`: `UtilizerService` → `ThirdPartiesService` (`roles: 'lessor,tenant'`), label `StringHelper.truncateAt(partyName(u), 50)`; campo `utilizer_id_fk` → `party_id` (interfaccia riga 33, form riga 149, template riga 104), etichetta "Parte".

- [ ] **Step 5: Compilazione**

Run: `grep -rn "utilizer?\.\|\.utilizer\b\|UtilizerService\|utilizer_id_fk\|user_id_fk" frontend/src/app --include=*.ts --include=*.html | grep -v "^frontend/src/app/pages/utilizer/"`
Expected: nessun risultato fuori da `pages/utilizer/` (eliminata nel Task 9) e dal dialog contratto immobiliare (Task 8).

Il frontend non compila ancora finché il Task 8 non sistema il dialog contratto immobiliare: verificare con `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` che gli unici errori residui siano in `utilizer-grant-edit-dialog.component.*` e `pages/utilizer/`, `pages/suppliers/`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/helpers/party-name.helper.ts frontend/src/app/pages/third-parties frontend/src/app/pages/contracts frontend/src/app/pages/consip-agreement frontend/src/app/pages/invoices frontend/src/app/pages/dashboard/dashboard.component.ts frontend/src/app/pages/dashboard/dashboard.component.html frontend/src/app/pages/utilities frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/entity frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.html frontend/src/app/pages/utilizer-grant/utilizer-grant-filter-dialog.component.ts
git commit -m "feat(frontend): nome del soggetto terzo al posto di sigla e controparte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — contratto immobiliare con più parti

**Files:**
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts`
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html`

**Interfaces:**
- Consumes: `ThirdPartiesService`, `partyName`, `partyNames` (Task 7); `MultiSelectComponent` (`core/components/multi-select.component.ts`, `ControlValueAccessor` con valore array).
- Produces: form con `party_ids: number[]` (required, almeno 1), inviato al backend.

- [ ] **Step 1: Componente**

`utilizer-grant-edit-dialog.component.ts`:
- `UtilizerService` → `ThirdPartiesService`; `utilizerOptions` → `partyOptions`;
- import `MultiSelectComponent` e aggiungerlo agli `imports` del componente;
- form: `utilizer_id_fk: [this.item.utilizer_id_fk ?? null, Validators.required],` →

```ts
    party_ids: [
      this.item.party_ids?.length ? this.item.party_ids : (this.item.parties ?? []).map(p => p.id),
      Validators.required,
    ],
```

  (`Validators.required` su un array vuoto è valido per Angular: aggiungere anche un validatore `minLengthArray`:)

```ts
const atLeastOne = (c: AbstractControl): ValidationErrors | null =>
  Array.isArray(c.value) && c.value.length > 0 ? null : {required: true};
```

  e usare `[..., atLeastOne]` al posto di `Validators.required`;
- caricamento opzioni:

```ts
    this.thirdPartiesService.search({deleted: false}).subscribe({
      next: (data) => {
        this.partyOptions = data
          .map(p => ({label: StringHelper.truncateAt(partyName(p), 100), value: p.id, sublabel: TYPE_LABEL[p.type]}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei soggetti:', err),
    });
```

- `childColumns` (riga ~108): `{label: 'Controparte', value: c => c.utilizer?.name ?? ''}` → `{label: 'Parti', value: c => partyNames(c.parties)}`;
- `parentOptions` (riga ~209): `${g.utilizer?.name ?? ''}` → `${partyNames(g.parties)}`;
- `titleText()`:

```ts
    const ids = this.form.controls.party_ids.value ?? [];
    const names = ids.map(id => this.partyOptions.find(o => o.value === id)?.label).filter(Boolean).join(', ')
      || partyNames(this.item.parties);
    const kind = this.form.controls.kind.value ? KIND_LABEL[this.form.controls.kind.value as ContractKind] : '';
    return [names, kind].filter(Boolean).join(' — ') || `Contratto immobiliare #${this.item.id}`;
```

- `save()`: se costruisce il payload elencando i campi, includere `party_ids` e non `utilizer_id_fk`.

- [ ] **Step 2: Template**

`utilizer-grant-edit-dialog.component.html`:
- riga 20: in `invalid(...)` sostituire `'utilizer_id_fk'` con `'party_ids'`;
- righe ~55-60, il blocco `app-filterable-select` con `[options]="utilizerOptions"`/`formControlName="utilizer_id_fk"` diventa:

```html
            <app-multi-select
              label="Parti del contratto *"
              placeholder="Uno o più soggetti"
              [options]="partyOptions"
              formControlName="party_ids">
            </app-multi-select>
            @if (form.controls.party_ids.invalid && form.controls.party_ids.touched) {
              <div class="field-error">Indicare almeno una parte</div>
            }
```

  (verificare se `MultiSelectComponent` ha un input per l'errore come `FilterableSelectComponent.errorMessage`: `grep -n "@Input" frontend/src/app/core/components/multi-select.component.ts`; se c'è, usarlo al posto del `div`; se il `div` serve, la classe `field-error` va cercata in `styles.scss`, altrimenti usare `<mat-error>` dentro un contenitore come negli altri dialog del progetto — `grep -rn "mat-error" frontend/src/app/pages/plants/plant-edit-dialog.component.html | head -2`.)

- [ ] **Step 3: Compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: errori residui solo in `pages/utilizer/` e `pages/suppliers/` (eliminate nel Task 9).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html
git commit -m "feat(frontend): contratto immobiliare con più parti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — pagina Soggetti terzi con chip rapide

**Files:**
- Create: `frontend/src/app/pages/third-parties/third-parties.component.ts`, `third-parties.component.html`
- Create: `frontend/src/app/pages/third-parties/search-third-parties.component.ts`, `search-third-parties.component.html`
- Create: `frontend/src/app/pages/third-parties/third-party-filter-dialog.component.ts`
- Create: `frontend/src/app/pages/third-parties/data-table-third-parties.component.ts`, `data-table-third-parties.component.html`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/comp/sidebar/sidebar.component.ts`, `frontend/src/app/core/helpers/entity-status.ts`
- Delete: `frontend/src/app/pages/utilizer/`, `frontend/src/app/pages/suppliers/`

**Interfaces:**
- Consumes: Task 7 (model, service, `partyName`, `partyIdentifier`); `AbstractComponent`, `AbstractSearchComponent`, `AbstractDataTableComponent`.
- Produces:
  - route `/third-parties` (supporta `?selectedId=` come le altre pagine se `AbstractComponent` lo gestisce già);
  - `partyRoleBadges(roles: string[]): StatusInfo[]` in `core/helpers/entity-status.ts` (tono `info`, icone: fornitore `local_shipping`, locatore `key`, conduttore `home`).
  - `ThirdPartyEditDialogComponent` è creato nel Task 10: in questo task `editDialogComponent()` lo referenzia già (stesso commit del Task 10 se si preferisce compilare verde a ogni commit: in tal caso eseguire Task 10 Step 1–2 prima dello Step 4 di questo task).

- [ ] **Step 1: Badge ruoli**

In `core/helpers/entity-status.ts`, in fondo:

```ts
const PARTY_ROLE_BADGE: Record<string, StatusInfo> = {
  supplier: {tone: 'info', label: 'Fornitore', icon: 'local_shipping'},
  lessor: {tone: 'info', label: 'Locatore', icon: 'key'},
  tenant: {tone: 'info', label: 'Conduttore', icon: 'home'},
};

export function partyRoleBadges(roles: string[] | null | undefined): StatusInfo[] {
  return (roles ?? []).map(r => PARTY_ROLE_BADGE[r]).filter((b): b is StatusInfo => !!b);
}
```

- [ ] **Step 2: Pagina, ricerca, filtri, tabella**

`third-parties.component.ts`:

```ts
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MatChipsModule} from '@angular/material/chips';
import {AbstractComponent} from '../../core/components/abstract.component';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartiesService} from './third-parties.service';
import {PartyRole, ROLE_LABEL} from './third-party.model';
import {DataTableThirdPartiesComponent} from './data-table-third-parties.component';
import {SearchThirdPartiesComponent} from './search-third-parties.component';

@Component({
  selector: 'app-third-parties',
  standalone: true,
  imports: [MatChipsModule, DataTableThirdPartiesComponent, SearchThirdPartiesComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-parties.component.html',
})
export class ThirdPartiesComponent extends AbstractComponent<ThirdParty> {
  readonly chips = [PartyRole.SUPPLIER, PartyRole.LESSOR, PartyRole.TENANT, PartyRole.UNLINKED]
    .map(role => ({role, label: ROLE_LABEL[role]}));
  selectedRoles: PartyRole[] = [];
  private dialogFilters: Record<string, unknown> = {};

  constructor(protected override service: ThirdPartiesService) {
    super();
  }

  // Chip in OR, combinate con i filtri del dialog; nessuna chip = Tutti.
  onRolesChange(roles: PartyRole[]): void {
    this.selectedRoles = roles;
    this.applyFilters();
  }

  onDialogSearch(filters: Record<string, unknown>): void {
    if (Object.keys(filters).length === 1 && 'qsearch' in filters) {
      this.onSearch(filters);
      return;
    }
    this.dialogFilters = filters;
    this.applyFilters();
  }

  private applyFilters(): void {
    const filters: Record<string, unknown> = {...this.dialogFilters};
    if (this.selectedRoles.length) filters['roles'] = this.selectedRoles.join(',');
    this.onSearch(filters);
  }

  protected override getEntityIdentifier(entity: ThirdParty): string {
    return partyName(entity);
  }

  protected override entityLabel(): string {
    return 'Soggetto';
  }
}
```

Nota: `onSearch` con un oggetto vuoto `{}` passa dal ramo "filtri" (chiavi ≠ solo `qsearch`) e ricarica tutto: è il caso "Tutti".

`third-parties.component.html`:

```html
<div style="padding: 1rem;">
  <div>
    <h1>Soggetti terzi</h1>
    <p style="color: #6A7282;">Persone fisiche e giuridiche: fornitori e parti dei contratti immobiliari.</p>
  </div>
  <div style="margin-top: 1rem;">
    <app-search-third-parties (search)="onDialogSearch($event)"></app-search-third-parties>
  </div>
  <mat-chip-listbox multiple aria-label="Filtri rapidi per ruolo" style="margin-top: 0.75rem; display: block;"
                    [value]="selectedRoles" (change)="onRolesChange($event.value)">
    @for (c of chips; track c.role) {
      <mat-chip-option [value]="c.role">{{ c.label }}</mat-chip-option>
    }
  </mat-chip-listbox>
  <div style="margin-top: 1.5rem;">
    <app-data-table-third-parties
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-third-parties>
  </div>
</div>
```

`search-third-parties.component.ts`/`.html`: copia di `search-utilizer.component.*` (letti nel piano: form `qsearch`, pulsante Filtri) con selettore `app-search-third-parties`, form `this.fb.group({qsearch: ['']})`, `filterDialogComponent()` → `ThirdPartyFilterDialogComponent`, `filterDialogWidth()` → `'600px'`.

`third-party-filter-dialog.component.ts`:

```ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {ThirdPartyType, TYPE_LABEL} from './third-party.model';
import {ContractKind, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';

interface ThirdPartyFilterValues {
  q: string | null;
  type: ThirdPartyType | null;
  kind: ContractKind | null;
}

@Component({
  selector: 'app-third-party-filter-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri soggetti terzi</h2>
    <mat-dialog-content>
      <form [formGroup]="form" id="filter-form" (ngSubmit)="apply()" style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
        <mat-form-field>
          <mat-label>Nome, P.IVA o codice fiscale</mat-label>
          <input matInput formControlName="q">
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tipo soggetto</mat-label>
          <mat-select formControlName="type">
            <mat-option [value]="null">Tutti</mat-option>
            @for (t of types; track t) {
              <mat-option [value]="t">{{ typeLabel[t] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Tipo contratto immobiliare</mat-label>
          <mat-select formControlName="kind">
            <mat-option [value]="null">Tutti</mat-option>
            @for (k of kinds; track k) {
              <mat-option [value]="k">{{ kindLabel[k] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="clear()">Pulisci filtri</button>
      <button mat-flat-button type="submit" form="filter-form">Applica filtri</button>
    </mat-dialog-actions>
  `
})
export class ThirdPartyFilterDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ThirdPartyFilterDialogComponent, ThirdPartyFilterValues | 'clear'>);
  protected data = inject<FilterDialogData<ThirdPartyFilterValues>>(MAT_DIALOG_DATA);

  readonly types = Object.values(ThirdPartyType);
  readonly typeLabel = TYPE_LABEL;
  readonly kinds = Object.values(ContractKind);
  readonly kindLabel = KIND_LABEL;

  form = this.fb.group({
    q: [this.data.values.q ?? ''],
    type: [this.data.values.type ?? null as ThirdPartyType | null],
    kind: [this.data.values.kind ?? null as ContractKind | null],
  });

  apply(): void {
    this.dialogRef.close(this.form.getRawValue() as ThirdPartyFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
```

(Verificare che `ContractKind` e `KIND_LABEL` siano esportati da `pages/utilizer-grant/real-estate-contract.model.ts`: `grep -n "export" frontend/src/app/pages/utilizer-grant/real-estate-contract.model.ts`. Verificare anche come `AbstractSearchComponent` gestisce `'clear'` e i valori null: se manda al genitore anche le chiavi a `null`, il backend le ignora — `@IsOptional`.)

`data-table-third-parties.component.ts`: come `data-table-utilizer.component.ts` (letto nel piano), con:

```ts
  displayedColumns = ['actions', 'name', 'type', 'identifier', 'roles', 'city'];
  readonly partyName = partyName;
  readonly partyIdentifier = partyIdentifier;
  readonly typeLabel = TYPE_LABEL;
  readonly roleBadges = partyRoleBadges;

  override itemInstance(): ThirdParty { return ThirdParty.create(); }
  override editDialogComponent(): Type<unknown> { return ThirdPartyEditDialogComponent; }
  protected override useSheet(): boolean { return true; }
  protected override entityLabel(): string { return 'soggetto'; }
```

`openDeleteDialog`/`restoreItem` con titoli "Elimina soggetto"/"Ripristina soggetto" e messaggio `` `Eliminare ${partyName(entity)}?` ``; `imports` aggiungere `StatusBadgeComponent`. Se `AbstractDataTableComponent` ordina con `MatSort` sulle proprietà, impostare un `sortingDataAccessor` per `name` → `partyName(item)` e `identifier` → `partyIdentifier(item)` (cercare come lo fa `data-table-utilities.component.ts:117-140`).

`data-table-third-parties.component.html`: come `data-table-utilizer.component.html` con pulsante "Aggiungi soggetto", colonne:

```html
  <ng-container matColumnDef="name">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Nome</th>
    <td mat-cell *matCellDef="let item">{{ partyName(item) }}</td>
  </ng-container>

  <ng-container matColumnDef="type">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
    <td mat-cell *matCellDef="let item">{{ typeLabel[item.type] }}</td>
  </ng-container>

  <ng-container matColumnDef="identifier">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>P.IVA / CF</th>
    <td mat-cell *matCellDef="let item">{{ partyIdentifier(item) || '—' }}</td>
  </ng-container>

  <ng-container matColumnDef="roles">
    <th mat-header-cell *matHeaderCellDef>Ruoli</th>
    <td mat-cell *matCellDef="let item">
      @for (b of roleBadges(item.roles); track b.label) {
        <app-status-badge [info]="b" size="sm"></app-status-badge>
      }
    </td>
  </ng-container>

  <ng-container matColumnDef="city">
    <th mat-header-cell *matHeaderCellDef mat-sort-header>Città</th>
    <td mat-cell *matCellDef="let item">{{ item.city }}</td>
  </ng-container>
```

e riga vuota "Nessun soggetto trovato.".

- [ ] **Step 3: Route, sidebar, eliminazioni**

`app.routes.ts`: togliere import e route di `UtilizerComponent` (`/utilizer`) e del componente fornitori (`/suppliers`, cercare `SuppliersComponent`); aggiungere `import {ThirdPartiesComponent} from './pages/third-parties/third-parties.component';` e `{path: 'third-parties', component: ThirdPartiesComponent},` dove stavano.

`sidebar.component.ts`: togliere `{label: 'Controparti', icon: 'person_add', route: '/utilizer'},` e la voce Fornitori (`grep -n "suppliers" frontend/src/app/comp/sidebar/sidebar.component.ts`); aggiungere al posto di quella dei Fornitori `{label: 'Soggetti terzi', icon: 'groups', route: '/third-parties'},`.

```bash
git rm -r -q frontend/src/app/pages/utilizer frontend/src/app/pages/suppliers
```

Run: `grep -rn "pages/utilizer/\|pages/suppliers/\|'/utilizer'\|'/suppliers'" frontend/src/app` → nessun risultato.

- [ ] **Step 4: Compilazione e commit**

Dopo il Task 10 Step 1–2 (dialog scheda): `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete", nessun errore.

```bash
git add -u frontend/src/app
git add frontend/src/app/pages/third-parties frontend/src/app/core/helpers/entity-status.ts frontend/src/app/app.routes.ts frontend/src/app/comp/sidebar/sidebar.component.ts
git commit -m "feat(frontend): pagina soggetti terzi con filtri rapidi per ruolo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Frontend — scheda soggetto terzo

**Files:**
- Create: `frontend/src/app/pages/third-parties/third-party-edit-dialog.component.ts`, `third-party-edit-dialog.component.html`
- Modify: `frontend/src/styles.scss` (token `--entity-party`)
- Modify: `frontend/src/app/core/services/entity-navigator.service.ts` (`openThirdParty`)
- Modify: `frontend/src/app/pages/dashboard/anomalies-card.component.ts` (due pannelli nuovi)

**Interfaces:**
- Consumes: `EntitySheetComponent`, `TabLabelComponent`, `StatusBadgeComponent`, `LinkedTableComponent`, `PreviewCardComponent`, `sheet-utils` (`isEditorRole`, `lastModifiedLabel`, `selectTab`, `hasInvalid`); `UtilizerGrantService.search({party_id})`, `ContractsService.search({supplier_id_fk})`, `ConsipAgreementService.search({supplier_id})`; `EntityNavigatorService.openGrant/openSupplyContract`.
- Produces: `ThirdPartyEditDialogComponent` (dialog chiude con un `ThirdParty` o `undefined`); `EntityNavigatorService.openThirdParty(id: number): Observable<ThirdParty | null>`.

- [ ] **Step 1: Token colore**

`styles.scss`, accanto a `--entity-grant` (riga ~437): `--entity-party: #be185d;` (e nello stesso blocco dark mode se presente: `grep -n "entity-grant" frontend/src/styles.scss`).

- [ ] **Step 2: Componente**

`third-party-edit-dialog.component.ts`:

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {grantStatus, partyRoleBadges, StatusInfo, supplyContractStatus} from '../../core/helpers/entity-status';
import {partyName} from '../../core/helpers/party-name.helper';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartyType, TYPE_LABEL} from './third-party.model';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {ContractsService} from '../contracts/contracts.service';
import {Contract} from '../contracts/entity/contract.entity';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';

const VAT = /^\d{11}$/;
const CF_PERSON = /^[A-Za-z0-9]{16}$/;

@Component({
  selector: 'app-third-party-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule,
    MatTabsModule, MatIconModule, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, LinkedTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-party-edit-dialog.component.html',
})
export class ThirdPartyEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ThirdPartyEditDialogComponent, ThirdParty | undefined>);
  private authService = inject(AuthService);
  private grantService = inject(UtilizerGrantService);
  private contractsService = inject(ContractsService);
  private consipService = inject(ConsipAgreementService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<ThirdParty>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly types = Object.values(ThirdPartyType);
  readonly typeLabel = TYPE_LABEL;
  readonly roleBadges: StatusInfo[] = partyRoleBadges(this.data.item.roles);

  // Campi cache per app-linked-table (mai getter).
  grants: UtilizerGrant[] = [];
  contracts: Contract[] = [];
  agreements: ConsipAgreement[] = [];

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Tipo', value: g => [g.kind ? KIND_LABEL[g.kind] : '', g.direction ? DIRECTION_LABEL[g.direction] : ''].filter(Boolean).join(' · ')},
    {label: 'Oggetto', value: g => g.subject ?? ''},
    {label: 'Immobili', value: g => (g.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status ?? g.status);
  readonly contractColumns: LinkedColumn<Contract>[] = [
    {label: 'CIG', value: c => c.cig_contract || 'CIG non specificato'},
    {label: 'Ordine', value: c => c.order_number ?? ''},
  ];
  readonly contractStatusOf = (c: Contract): StatusInfo => supplyContractStatus(c);
  readonly agreementColumns: LinkedColumn<ConsipAgreement>[] = [
    {label: 'Convenzione', value: a => a.name ?? ''},
  ];

  form = this.fb.group({
    type: [this.data.item.type ?? ThirdPartyType.LEGAL, Validators.required],
    company_name: [this.data.item.company_name ?? null as string | null],
    last_name: [this.data.item.last_name ?? null as string | null],
    first_name: [this.data.item.first_name ?? null as string | null],
    vat_number: [this.data.item.vat_number ?? null as string | null],
    tax_code: [this.data.item.tax_code ?? null as string | null],
    address: [this.data.item.address ?? null as string | null],
    city: [this.data.item.city ?? null as string | null],
    postal_code: [this.data.item.postal_code ?? null as string | null],
    email: [this.data.item.email ?? null as string | null, Validators.email],
    pec: [this.data.item.pec ?? null as string | null, Validators.email],
    phone: [this.data.item.phone ?? null as string | null],
    contacts: [this.data.item.contacts ?? null as string | null],
    notes: [this.data.item.notes ?? null as string | null],
  });

  constructor() {
    this.applyTypeRules(this.form.controls.type.value!);
    this.form.controls.type.valueChanges.subscribe(t => this.applyTypeRules(t!));
    if (!this.canEdit) this.form.disable({emitEvent: false});
  }

  ngOnInit(): void {
    if (this.isNew) return;
    const id = this.data.item.id;
    this.grantService.search({party_id: id} as never).subscribe(g => this.grants = g);
    this.contractsService.search({supplier_id_fk: id} as never).subscribe(c => this.contracts = c);
    this.consipService.search({supplier_id: id} as never).subscribe(a => this.agreements = a);
  }

  // Stesse regole del backend (validateThirdParty): il backend resta la garanzia.
  private applyTypeRules(type: ThirdPartyType): void {
    const c = this.form.controls;
    const legal = type === ThirdPartyType.LEGAL;
    c.company_name.setValidators(legal ? [Validators.required] : []);
    c.last_name.setValidators(legal ? [] : [Validators.required]);
    c.first_name.setValidators(legal ? [] : [Validators.required]);
    c.vat_number.setValidators(legal ? [Validators.required, Validators.pattern(VAT)] : [Validators.pattern(VAT)]);
    c.tax_code.setValidators(legal ? [] : [Validators.required, Validators.pattern(CF_PERSON)]);
    for (const name of ['company_name', 'last_name', 'first_name', 'vat_number', 'tax_code'] as const) {
      c[name].updateValueAndValidity({emitEvent: false});
    }
  }

  isLegal(): boolean {
    return this.form.controls.type.value === ThirdPartyType.LEGAL;
  }

  titleText(): string {
    const name = partyName(this.form.getRawValue());
    return name || (this.isNew ? 'Nuovo soggetto terzo' : `Soggetto #${this.data.item.id}`);
  }

  subtitle(): string {
    return TYPE_LABEL[this.form.controls.type.value as ThirdPartyType] ?? '';
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'type', 'company_name', 'last_name', 'first_name', 'vat_number', 'tax_code', 'email', 'pec');
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved) this.grantService.search({party_id: this.data.item.id} as never).subscribe(g => this.grants = g);
    });
  }

  openContract(id: number): void {
    this.navigator.openSupplyContract(id).subscribe();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Campi vuoti a null: il backend rifiuta '' su email/PEC (IsEmail).
    const raw = Object.fromEntries(
      Object.entries(this.form.getRawValue()).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
    );
    this.dialogRef.close(plainToInstance(ThirdParty, {id: this.data.item.id, ...raw}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

Verifiche prima di scrivere: nomi reali di `ContractsService` e `ConsipAgreementService` (`ls frontend/src/app/pages/contracts frontend/src/app/pages/consip-agreement`), esportazione di `grantStatus`/`supplyContractStatus` da `entity-status.ts` e firma di `supplyContractStatus` (prende il raw value del form contratto: passare `c` va bene se legge gli stessi campi), `DIRECTION_LABEL` in `real-estate-contract.model.ts`. Se `openSupplyContract` non esiste con questo nome, usare quello reale (`grep -n "open" core/services/entity-navigator.service.ts`).

- [ ] **Step 3: Template**

`third-party-edit-dialog.component.html`:

```html
<app-entity-sheet
  icon="groups"
  color="var(--entity-party)"
  [title]="titleText()"
  [subtitle]="subtitle()"
  [lastModified]="lastModified">
  <ng-container sheetBadges>
    @for (b of roleBadges; track b.label) {
      <app-status-badge [info]="b" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Dati">
        <ng-template mat-tab-label>
          <app-tab-label icon="badge" label="Dati" [error]="dataInvalid()"></app-tab-label>
        </ng-template>

        <mat-button-toggle-group formControlName="type" aria-label="Tipo soggetto" style="margin: 8px 0 16px;">
          @for (t of types; track t) {
            <mat-button-toggle [value]="t">{{ typeLabel[t] }}</mat-button-toggle>
          }
        </mat-button-toggle-group>

        <div class="sheet-grid">
          @if (isLegal()) {
            <mat-form-field class="span-2">
              <mat-label>Denominazione</mat-label>
              <input matInput formControlName="company_name">
              <mat-error>Obbligatoria</mat-error>
            </mat-form-field>
          } @else {
            <mat-form-field>
              <mat-label>Cognome</mat-label>
              <input matInput formControlName="last_name">
              <mat-error>Obbligatorio</mat-error>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Nome</mat-label>
              <input matInput formControlName="first_name">
              <mat-error>Obbligatorio</mat-error>
            </mat-form-field>
          }
          <mat-form-field>
            <mat-label>Partita IVA</mat-label>
            <input matInput formControlName="vat_number" maxlength="20">
            <mat-error>{{ isLegal() && !form.controls.vat_number.value ? 'Obbligatoria' : '11 cifre' }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Codice fiscale</mat-label>
            <input matInput formControlName="tax_code" maxlength="20">
            <mat-error>{{ !isLegal() && !form.controls.tax_code.value ? 'Obbligatorio' : '16 caratteri' }}</mat-error>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Indirizzo</mat-label>
            <input matInput formControlName="address">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Città</mat-label>
            <input matInput formControlName="city">
          </mat-form-field>
          <mat-form-field>
            <mat-label>CAP</mat-label>
            <input matInput formControlName="postal_code" maxlength="10">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Email</mat-label>
            <input matInput formControlName="email">
            <mat-error>Email non valida</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>PEC</mat-label>
            <input matInput formControlName="pec">
            <mat-error>PEC non valida</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Telefono</mat-label>
            <input matInput formControlName="phone">
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Referente e recapiti</mat-label>
            <textarea matInput formControlName="contacts" rows="2"></textarea>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Note</mat-label>
            <textarea matInput formControlName="notes" rows="3"></textarea>
          </mat-form-field>
        </div>
      </mat-tab>

      @if (!isNew) {
        <mat-tab aria-label="Contratti immobiliari">
          <ng-template mat-tab-label>
            <app-tab-label icon="real_estate_agent" label="Contratti immobiliari" [count]="grants.length"></app-tab-label>
          </ng-template>
          <app-linked-table [columns]="grantColumns" [rows]="grants" [rowStatus]="grantStatusOf"
                            emptyText="Nessun contratto immobiliare." (open)="openGrant($event.id)"></app-linked-table>
        </mat-tab>

        <mat-tab aria-label="Forniture">
          <ng-template mat-tab-label>
            <app-tab-label icon="description" label="Forniture" [count]="contracts.length + agreements.length"></app-tab-label>
          </ng-template>
          <div class="sheet-section-title"><mat-icon>description</mat-icon>Contratti di fornitura</div>
          <app-linked-table [columns]="contractColumns" [rows]="contracts" [rowStatus]="contractStatusOf"
                            emptyText="Nessun contratto di fornitura." (open)="openContract($event.id)"></app-linked-table>
          <div class="sheet-section-title"><mat-icon>handshake</mat-icon>Convenzioni CONSIP</div>
          <app-linked-table [columns]="agreementColumns" [rows]="agreements"
                            emptyText="Nessuna convenzione CONSIP."></app-linked-table>
        </mat-tab>
      }
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea soggetto' : 'Salva soggetto' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

Note:
- nessun tab Riepilogo separato: con un solo form di anagrafica il tab "Dati" è il riepilogo (badge ruoli nell'header, conteggi nei tab). Se in E2E risulta poco leggibile, aggiungere un Riepilogo con `app-preview-card` come in `contract-edit-dialog.component.html`;
- `mat-label` senza `*` (Material lo aggiunge sui campi `required`, vedi CLAUDE.md);
- verificare che `app-linked-table` accetti `rowStatus` facoltativo e righe senza `addOptions` (lettura del componente: sì, `addOptions` null nasconde la toolbar).

- [ ] **Step 4: Navigator**

`entity-navigator.service.ts`: aggiungere accanto a `openGrant`, con lo stesso schema:

```ts
const THIRD_PARTY_DIALOG = () => import('../../pages/third-parties/third-party-edit-dialog.component').then(m => m.ThirdPartyEditDialogComponent);
```

```ts
  openThirdParty(id: number): Observable<ThirdParty | null> {
    return this.thirdParties.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<ThirdParty>, ThirdParty>(THIRD_PARTY_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.thirdParties.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del soggetto', err)),
    );
  }
```

con `private thirdParties = inject(ThirdPartiesService);` e gli import di `ThirdParty`/`ThirdPartiesService` (stile degli altri campi del service).

Nel dialog contratto immobiliare (Task 8) aggiungere sotto il multi-select l'elenco delle parti selezionate come link che aprono `navigator.openThirdParty(id)`:

```html
            @for (id of form.controls.party_ids.value ?? []; track id) {
              <a href="javascript:void(0)" (click)="openParty(id)" style="margin-right: 12px;">{{ partyLabel(id) }}</a>
            }
```

```ts
  partyLabel(id: number): string {
    return this.partyOptions.find(o => o.value === id)?.label ?? `#${id}`;
  }

  openParty(id: number): void {
    this.navigator.openThirdParty(id).subscribe();
  }
```

- [ ] **Step 5: Anomalie in dashboard**

`anomalies-card.component.ts`: nell'interfaccia `Anomalies` (riga ~32) aggiungere

```ts
  real_estate_contracts_without_parties: AnomalyList<{id: number; subject: string | null}>;
  third_parties_without_identifier: AnomalyList<{id: number; name: string; type: string}>;
```

e dopo il pannello "Contratti immobiliari senza immobile" (riga ~180) due pannelli con la stessa struttura:

```html
            <mat-expansion-panel [disabled]="data.real_estate_contracts_without_parties.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.real_estate_contracts_without_parties.count === 0">{{ data.real_estate_contracts_without_parties.count }}</span>
                  Contratti immobiliari senza parti
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (c of data.real_estate_contracts_without_parties.items; track c.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openRealEstateContract(c.id)">#{{ c.id }}</a>
                    {{ c.subject ?? '' }}
                  </li>
                }
              </ul>
            </mat-expansion-panel>
            <mat-expansion-panel [disabled]="data.third_parties_without_identifier.count === 0">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <span class="anomaly-count" [class.zero]="data.third_parties_without_identifier.count === 0">{{ data.third_parties_without_identifier.count }}</span>
                  Soggetti senza P.IVA o codice fiscale
                </mat-panel-title>
              </mat-expansion-panel-header>
              <ul class="anomaly-list">
                @for (p of data.third_parties_without_identifier.items; track p.id) {
                  <li>
                    <a href="javascript:void(0)" (click)="openThirdParty(p.id)">{{ p.name }}</a>
                  </li>
                }
              </ul>
            </mat-expansion-panel>
```

e il metodo:

```ts
  openThirdParty(id: number): void {
    this.navigator.openThirdParty(id).subscribe(saved => {
      if (saved) this.load();
    });
  }
```

(usare il nome reale del service di navigazione e del metodo di ricarica del componente: `grep -n "navigator\|load\|openPlant" frontend/src/app/pages/dashboard/anomalies-card.component.ts`.)

- [ ] **Step 6: Compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → "generation complete", nessun `✘`. Poi, a container `frontend` fermo o su macchina scarica: `docker exec utenzepa-frontend-1 pnpm run build` → build completata.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/third-parties frontend/src/styles.scss frontend/src/app/core/services/entity-navigator.service.ts frontend/src/app/pages/dashboard/anomalies-card.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html
git commit -m "feat(frontend): scheda soggetto terzo e anomalie in dashboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verifica E2E, documentazione, PR

**Files:**
- Modify: `docs/roadmap-patrimonio.md` (voce 9 → fatta; voce 14: Fornitori coperto)
- Modify: `CLAUDE.md` (sezione Architettura → Backend: modulo `third-parties`; note su `utilizer`/`suppliers` rimossi; tabella `utilizer_grant_parties`)
- Modify: `docs/superpowers/specs/2026-10-02-soggetti-terzi-design.md` (allineare: ruoli calcolati in memoria dal service, errore duplicato mostrato come toast dal `handleError` del componente lista/navigatore, tab "Dati" invece di "Riepilogo + Dati")

- [ ] **Step 1: Utente di test**

Seguire CLAUDE.md ("Nessuna credenziale dev/seed…"): utente temporaneo Admin e uno Lettore via SQL, hash con bcrypt nel container.

- [ ] **Step 2: E2E Playwright (uno scenario alla volta, aspettando "generation complete")**

1. `/third-parties`: elenco caricato, chip "Fornitori" → solo soggetti con badge Fornitore; "Fornitori" + "Locatori" → unione; "Senza collegamenti" → soggetti senza badge; filtro dialog "Tipo contratto immobiliare = Locazione" + chip "Conduttori".
2. Nuovo soggetto giuridico senza P.IVA → Salva non chiude il dialog, tab "Dati" col pallino rosso. Con P.IVA `01318460688` già usata da ACA → toast "Partita IVA già usata da ACA SpA in house providing." (messaggio dal backend, risposta 400).
3. Persona fisica: cambio tipo → compaiono Cognome/Nome; CF obbligatorio; salvataggio ok con CF valido di prova.
4. Ripristino di un soggetto eliminato senza P.IVA (tabella, filtro eliminati se disponibile, oppure `PATCH` via API con `{"deleted": false}`) → riuscito.
5. Scheda di un soggetto con contratti (es. id 1273 Regione Abruzzo, 11 contratti): tab "Contratti immobiliari" con 11 righe, clic apre la scheda contratto.
6. `/utilizer-grant?selectedId=<id di un contratto>`: multi-select "Parti" precompilato; aggiungere una seconda parte, salvare, riaprire → due parti; titolo con i due nomi; tabella contratti colonna Controparti con i due nomi.
7. `/utilities` filtro per parte → utenze dell'immobile del contratto; colonna Controparti completa.
8. Login Lettore: scheda di una persona fisica → CF e telefono vuoti, form non modificabile; scheda contratto immobiliare con quella parte → nessun CF.
9. Dashboard: pannelli "Contratti immobiliari senza parti" e "Soggetti senza P.IVA o codice fiscale" con conteggi; clic su un soggetto apre la scheda.

- [ ] **Step 3: Pulizia utenti di test**

Come da CLAUDE.md (riassegnare righe create, `DELETE FROM audit_logs WHERE user_id=…`, poi `DELETE` utente). Eliminare anche i soggetti di prova creati allo Step 2 (soft delete da UI non basta per riusare la P.IVA: usare `DELETE FROM third_parties WHERE id IN (…)` dopo aver verificato che non abbiano collegamenti).

- [ ] **Step 4: Documentazione**

Roadmap, tabella "Ordine proposto": riga 9 → `fatto, v1.8.0 (pulizia dati sul DB locale da fare, poi in produzione)`; voce 14: "Fornitori → scheda Soggetto terzo" → "Fornitori: fatto con la voce 9". CLAUDE.md: aggiungere `third-parties` all'elenco dei moduli in `src/apis/`, togliere `utilizer` e `suppliers`; una riga: "Soggetti terzi (`third_parties`) = controparti + fornitori, ruoli calcolati dai collegamenti (`third-party.roles.ts`), P.IVA/CF unici anche tra gli eliminati: per riusare un identificativo di un soggetto di prova serve il DELETE fisico."

Spec: allineare i tre punti elencati in **Files**.

- [ ] **Step 5: Release e PR**

`publiccode.yml`: `softwareVersion: 1.8.0`, `releaseDate` di oggi.

```bash
git add docs/roadmap-patrimonio.md CLAUDE.md docs/superpowers/specs/2026-10-02-soggetti-terzi-design.md docs/superpowers/plans/2026-10-02-soggetti-terzi.md publiccode.yml
git commit -m "docs: soggetti terzi (v1.8.0)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/soggetti-terzi
gh pr create --repo Comune-di-Montesilvano/UtenzePA --title "feat: soggetti terzi (controparti + fornitori)" --body "Roadmap voce 9. Un'unica anagrafica third_parties al posto di utilizer e suppliers (id conservati), contratti immobiliari con più parti, ruoli calcolati dai collegamenti, pagina e scheda Soggetti terzi con filtri rapidi, P.IVA/CF obbligatori e unici (400 sui duplicati, mai 409). Pulizia dei dati da fare dopo il merge sul DB locale.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Run: `gh pr checks <N> --watch` → `backend` e `frontend` verdi. Merge solo dopo conferma dell'utente.

- [ ] **Step 6: Pulizia dati (dopo il merge, con l'utente)**

Non è codice: seguire la sezione "Pulizia dati" della spec, una lista alla volta, ogni lista confermata dall'utente prima dell'UPDATE (query su una riga, valori reali). Ordine: orfane (report CSV → soft delete), non-soggetti con contratto (testo in `utilizer_grant.notes`, `DELETE` da `utilizer_grant_parties`, soft delete), doppioni e pseudo-fornitori (riassegnazione `contracts.supplier_id_fk`/`consip_agreement.supplier_id`/`utilizer_grant_parties`, soft delete), tipo e nominativi (UPDATE `type`, `last_name`, `first_name`, `company_name = NULL` per le persone; righe con più persone → nuovi soggetti + righe in `utilizer_grant_parties`). Fornitori con P.IVA a 10 cifre (zero iniziale perso, es. Estra `1219980529`) da segnalare nella stessa lista.
