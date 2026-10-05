# Elenchi uniformi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo modello per tutti gli elenchi: ricerca libera + max 3 select in linea + "Filtri avanzati" generico + chip dei filtri attivi, paginazione 25/50/100 ricordata, toolbar uguale.

**Architecture:** Ogni pagina dichiara `FilterDef[]` in un file `*-filters.ts`. Tre componenti condivisi in `core/components/list/` (`app-list-filters`, `app-advanced-filters-dialog`, `app-list-toolbar`) più un helper puro `filter-values.ts` disegnano barra, dialog e chip dalla configurazione. `AbstractComponent` tiene lo stato dei filtri e legge i query param; `AbstractDataTableComponent` gestisce la paginazione ricordata. I 12 `search-*` e i 12 `*-filter-dialog` si eliminano.

**Tech Stack:** Angular 22 standalone + Angular Material, NestJS 11 + TypeORM (solo 3 service e un DTO).

**Spec:** `docs/superpowers/specs/2026-10-05-elenchi-uniformi-design.md`

## Global Constraints

- Paginazione: default 25, opzioni `[25, 50, 100]`, `showFirstLastButtons`, numero di righe in `localStorage` chiave `list-page-size:<chiave elenco>`, lettura/scrittura in `try/catch`.
- Max 3 filtri `inline` per pagina.
- Chiavi dei filtri = parametri già accettati dalle API; nuovi solo `closed` e `consip_order` su `SearchContractDto`.
- Filtro `deleted` ("Mostra: Attivi / Eliminati", default Attivi) solo negli elenchi con Ripristina; `deleted` assente lato API = solo attivi.
- Date dei filtri: `AAAA-MM-GG` locale (`DateHelper.toLocalIsoString`), mai `toISOString()`.
- Tutti i componenti `changeDetection: ChangeDetectionStrategy.Eager`, standalone.
- Etichette in italiano, niente dati personali nei test/doc.
- File con CRLF (es. `app.module.ts`): modifiche via Edit, non `sed`.
- Comandi Docker uno alla volta; jest sempre `--maxWorkers=2`; `git add` con file espliciti.
- Frontend: nessun test eseguibile (niente browser per Karma); verifica = log `ng serve` senza errori + `ng build` finale + E2E Playwright.

## Review Focus

- Query param della dashboard (`missing_cig`, `alert`, `safeguard`, `position`, `inspection`, `supply_expiry_date_range`) aprono l'elenco già filtrato e il chip si toglie → Task 6 (helper `fromQueryParams`) e verifica E2E in Task 13.
- Ricerca libera dopo un filtro: deve filtrare solo i risultati del filtro, e togliere il testo non deve far perdere i filtri → Task 6, verifica E2E Task 13.
- `localStorage` non disponibile o valore corrotto (`"abc"`, `"7"`): paginazione torna a 25 senza errori → Task 5 (`readPageSize` accetta solo 25/50/100).
- Filtro avanzato con data solo "da" (senza "a"): parametro inviato `['2026-01-01', null]` → serializzato `2026-01-01,` e accettato dal backend; chip "dal 01/01/2026" → Task 2.
- Opzioni caricate in ritardo (HTTP): un chip creato da query param prima che arrivino le opzioni mostra il valore grezzo, poi l'etichetta quando le opzioni arrivano → Task 4 (chip ricalcolati a ogni arrivo di opzioni).

---

## File Structure

Nuovi:

- `frontend/src/app/core/components/list/filter-def.ts` — tipi `FilterDef`, `FilterType`, `FilterValues`, `FilterChip`, costanti `DELETED_FILTER`, `BOOL_OPTIONS`.
- `frontend/src/app/core/components/list/filter-values.ts` — helper puri: `toSearchParams`, `toChips`, `countAdvanced`, `fromQueryParams`, `clearKey`.
- `frontend/src/app/core/components/list/advanced-filters-dialog.component.ts` — dialog generico.
- `frontend/src/app/core/components/list/list-filters.component.ts` — barra (ricerca, select in linea, pulsante avanzati, chip).
- `frontend/src/app/core/components/list/list-toolbar.component.ts` — "Elenco (N)", Colonne, Esporta CSV, "+ Nuovo".
- `frontend/src/app/pages/<entità>/<entità>-filters.ts` — una per pagina (13).

Modificati:

- `core/components/abstract.component.ts` — stato filtri, query param, ricerca combinata.
- `core/components/abstract-data-table.component.ts` — paginazione ricordata.
- Ogni `pages/<entità>/<entità>.component.{ts,html}` e `data-table-*.component.{ts,html}`.
- `pages/plants/plants.component.ts`, `pages/audit-log/audit-log-page.component.{ts,html}`.
- Backend: `apis/contracts/dto/search-contract.dto.ts`, `apis/contracts/contracts.service.ts`, `apis/budget-chapters/budget-chapters.service.ts`, `apis/consip-agreement/consip-agreement.service.ts` + spec.

Eliminati (a migrazione della pagina): `pages/*/search-*.component.{ts,html}`, `pages/*/*-filter-dialog.component.{ts,html}`, `core/components/abstract-search.component.ts` (ultimo task, quando non ha più usi).

---

### Task 1: Backend — `deleted`, `closed`, `consip_order`

**Files:**
- Modify: `backend/src/apis/contracts/dto/search-contract.dto.ts`
- Modify: `backend/src/apis/contracts/contracts.service.ts:29-60`
- Modify: `backend/src/apis/budget-chapters/budget-chapters.service.ts:42-58`
- Modify: `backend/src/apis/consip-agreement/consip-agreement.service.ts:27-35`
- Test: `backend/src/apis/contracts/contracts.service.spec.ts`, `backend/src/apis/budget-chapters/budget-chapters.service.spec.ts`, `backend/src/apis/consip-agreement/consip-agreement.service.spec.ts`

**Interfaces:**
- Produces: `GET /contracts?deleted=true|false&closed=true|false&consip_order=<testo>`; `GET /budget-chapters?deleted=true`; `GET /consip-agreement?deleted=true`. `deleted` assente = attivi.

- [ ] **Step 1: Test che falliscono (contratti)**

In `contracts.service.spec.ts`, dentro `describe('findAll')`:

```ts
it('con deleted=true elenca i contratti eliminati', async () => {
  await service.findAll({ deleted: true } as never);
  expect(qb.where).toHaveBeenCalledWith('contract.deleted = :deleted', { deleted: true });
});

it('filtra per stato chiuso/aperto', async () => {
  await service.findAll({ closed: false } as never);
  expect(qb.andWhere).toHaveBeenCalledWith('contract.closed = :closed', { closed: false });
});

it('filtra per numero ordine (ODA) con LIKE', async () => {
  await service.findAll({ consip_order: '9029' } as never);
  expect(qb.andWhere).toHaveBeenCalledWith('contract.consip_order LIKE :consip_order', { consip_order: '%9029%' });
});
```

- [ ] **Step 2: Test che falliscono (capitoli, CONSIP)**

In `budget-chapters.service.spec.ts` e `consip-agreement.service.spec.ts` (stesso mock `qb` già presente nei file; alias `budgetChapter` e `consipAgreement` — verificare `this.entityName` nel service e usare lo stesso alias negli expect):

```ts
it('con deleted=true elenca gli eliminati, senza ripetere deleted tra i filtri generici', async () => {
  await service.findAll({ deleted: true } as never);
  expect(qb.where).toHaveBeenCalledWith('<alias>.deleted = :deleted', { deleted: true });
  expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('.deleted'), expect.anything());
});
```

- [ ] **Step 3: Eseguire, verificare il fallimento**

Run: `docker exec utenzepa-api-1 pnpm exec jest src/apis/contracts/contracts.service.spec.ts src/apis/budget-chapters/budget-chapters.service.spec.ts src/apis/consip-agreement/consip-agreement.service.spec.ts --maxWorkers=2`
Expected: FAIL sui nuovi test (where con `deleted: false`, nessun `closed`/`consip_order`).

- [ ] **Step 4: Implementazione**

`search-contract.dto.ts`, aggiungere:

```ts
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return undefined;
  })
  closed?: boolean;

  @IsOptional()
  @IsString()
  consip_order?: string;
```

`contracts.service.ts` `findAll`: sostituire `qb.where(\`${alias}.deleted = :deleted\`, { deleted: false });` con

```ts
    qb.where(`${alias}.deleted = :deleted`, { deleted: filters?.deleted ?? false });
```

e dentro `if (filters) { ... }`:

```ts
      if (filters.closed !== undefined) {
        qb.andWhere(`${alias}.closed = :closed`, { closed: filters.closed });
      }
      if (filters.consip_order) {
        qb.andWhere(`${alias}.consip_order LIKE :consip_order`, { consip_order: `%${filters.consip_order}%` });
      }
```

`budget-chapters.service.ts` e `consip-agreement.service.ts`: `where` con `filter?.deleted ?? false` (nome variabile del parametro come nel metodo) e nel ciclo `Object.entries(...)` aggiungere in testa `if (key === 'deleted') return;`.

- [ ] **Step 5: Test verdi**

Run: stesso comando dello Step 3. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/apis/contracts/dto/search-contract.dto.ts backend/src/apis/contracts/contracts.service.ts backend/src/apis/contracts/contracts.service.spec.ts backend/src/apis/budget-chapters/budget-chapters.service.ts backend/src/apis/budget-chapters/budget-chapters.service.spec.ts backend/src/apis/consip-agreement/consip-agreement.service.ts backend/src/apis/consip-agreement/consip-agreement.service.spec.ts
git commit -m "feat(api): filtri deleted, closed e consip_order su contratti, capitoli e CONSIP"
```

---

### Task 2: Tipi e helper dei filtri

**Files:**
- Create: `frontend/src/app/core/components/list/filter-def.ts`
- Create: `frontend/src/app/core/components/list/filter-values.ts`

**Interfaces:**
- Produces: tipi e funzioni sotto, usati da tutti i task successivi.

- [ ] **Step 1: `filter-def.ts`**

```ts
import {Observable} from 'rxjs';
import type {TOption} from '../../types/option.interface';

export type FilterType = 'select' | 'multi' | 'text' | 'bool' | 'dateRange' | 'number';

// Un filtro di elenco: chiave = parametro di ricerca dell'API.
export interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  // select/multi: opzioni statiche o caricate (una volta per pagina).
  options?: TOption[] | (() => Observable<TOption[]>);
  // In barra accanto alla ricerca (max 3 per pagina); sempre anche negli avanzati.
  inline?: boolean;
  // Sezione del dialog avanzato.
  group?: string;
  // Valore di partenza (es. deleted=false); un filtro al suo default non fa chip.
  defaultValue?: unknown;
}

export type FilterValues = Record<string, unknown>;

export interface FilterChip {
  key: string;
  text: string;
}

export const BOOL_OPTIONS: TOption[] = [
  {label: 'Sì', value: true},
  {label: 'No', value: false},
];

// Solo negli elenchi con Ripristina.
export const DELETED_FILTER: FilterDef = {
  key: 'deleted',
  label: 'Mostra',
  type: 'select',
  group: 'Record',
  defaultValue: false,
  options: [
    {label: 'Attivi', value: false},
    {label: 'Eliminati', value: true},
  ],
};
```

- [ ] **Step 2: `filter-values.ts`**

```ts
import {DateHelper} from '../../helpers/date.helper';
import type {TOption} from '../../types/option.interface';
import {FilterChip, FilterDef, FilterValues} from './filter-def';

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.every(x => x === null || x === undefined || x === ''));

const isoDay = (v: unknown): string | null =>
  v instanceof Date ? DateHelper.toLocalIsoString(v) ?? null : typeof v === 'string' && v ? v.slice(0, 10) : null;

const itDay = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '');

const isDefault = (def: FilterDef, v: unknown): boolean =>
  def.defaultValue !== undefined && v === def.defaultValue;

// Valori iniziali: i default delle definizioni.
export function initialValues(defs: FilterDef[]): FilterValues {
  const out: FilterValues = {};
  for (const d of defs) if (d.defaultValue !== undefined) out[d.key] = d.defaultValue;
  return out;
}

// Oggetto passato a service.search(): niente vuoti, date AAAA-MM-GG, intervalli come array.
export function toSearchParams(defs: FilterDef[], values: FilterValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    const v = values[d.key];
    if (isEmpty(v)) continue;
    if (d.type === 'dateRange') {
      const [from, to] = (v as unknown[]) ?? [];
      out[d.key] = [isoDay(from), isoDay(to)].map(x => x ?? '');
    } else {
      out[d.key] = v;
    }
  }
  return out;
}

function optionLabel(options: TOption[] | undefined, v: unknown): string {
  return options?.find(o => o.value === v)?.label ?? String(v);
}

// Un chip per ogni filtro valorizzato e diverso dal suo default.
export function toChips(defs: FilterDef[], values: FilterValues, optionsByKey: Record<string, TOption[]>): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const d of defs) {
    const v = values[d.key];
    if (isEmpty(v) || isDefault(d, v)) continue;
    let text: string;
    switch (d.type) {
      case 'select':
      case 'bool':
        text = optionLabel(optionsByKey[d.key], v);
        break;
      case 'multi':
        text = (v as unknown[]).map(x => optionLabel(optionsByKey[d.key], x)).join(', ');
        break;
      case 'dateRange': {
        const [from, to] = (v as unknown[]).map(isoDay);
        text = from && to ? `${itDay(from)}–${itDay(to)}` : from ? `dal ${itDay(from)}` : `fino al ${itDay(to)}`;
        break;
      }
      default:
        text = String(v);
    }
    chips.push({key: d.key, text: `${d.label}: ${text}`});
  }
  return chips;
}

// Numero di filtri avanzati (non in linea) attivi, per il badge del pulsante.
export function countAdvanced(defs: FilterDef[], values: FilterValues): number {
  return defs.filter(d => !d.inline && !isEmpty(values[d.key]) && !isDefault(d, values[d.key])).length;
}

// Query param con lo stesso nome di un filtro → valore (link dalla dashboard).
export function fromQueryParams(defs: FilterDef[], params: Record<string, string | string[] | undefined>): FilterValues {
  const out: FilterValues = {};
  for (const d of defs) {
    const raw = params[d.key];
    if (raw === undefined || raw === '') continue;
    const s = Array.isArray(raw) ? raw.join(',') : raw;
    switch (d.type) {
      case 'bool':
        out[d.key] = s === 'true' || s === '1';
        break;
      case 'number':
        out[d.key] = Number(s);
        break;
      case 'multi':
        out[d.key] = s.split(',').filter(Boolean);
        break;
      case 'dateRange':
        out[d.key] = s.split(',').map(x => x || null);
        break;
      case 'select': {
        const opts = Array.isArray(d.options) ? d.options : null;
        const match = opts?.find(o => String(o.value) === s);
        out[d.key] = match ? match.value : /^\d+$/.test(s) ? Number(s) : s;
        break;
      }
      default:
        out[d.key] = s;
    }
  }
  return out;
}

// Toglie un filtro: torna al default, se c'è.
export function clearKey(defs: FilterDef[], values: FilterValues, key: string): FilterValues {
  const def = defs.find(d => d.key === key);
  const next = {...values};
  if (def?.defaultValue !== undefined) next[key] = def.defaultValue; else delete next[key];
  return next;
}
```

- [ ] **Step 3: Verifica compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: "generation complete", nessun `✘` (i file non sono ancora importati: si compila solo quando usati; la verifica vera arriva al Task 4).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/core/components/list/filter-def.ts frontend/src/app/core/components/list/filter-values.ts
git commit -m "feat(ui): definizioni e helper dei filtri di elenco"
```

---

### Task 3: Dialog dei filtri avanzati

**Files:**
- Create: `frontend/src/app/core/components/list/advanced-filters-dialog.component.ts`

**Interfaces:**
- Consumes: `FilterDef`, `FilterValues`, `BOOL_OPTIONS`.
- Produces: `AdvancedFiltersDialogComponent`, dati `AdvancedFiltersData {defs: FilterDef[]; values: FilterValues; options: Record<string, TOption[]>}`; chiude con `FilterValues` (Applica) o `'clear'` (Azzera) o `undefined` (Annulla).

- [ ] **Step 1: Componente**

```ts
import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import {BOOL_OPTIONS, FilterDef, FilterValues} from './filter-def';

export interface AdvancedFiltersData {
  defs: FilterDef[];
  values: FilterValues;
  options: Record<string, TOption[]>;
}

// Opzioni oltre questa soglia: select con ricerca.
const LONG_LIST = 12;

const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v !== 'string' || !v) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

@Component({
  selector: 'app-advanced-filters-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatDatepickerModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2 mat-dialog-title>Filtri avanzati</h2>
    <mat-dialog-content>
      @for (g of groups; track g.name) {
        @if (g.name) { <h3 class="adv-group">{{ g.name }}</h3> }
        <div class="adv-grid">
          @for (d of g.defs; track d.key) {
            @switch (d.type) {
              @case ('select') {
                @if (opts(d).length > LONG_LIST) {
                  <app-filterable-select [label]="d.label" [options]="opts(d)" [(ngModel)]="values[d.key]"
                                         [ngModelOptions]="{standalone: true}"></app-filterable-select>
                } @else {
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>{{ d.label }}</mat-label>
                    <mat-select [(ngModel)]="values[d.key]">
                      @if (d.defaultValue === undefined) { <mat-option [value]="null">(qualsiasi)</mat-option> }
                      @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                    </mat-select>
                  </mat-form-field>
                }
              }
              @case ('bool') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-select [(ngModel)]="values[d.key]">
                    <mat-option [value]="null">(qualsiasi)</mat-option>
                    @for (o of boolOptions; track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              }
              @case ('multi') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-select multiple [(ngModel)]="values[d.key]">
                    @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
                  </mat-select>
                </mat-form-field>
              }
              @case ('dateRange') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <mat-date-range-input [rangePicker]="picker">
                    <input matStartDate placeholder="dal" [ngModel]="rangeFrom(d.key)" (ngModelChange)="setRange(d.key, 0, $event)">
                    <input matEndDate placeholder="al" [ngModel]="rangeTo(d.key)" (ngModelChange)="setRange(d.key, 1, $event)">
                  </mat-date-range-input>
                  <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
                  <mat-date-range-picker #picker></mat-date-range-picker>
                </mat-form-field>
              }
              @case ('number') {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <input matInput type="number" [(ngModel)]="values[d.key]">
                </mat-form-field>
              }
              @default {
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>{{ d.label }}</mat-label>
                  <input matInput [(ngModel)]="values[d.key]" (keyup.enter)="apply()">
                </mat-form-field>
              }
            }
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-stroked-button type="button" (click)="ref.close('clear')">Azzera</button>
      <span style="flex: 1;"></span>
      <button mat-button type="button" (click)="ref.close()">Annulla</button>
      <button mat-flat-button type="button" (click)="apply()">Applica</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .adv-group { font-size: 0.9rem; font-weight: 600; margin: 12px 0 8px; color: #374151; }
    .adv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  `],
})
export class AdvancedFiltersDialogComponent {
  readonly ref = inject(MatDialogRef<AdvancedFiltersDialogComponent>);
  readonly data = inject<AdvancedFiltersData>(MAT_DIALOG_DATA);
  readonly LONG_LIST = LONG_LIST;
  readonly boolOptions = BOOL_OPTIONS;
  values: Record<string, any> = {...this.data.values};

  // Gruppi nell'ordine di prima comparsa; filtri senza gruppo in testa.
  readonly groups = this.data.defs.reduce<{name: string; defs: FilterDef[]}[]>((acc, d) => {
    const name = d.group ?? '';
    const g = acc.find(x => x.name === name) ?? (acc.push({name, defs: []}), acc[acc.length - 1]);
    g.defs.push(d);
    return acc;
  }, []).sort((a, b) => (a.name === '' ? -1 : b.name === '' ? 1 : 0));

  opts(d: FilterDef): TOption[] {
    return this.data.options[d.key] ?? [];
  }

  rangeFrom(key: string): Date | null {
    return toDate((this.values[key] as unknown[] | undefined)?.[0]);
  }

  rangeTo(key: string): Date | null {
    return toDate((this.values[key] as unknown[] | undefined)?.[1]);
  }

  setRange(key: string, i: 0 | 1, v: Date | null): void {
    const cur = [...((this.values[key] as unknown[] | undefined) ?? [null, null])];
    cur[i] = v;
    this.values[key] = cur;
  }

  apply(): void {
    this.ref.close(this.values);
  }
}
```

- [ ] **Step 2: Commit** (si compila con il Task 4, che lo importa)

```bash
git add frontend/src/app/core/components/list/advanced-filters-dialog.component.ts
git commit -m "feat(ui): dialog generico dei filtri avanzati"
```

---

### Task 4: Barra filtri (`app-list-filters`)

**Files:**
- Create: `frontend/src/app/core/components/list/list-filters.component.ts`

**Interfaces:**
- Consumes: Task 2, Task 3.
- Produces: `<app-list-filters [defs] [values] [placeholder] (valuesChange) (quickSearch)>`. `valuesChange` emette il nuovo `FilterValues` completo (dopo select in linea, dialog, chip, Azzera); `quickSearch` emette il testo libero (debounce 200 ms).

- [ ] **Step 1: Componente**

```ts
import {ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatChipsModule} from '@angular/material/chips';
import {Subject, debounceTime, forkJoin, of, isObservable} from 'rxjs';
import {FilterableSelectComponent} from '../filterable-select.component';
import type {TOption} from '../../types/option.interface';
import {BOOL_OPTIONS, FilterChip, FilterDef, FilterValues} from './filter-def';
import {clearKey, countAdvanced, initialValues, toChips} from './filter-values';
import {AdvancedFiltersData, AdvancedFiltersDialogComponent} from './advanced-filters-dialog.component';

const LONG_LIST = 12;

@Component({
  selector: 'app-list-filters',
  standalone: true,
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatChipsModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="lf-bar">
      <mat-form-field class="lf-search" subscriptSizing="dynamic">
        <mat-icon matIconPrefix>search</mat-icon>
        <input matInput [placeholder]="placeholder" [(ngModel)]="text" (ngModelChange)="text$.next($event)">
      </mat-form-field>
      @for (d of inlineDefs; track d.key) {
        @if (d.type !== 'bool' && opts(d).length > LONG_LIST) {
          <app-filterable-select class="lf-inline" [label]="d.label" [options]="opts(d)"
                                 [ngModel]="values[d.key] ?? null" (ngModelChange)="set(d.key, $event)"></app-filterable-select>
        } @else {
          <mat-form-field class="lf-inline" subscriptSizing="dynamic">
            <mat-label>{{ d.label }}</mat-label>
            <mat-select [ngModel]="values[d.key] ?? null" (ngModelChange)="set(d.key, $event)">
              @if (d.defaultValue === undefined) { <mat-option [value]="null">(tutti)</mat-option> }
              @for (o of opts(d); track o.value) { <mat-option [value]="o.value">{{ o.label }}</mat-option> }
            </mat-select>
          </mat-form-field>
        }
      }
      <button mat-stroked-button type="button" class="lf-adv" (click)="openAdvanced()">
        <mat-icon>filter_list</mat-icon> Filtri avanzati@if (advancedCount) { ({{ advancedCount }}) }
      </button>
    </div>
    @if (chips.length) {
      <div class="lf-chips">
        <mat-chip-set aria-label="Filtri attivi">
          @for (c of chips; track c.key) {
            <mat-chip (removed)="remove(c.key)">
              {{ c.text }}
              <button matChipRemove [attr.aria-label]="'Togli ' + c.text"><mat-icon>cancel</mat-icon></button>
            </mat-chip>
          }
        </mat-chip-set>
        <button mat-button type="button" (click)="reset()">Azzera</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .lf-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .lf-search { flex: 1 1 260px; }
    .lf-inline { flex: 0 1 220px; min-width: 160px; }
    .lf-adv { height: 56px; }
    .lf-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
  `],
})
export class ListFiltersComponent implements OnInit, OnChanges {
  @Input({required: true}) defs: FilterDef[] = [];
  @Input() values: FilterValues = {};
  @Input() placeholder = 'Cerca...';
  @Output() valuesChange = new EventEmitter<FilterValues>();
  @Output() quickSearch = new EventEmitter<string>();

  private dialog = inject(MatDialog);
  readonly text$ = new Subject<string>();
  text = '';
  options: Record<string, TOption[]> = {};
  chips: FilterChip[] = [];
  advancedCount = 0;

  get inlineDefs(): FilterDef[] {
    return this.defs.filter(d => d.inline);
  }

  ngOnInit(): void {
    this.text$.pipe(debounceTime(200)).subscribe(t => this.quickSearch.emit(t));
    // Opzioni: statiche subito, caricate una volta; i chip si ricalcolano all'arrivo.
    for (const d of this.defs) {
      if (d.type === 'bool') this.options[d.key] = BOOL_OPTIONS;
      else if (Array.isArray(d.options)) this.options[d.key] = d.options;
    }
    const loaders = this.defs.filter(d => typeof d.options === 'function');
    if (loaders.length) {
      forkJoin(Object.fromEntries(loaders.map(d => {
        const src = (d.options as () => unknown)();
        return [d.key, isObservable(src) ? src : of([])];
      }))).subscribe(res => {
        this.options = {...this.options, ...(res as Record<string, TOption[]>)};
        this.refresh();
      });
    }
    this.refresh();
  }

  ngOnChanges(_: SimpleChanges): void {
    this.refresh();
  }

  opts(d: FilterDef): TOption[] {
    return this.options[d.key] ?? [];
  }

  set(key: string, v: unknown): void {
    this.emit({...this.values, [key]: v});
  }

  remove(key: string): void {
    this.emit(clearKey(this.defs, this.values, key));
  }

  reset(): void {
    this.emit(initialValues(this.defs));
  }

  openAdvanced(): void {
    this.dialog.open<AdvancedFiltersDialogComponent, AdvancedFiltersData, FilterValues | 'clear'>(
      AdvancedFiltersDialogComponent,
      {width: '900px', maxWidth: '95vw', data: {defs: this.defs, values: this.values, options: this.options}},
    ).afterClosed().subscribe(r => {
      if (r === 'clear') this.reset();
      else if (r) this.emit(r);
    });
  }

  private emit(v: FilterValues): void {
    this.values = v;
    this.refresh();
    this.valuesChange.emit(v);
  }

  private refresh(): void {
    this.chips = toChips(this.defs, this.values, this.options);
    this.advancedCount = countAdvanced(this.defs, this.values);
  }
}
```

Nota `forkJoin` con Observable HTTP: completano dopo la risposta, quindi funziona; se un loader non completa mai, i chip restano col valore grezzo (accettabile, vedi Review Focus).

- [ ] **Step 2: Commit** (compilazione verificata al Task 7 con la prima pagina migrata)

```bash
git add frontend/src/app/core/components/list/list-filters.component.ts
git commit -m "feat(ui): barra filtri con select in linea e chip"
```

---

### Task 5: Toolbar e paginazione ricordata

**Files:**
- Create: `frontend/src/app/core/components/list/list-toolbar.component.ts`
- Modify: `frontend/src/app/core/components/abstract-data-table.component.ts`

**Interfaces:**
- Produces:
  - `<app-list-toolbar [count] [createLabel] [columns] [selectedColumns] [compareColumns] (create) (export) (selectedColumnsChange)>` — `columns` null = niente scelta colonne; `(export)` non collegato = niente pulsante (input `exportable`).
  - `AbstractDataTableComponent`: `rowsPerPageOptions = [25, 50, 100]`, `pageSize: number` (letto da storage), `onPage(e: PageEvent)`, `protected listKey(): string` (default `entityLabel()`).

- [ ] **Step 1: `list-toolbar.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {HasRoleDirective} from '../../directives/has-role.directive';

// "Elenco (N)" a sinistra; Colonne, Esporta CSV, + Nuovo a destra, sempre in quest'ordine.
@Component({
  selector: 'app-list-toolbar',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, HasRoleDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="lt">
      <h3 class="lt-count">Elenco ({{ count }})</h3>
      <span style="flex: 1;"></span>
      @if (columns) {
        <mat-form-field subscriptSizing="dynamic" class="lt-cols">
          <mat-label>Colonne visibili</mat-label>
          <mat-select multiple [ngModel]="selectedColumns" [compareWith]="compareColumns"
                      (ngModelChange)="selectedColumnsChange.emit($event)">
            @for (col of columns; track col.field) { <mat-option [value]="col">{{ col.header }}</mat-option> }
          </mat-select>
        </mat-form-field>
      }
      @if (exportable) {
        <button mat-stroked-button type="button" (click)="export.emit()"><mat-icon>ios_share</mat-icon> Esporta CSV</button>
      }
      @if (createLabel) {
        <button mat-flat-button type="button" (click)="create.emit()" [appHasRole]="['Admin', 'Operatore']">
          <mat-icon>add</mat-icon> {{ createLabel }}
        </button>
      }
    </div>
  `,
  styles: [`
    .lt { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .lt-count { margin: 0; }
    .lt-cols { min-width: 220px; }
  `],
})
export class ListToolbarComponent {
  @Input() count = 0;
  @Input() createLabel: string | null = null;
  @Input() exportable = false;
  @Input() columns: IColumnDef[] | null = null;
  @Input() selectedColumns: IColumnDef[] = [];
  @Input() compareColumns: (a: IColumnDef, b: IColumnDef) => boolean = (a, b) => a?.field === b?.field;
  @Output() create = new EventEmitter<void>();
  @Output() export = new EventEmitter<void>();
  @Output() selectedColumnsChange = new EventEmitter<IColumnDef[]>();
}
```

(`IColumnDef` è un tipo globale già usato da `abstract-data-table.component.ts`; verificare con `grep -rn "interface IColumnDef" frontend/src` e importarlo se non è ambient. Percorso della direttiva: verificare con `grep -rln "appHasRole" frontend/src/app/core/directives`.)

- [ ] **Step 2: `abstract-data-table.component.ts`**

Sostituire `rowsPerPageOptions: number[] = [10, 20, 50];` con:

```ts
  readonly rowsPerPageOptions: number[] = [25, 50, 100];
  pageSize = 25;
```

In `ngOnInit()` aggiungere in testa `this.pageSize = this.readPageSize();` e aggiungere i metodi:

```ts
  // Chiave dell'elenco per le preferenze salvate (righe per pagina).
  protected listKey(): string {
    return this.entityLabel();
  }

  private readPageSize(): number {
    try {
      const n = Number(localStorage.getItem(`list-page-size:${this.listKey()}`));
      return this.rowsPerPageOptions.includes(n) ? n : 25;
    } catch {
      return 25;
    }
  }

  onPage(e: PageEvent): void {
    if (e.pageSize === this.pageSize) return;
    this.pageSize = e.pageSize;
    try {
      localStorage.setItem(`list-page-size:${this.listKey()}`, String(e.pageSize));
    } catch {
      // storage non disponibile: vale solo per questa sessione
    }
  }
```

con `import {MatPaginator, PageEvent} from '@angular/material/paginator';`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/components/list/list-toolbar.component.ts frontend/src/app/core/components/abstract-data-table.component.ts
git commit -m "feat(ui): toolbar di elenco e righe per pagina ricordate"
```

---

### Task 6: Stato dei filtri nella pagina (`AbstractComponent`)

**Files:**
- Modify: `frontend/src/app/core/components/abstract.component.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces in `AbstractComponent<T>`:
  - `filterDefs: FilterDef[]` (le pagine lo assegnano nel costruttore o come campo);
  - `filterValues: FilterValues`;
  - `onFiltersChange(v: FilterValues): void` — ricarica dal server;
  - `onQuickSearch(text: string): void` — filtra lato client i dati caricati;
  - `protected initFromRoute(route: ActivatedRoute, open?: (item: T) => void): void` — legge query param → filtri, carica, apre `selectedId`;
  - `protected mapSearchParams(p): Record<string, unknown>` — hook, default identità;
  - `onSearch(filters)` resta per compatibilità finché tutte le pagine non sono migrate, poi si rimuove (Task 12).

- [ ] **Step 1: Implementazione**

Aggiungere a `AbstractComponent`:

```ts
  filterDefs: FilterDef[] = [];
  filterValues: FilterValues = {};
  private quickText = '';

  onFiltersChange(values: FilterValues): void {
    this.filterValues = values;
    this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, values));
    this.loadAll();
    this.resetPagingCount++;
  }

  onQuickSearch(text: string): void {
    this.quickText = (text ?? '').toLowerCase();
    this.applyQuick();
    this.resetPagingCount++;
  }

  // Ricerca libera sui dati già caricati con i filtri correnti.
  protected applyQuick(): void {
    const q = this.quickText;
    this.list = q ? this.allItems.filter(i => this.flatValues(i).some(v => String(v).toLowerCase().includes(q))) : [...this.allItems];
  }

  // Link dalla dashboard: query param con il nome di un filtro lo valorizzano;
  // ?selectedId=N apre la scheda dopo il caricamento.
  protected initFromRoute(route: ActivatedRoute, open?: (item: T) => void): void {
    route.queryParams.subscribe(params => {
      this.filterValues = {...initialValues(this.filterDefs), ...fromQueryParams(this.filterDefs, params)};
      this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, this.filterValues));
      const selectedId = params['selectedId'] ? Number(params['selectedId']) : null;
      this.loadAll(selected => {
        if (!selectedId || !open) return;
        const item = selected.find(i => i.id === selectedId);
        if (item) setTimeout(() => open(item));
      });
    });
  }
```

Cambiare `loadAll()` in:

```ts
  loadAll(after?: (list: T[]) => void) {
    this.loading = true;
    this.service.search(this.lastFilters).subscribe((result: T[]) => {
      this.allItems = this.service.fromPlain(result);
      this.applyQuick();
      this.loading = false;
      after?.(this.allItems);
    });
  }
```

e `ngOnInit()` in:

```ts
  ngOnInit() {
    this.filterValues = initialValues(this.filterDefs);
    this.lastFilters = this.mapSearchParams(toSearchParams(this.filterDefs, this.filterValues));
    this.loadAll();
  }

  // Hook: le pagine possono tradurre filtri di sola UI in parametri dell'API (es. Anno delle fatture).
  protected mapSearchParams(p: Record<string, unknown>): Record<string, unknown> {
    return p;
  }
```

Import: `ActivatedRoute` da `@angular/router`; `FilterDef`, `FilterValues` da `./list/filter-def`; `fromQueryParams`, `initialValues`, `toSearchParams` da `./list/filter-values`. Le sottoclassi che fanno override di `loadAll()` (es. `AssetsComponent`, `UtilitiesComponent`) si sistemano nei loro task.

- [ ] **Step 2: Verifica compilazione**

Run: `docker logs --since 60s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"`
Expected: nessun `✘`. Se una sottoclasse rompe per la firma di `loadAll`, aggiungere il parametro opzionale `after?: (list: T[]) => void` anche nell'override (verrà riscritto nel task della pagina).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/components/abstract.component.ts
git commit -m "feat(ui): stato dei filtri e query param nella pagina elenco"
```

---

### Task 7: Pagina pilota — Contratti di fornitura

Prima pagina migrata: fissa il modello per le altre.

**Files:**
- Create: `frontend/src/app/pages/contracts/contracts-filters.ts`
- Modify: `pages/contracts/contracts.component.{ts,html}`, `pages/contracts/data-table-contracts.component.{ts,html}`
- Delete: `pages/contracts/search-contracts.component.{ts,html}`, `pages/contracts/contract-filter-dialog.component.ts`

**Interfaces:**
- Consumes: Task 2–6.

- [ ] **Step 1: `contracts-filters.ts`**

```ts
import {inject} from '@angular/core';
import {map} from 'rxjs';
import {DELETED_FILTER, FilterDef} from '../../core/components/list/filter-def';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';

// Da chiamare in un injection context (campo o costruttore del componente).
export function contractFilters(): FilterDef[] {
  const parties = inject(ThirdPartiesService);
  return [
    {key: 'supplier_id_fk', label: 'Fornitore', type: 'select', inline: true,
      options: () => parties.search({deleted: false, roles: PartyRole.SUPPLIER} as never).pipe(
        map(list => list.map(p => ({label: partyName(p), value: p.id})).sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'closed', label: 'Stato', type: 'select', inline: true,
      options: [{label: 'Aperti', value: false}, {label: 'Chiusi', value: true}]},
    {key: 'cig_contract', label: 'CIG', type: 'text', group: 'Dati contratto'},
    {key: 'consip_order', label: 'Numero ordine (ODA)', type: 'text', group: 'Dati contratto'},
    {key: 'supply_expiry_date_range', label: 'Scadenza fornitura', type: 'dateRange', group: 'Date'},
    {key: 'missing_cig', label: 'Senza CIG (non esclusi)', type: 'bool', group: 'Segnalazioni'},
    DELETED_FILTER,
  ];
}
```


- [ ] **Step 2: `contracts.component.ts`**

Rimuovere l'override di `ngOnInit` con la logica `missing_cig`/`supply_expiry_date_range` e i toast; sostituire con:

```ts
  override filterDefs = contractFilters();

  override ngOnInit(): void {
    this.initFromRoute(this.route, item => this.dataTable?.openEditDialog(item));
  }
```

Import `contractFilters`, togliere `SearchContractsComponent` dagli `imports` e aggiungere `ListFiltersComponent`.

- [ ] **Step 3: `contracts.component.html`**

```html
<div style="padding: 1rem;">
  <h1>Contratti di fornitura</h1>
  <p class="list-subtitle">Contratti di fornitura e utenze che coprono.</p>
  <app-list-filters [defs]="filterDefs" [values]="filterValues" placeholder="Cerca CIG, fornitore, convenzione..."
                    (valuesChange)="onFiltersChange($event)" (quickSearch)="onQuickSearch($event)"></app-list-filters>
  <div style="margin-top: 1rem;">
    <app-data-table-contracts
      #dataTable
      [data]="list"
      [loading]="loading"
      (onSave)="onSave($event)"
      (onDelete)="onDelete($event)"
      (onCreate)="onCreate($event)"
      (onRestore)="onRestore($event)"
      [resetPagingTrigger]="resetPagingCount"
    ></app-data-table-contracts>
  </div>
</div>
```

Aggiungere in `frontend/src/styles.scss`: `.list-subtitle { color: #6A7282; margin: -0.5rem 0 1rem; }`.

- [ ] **Step 4: `data-table-contracts.component.html`**

Sostituire il blocco iniziale (titolo "Elenco", pulsante "Aggiungi contratto di fornitura", select "Colonne visibili") con:

```html
<app-list-toolbar [count]="data.length" createLabel="Nuovo contratto di fornitura"
                  [columns]="allColumns" [selectedColumns]="selectedColumns"
                  (selectedColumnsChange)="selectedColumns = $event; onColumnsChange()"
                  (create)="openCreateDialog()"></app-list-toolbar>
```

(se la tabella ha già l'export, aggiungere `[exportable]="true" (export)="exportToCSV()"`; i nomi `allColumns`/`selectedColumns`/`onColumnsChange` sono quelli già presenti nel `.ts`.) Il paginatore in fondo diventa:

```html
<mat-paginator #paginator [pageSizeOptions]="rowsPerPageOptions" [pageSize]="pageSize" showFirstLastButtons (page)="onPage($event)"></mat-paginator>
```

Aggiungere `ListToolbarComponent` agli `imports` del `.ts`.

- [ ] **Step 5: Eliminare i vecchi file**

```bash
git rm frontend/src/app/pages/contracts/search-contracts.component.ts frontend/src/app/pages/contracts/search-contracts.component.html frontend/src/app/pages/contracts/contract-filter-dialog.component.ts
```

- [ ] **Step 6: Verifica**

Run: `docker logs --since 90s utenzepa-frontend-1 2>&1 | grep -E "✘|generation"` → nessun `✘`.
E2E (Playwright MCP, utente temporaneo come da CLAUDE.md): `/contracts` → select Stato "Aperti" → elenco ricaricato e chip "Stato: Aperti" (i chip coprono tutti i filtri attivi, anche quelli in linea); avanzati → CIG "Z" → chip; × sul chip → tolto; dashboard "Contratti di fornitura senza CIG" → chip "Senza CIG (non esclusi): Sì"; cambio righe a 50, ricarica pagina → resta 50.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/pages/contracts/contracts-filters.ts frontend/src/app/pages/contracts/contracts.component.ts frontend/src/app/pages/contracts/contracts.component.html frontend/src/app/pages/contracts/data-table-contracts.component.ts frontend/src/app/pages/contracts/data-table-contracts.component.html frontend/src/styles.scss
git commit -m "feat(ui): elenco contratti di fornitura con filtri uniformi"
```

---

### Task 8: Fatture e Convenzioni CONSIP

Stesso schema del Task 7 (filters file, pagina con `initFromRoute`, `app-list-filters`, `app-list-toolbar`, paginatore, eliminazione di `search-*` e `*-filter-dialog`).

**Files:**
- Create: `pages/invoices/invoices-filters.ts`, `pages/consip-agreement/consip-agreement-filters.ts`
- Modify: `pages/invoices/invoices.component.{ts,html}`, `pages/invoices/data-table-invoices.component.{ts,html}`, `pages/consip-agreement/consip-agreement.component.{ts,html}`, `pages/consip-agreement/data-table-consip-agreement.component.{ts,html}`
- Delete: `pages/invoices/search-invoices.component.{ts,html}`, `pages/invoices/invoice-filter-dialog.component.{ts,html}`, `pages/consip-agreement/search-consip-agreement.component.{ts,html}`, `pages/consip-agreement/consip-agreement-filter-dialog.component.ts`

- [ ] **Step 1: `invoices-filters.ts`**

Le opzioni caricate si copiano dalle `ngOnInit` del vecchio `invoice-filter-dialog.component.ts` (contratti: `cig_contract || 'Contratto senza CIG (id N)'`; capitoli: stesso label del dialog; utenze: stesso label del dialog), trasformate in funzioni `() => service.search({deleted: false}).pipe(map(...))`.

```ts
export function invoiceFilters(): FilterDef[] {
  const contracts = inject(ContractService);
  const chapters = inject(BudgetChapterService);
  const utilities = inject(UtilityService);
  const year = new Date().getFullYear();
  return [
    {key: 'contratto_id_fk', label: 'Contratto di fornitura', type: 'select', inline: true,
      options: () => contracts.search({deleted: false} as never).pipe(map(l => l
        .map(c => ({label: c.cig_contract || `Contratto senza CIG (id ${c.id})`, value: c.id}))
        .sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'year', label: 'Anno', type: 'select', inline: true,
      options: Array.from({length: year - 2018}, (_, i) => year - i).map(y => ({label: String(y), value: y}))},
    {key: 'invoice_id', label: 'Numero fattura', type: 'text', group: 'Documento'},
    {key: 'protocol_number', label: 'Numero protocollo', type: 'text', group: 'Documento'},
    {key: 'notes_on_invoices', label: 'Note', type: 'text', group: 'Documento'},
    {key: 'utility_id', label: 'Utenza', type: 'select', group: 'Righe',
      options: () => utilities.search({deleted: false} as never).pipe(map(l => l
        .map(u => ({label: u.utility_id || `Utenza #${u.id}`, value: u.id}))
        .sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'budget_chapter_ids', label: 'Capitoli (da impegni delle righe)', type: 'multi', group: 'Righe',
      options: () => chapters.search({deleted: false} as never).pipe(map(l => l
        .map(c => ({label: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''}`.trim(), value: c.id}))))},
    {key: 'invoice_date_range', label: 'Data fattura', type: 'dateRange', group: 'Date'},
    {key: 'net_amount_excl_vat', label: 'Imponibile', type: 'number', group: 'Importi'},
    {key: 'last_invoice_arrears', label: 'Morosità', type: 'number', group: 'Importi'},
    DELETED_FILTER,
  ];
}
```

Le chiavi `year` e `invoice_date_range` non esistono nell'API (che vuole `invoice_date_from`/`invoice_date_to`): si traducono con l'hook `mapSearchParams` del Task 6. In `InvoicesComponent`:

```ts
  protected override mapSearchParams(p: Record<string, unknown>): Record<string, unknown> {
    const {year, invoice_date_range, ...rest} = p as {year?: number; invoice_date_range?: string[]} & Record<string, unknown>;
    const [from, to] = invoice_date_range ?? [];
    if (from || to) {
      if (from) rest['invoice_date_from'] = from;
      if (to) rest['invoice_date_to'] = to;
    } else if (year) {
      rest['invoice_date_from'] = `${year}-01-01`;
      rest['invoice_date_to'] = `${year}-12-31`;
    }
    return rest;
  }
```

Verificare con `grep -n "invoice_date_from\|invoice_date_to" backend/src/apis/invoices/dto/search-invoice.dto.ts` che i nomi siano questi; verificare i nomi dei service (`ContractService`, `BudgetChapterService`, `UtilityService`) con gli import del vecchio dialog.

- [ ] **Step 2: `consip-agreement-filters.ts`**

Opzioni `safeguardOptions` copiate dal vecchio `consip-agreement-filter-dialog.component.ts`; fornitori come in Task 7.

```ts
export function consipAgreementFilters(): FilterDef[] {
  const parties = inject(ThirdPartiesService);
  return [
    {key: 'supplier_id', label: 'Fornitore', type: 'select', inline: true,
      options: () => parties.search({deleted: false, roles: PartyRole.SUPPLIER} as never).pipe(
        map(list => list.map(p => ({label: partyName(p), value: p.id})).sort((a, b) => a.label.localeCompare(b.label))))},
    {key: 'name', label: 'Nome', type: 'text', group: 'Convenzione'},
    {key: 'cig_master', label: 'CIG master', type: 'text', group: 'Convenzione'},
    {key: 'description', label: 'Descrizione', type: 'text', group: 'Convenzione'},
    {key: 'safeguard', label: 'Salvaguardia', type: 'bool', group: 'Convenzione'},
    {key: 'expiration_date_range', label: 'Scadenza', type: 'dateRange', group: 'Date'},
    DELETED_FILTER,
  ];
}
```

(se `safeguard` nel vecchio dialog non è sì/no, usare `type: 'select'` con le `safeguardOptions` copiate.)

- [ ] **Step 3: Pagine e tabelle** — come Task 7 Step 2–4: `override filterDefs = invoiceFilters();` / `consipAgreementFilters()`, `ngOnInit` con `initFromRoute`, HTML pagina con `<h1>Fatture</h1>` (sottotitolo "Fatture dei fornitori, righe per utenza e impegni.") e `<h1>Convenzioni CONSIP</h1>`; toolbar `createLabel="Nuova fattura"` / `"Nuova convenzione"`; paginatore con `pageSize`/`onPage`.

- [ ] **Step 4: Eliminare i vecchi file** (`git rm` dei 6 file elencati).

- [ ] **Step 5: Verifica** — log `ng serve` senza `✘`; E2E `/invoices`: Anno 2025 → solo fatture 2025; avanzati data 01/03/2025–31/03/2025 → chip data, il chip Anno resta ma l'API usa le date (verificare nella tab Network il parametro); Azzera.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/invoices/ frontend/src/app/pages/consip-agreement/
git commit -m "feat(ui): fatture e convenzioni CONSIP con filtri uniformi"
```

(`git add` di cartelle: prima `git status` per verificare che contengano solo file del task.)

---

### Task 9: Utenze

**Files:**
- Create: `pages/utilities/utilities-filters.ts`
- Modify: `pages/utilities/utilities.component.{ts,html}`, `pages/utilities/data-table-utilities.component.{ts,html}`
- Delete: `pages/utilities/search-utilities.component.{ts,html}`, `pages/utilities/utility-filter-dialog.component.{ts,html}`

- [ ] **Step 1: `utilities-filters.ts`**

Tutti i campi del vecchio dialog, con le opzioni copiate dal vecchio `utility-filter-dialog.component.ts` (array statici `phaseTypeOptions`, `disconnectableFilterOptions`, `gasUseOptions`, `costStatusOptions`, `maintenanceStatusOptions`, `plantTypeOptions`, `safeguardOptions`, `statusOptions`, ARERA; caricate: tipi utenza, immobili, funzioni, fornitori, capitoli, controparti — stesse chiamate e stesse label della sua `ngOnInit`).

| key | label | type | inline | group |
|---|---|---|---|---|
| `utility_type_id_fk` | Tipo utenza | select (caricata) | sì | |
| `supply_active` | Fornitura attiva | bool | sì | |
| `supplier_id_fk` | Fornitore | select (caricata) | sì | |
| `utility_id` | Codice (POD/PDR/matricola) | text | | Identificativi |
| `meter_number` | Numero contatore | text | | Identificativi |
| `utility_code` | Codice cliente fornitore | text | | Identificativi |
| `asset_id` | Immobile | select (caricata) | | Collegamenti |
| `asset_function_ids` | Funzione immobile | multi (caricata) | | Collegamenti |
| `plant_types` | Tipo impianto | multi | | Collegamenti |
| `party_id` | Controparte | select (caricata) | | Collegamenti |
| `supplier_address` | Indirizzo di fornitura | text | | Collegamenti |
| `arera_category` | Tipologia ARERA | select | | Tecnici |
| `gas_use_category` | Categoria d'uso gas | select | | Tecnici |
| `power_kw_electric` | Potenza (kW) | text | | Tecnici |
| `voltage_kw_electric` | Tensione | text | | Tecnici |
| `phase_type_electric` | Tipo fase | select | | Tecnici |
| `disconnectable` | Disalimentabile | select | | Tecnici |
| `wbs_gas_element` | WBS gas | text | | Tecnici |
| `meter_removed` | Contatore rimosso | bool | | Stato |
| `meter_verified` | Contatore verificato | bool | | Stato |
| `cost_status` | A carico di | select | | Stato |
| `maintenance_status` | Manutenzione a carico di | select | | Stato |
| `safeguard` | Salvaguardia CONSIP | bool | | Contratto |
| `consip_order` | Numero ordine (ODA) | text | | Contratto |
| `cig_contract` | CIG contratto | text | | Contratto |
| `budget_chapter_code_fk` | Capitolo di spesa | select (caricata) | | Contratto |
| `supply_start_date_range` | Inizio fornitura | dateRange | | Date |
| `supply_expiry_date_range` | Scadenza fornitura | dateRange | | Date |
| `management_expiry_date_range` | Scadenza gestione | dateRange | | Date |
| `takeover_termination_date_range` | Subentro/cessazione | dateRange | | Date |
| `water_concession_range` | Concessione acqua | dateRange | | Date |
| `estimated_annual_consumption` | Consumo annuo presunto | number | | Consumi |
| `reported_consumption_year` | Consumo comunicato CONSIP | number | | Consumi |
| `security_deposit` | Deposito cauzionale | number | | Consumi |
| `notes` | Note | text | | Altro |
| `latitude` | Latitudine | text | | Altro |
| `longitude` | Longitudine | text | | Altro |
| `deleted` | (DELETED_FILTER) | | | Record |

Etichette di `cost_status`/`maintenance_status` come nel vecchio dialog (lì il parser ha letto "a": prendere il testo reale dal file). Se `safeguard`/`meter_*` nel vecchio dialog usano `booleanOptions` con valori stringa, usare `bool` (true/false): l'API li accetta come `'true'`/`'false'` in query string.

- [ ] **Step 2: `utilities.component.ts`** — eliminare la logica `safeguard`/`supply_expiry_date_range`/toast di `ngOnInit` e l'eventuale `loadAllUtilities()` (sostituito da `loadAll` della base, che usa `this.service.fromPlain`; se la pagina usa `plainToInstance(Utility, ...)` verificare che `fromPlain` produca la stessa classe); `ngOnInit` → `initFromRoute(this.route, item => this.dataTable?.openEditDialog(item))`. HTML come Task 7, `<h1>Utenze</h1>`, sottotitolo "Contatori di acqua, luce, gas e connettività.", placeholder "Cerca POD/PDR, matricola, immobile...". Toolbar `createLabel="Nuova utenza"`, `[exportable]="true" (export)="exportToCSV()"`, colonne.

- [ ] **Step 3: Eliminare i vecchi file, verificare** (log + E2E: Tipo "Luce" + Fornitura attiva "Sì" → 2 chip; ricerca "IT001" → filtra dentro; cancellare la ricerca → tornano i risultati filtrati, non tutti; dashboard "salvaguardia" → chip).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/pages/utilities/
git commit -m "feat(ui): utenze con filtri uniformi"
```

---

### Task 10: Immobili, Contratti immobiliari, Soggetti terzi

**Files:**
- Create: `pages/assets/assets-filters.ts`, `pages/utilizer-grant/utilizer-grant-filters.ts`, `pages/third-parties/third-parties-filters.ts`
- Modify: le tre pagine e le tre `data-table-*`
- Delete: `search-assets`, `asset-filter-dialog`, `search-utilizer-grant`, `utilizer-grant-filter-dialog`, `search-third-parties`, `third-party-filter-dialog` (`.ts` e `.html` dove esistono)

- [ ] **Step 1: `assets-filters.ts`** — inline: `nature_id` Tipologia (select caricata, natures), `function_id` Funzione (select caricata, functions), `status` Stato (select, `statusOptions` dal vecchio dialog). Avanzati: `legacy_only` "Da classificare" (bool, group "Segnalazioni"), `category`, `ownership` (select dal vecchio dialog), `asset_name`, `toponym` (select, `toponomyOptions`), `address`, `civic_number`, `municipality`, `zip_code` (group "Indirizzo"), `sheet`, `parcel`, `subordinate`, `cadastral_value`, `area_sqm` (group "Catasto"), `services_and_artifacts`, `associated_building`, `specific_details`, `memo`, `latitude`, `longitude` (group "Altro"), `DELETED_FILTER`. Etichette: quelle del vecchio dialog, "Nome edificio" → "Nome immobile".

  `assets.component.ts`: `showLegacyOnly()` → `this.onFiltersChange({...this.filterValues, legacy_only: true})`; `loadAll` override riscritto come `override loadAll(after?: (l: Asset[]) => void) { super.loadAll(after); this.service.legacyCount().subscribe({...}); }` e `ngOnInit` → `initFromRoute(...)`.

- [ ] **Step 2: `utilizer-grant-filters.ts`** — inline: `computed_status` Stato, `direction` Direzione, `kind` Tipo (opzioni statiche dal vecchio dialog: `statusOptions`, `directionOptions`, `kindOptions`). Avanzati: `alert` Segnalazione (select con le 4 voci di `ALERT_LABEL` in `utilizer-grant.component.ts`, testo senza punto finale; group "Segnalazioni"), `asset_id` Immobile e `party_id` Parte (select caricate come nel vecchio dialog, group "Collegamenti"), `department` Settore, `concession_act` Atto, `utilities_to_be_taken_over` Utenze da volturare (bool), group "Dati contratto"; `DELETED_FILTER`. Nella pagina: togliere `ALERT_LABEL` e i toast (le etichette vanno nelle opzioni del filtro), `ngOnInit` → `initFromRoute`. I totali restano sopra la tabella.

- [ ] **Step 3: `third-parties-filters.ts`** — inline: `roles` Ruolo (select con le voci dei chip attuali in `third-parties.component.ts`, `chips`), `type` Tipo (fisica/giuridica, opzioni dal vecchio dialog). Avanzati: `kind` Tipo contratto immobiliare (dal vecchio dialog), `DELETED_FILTER`. Il vecchio campo `q` del dialog coincide con la ricerca libera: non serve. Nella pagina rimuovere `mat-chip-listbox`, `selectedRoles`, `onRolesChange`, `onDialogSearch`. Se l'API `roles` accetta più ruoli separati da virgola e i chip erano multipli, usare `type: 'multi'` e `inline: true` (verificare in `backend/src/apis/third-parties/dto/search-third-party.dto.ts`).

- [ ] **Step 4: Pagine, tabelle, eliminazione file, verifica** — come Task 7 (titoli "Immobili", "Contratti immobiliari", "Soggetti terzi"; toolbar "Nuovo immobile", "Nuovo contratto immobiliare", "Nuovo soggetto"). E2E: `/third-parties` Ruolo "Fornitore" → chip; immobili banner "da classificare" → chip "Da classificare: Sì"; dashboard → "Contratti in scadenza" → chip Segnalazione.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/assets/ frontend/src/app/pages/utilizer-grant/ frontend/src/app/pages/third-parties/
git commit -m "feat(ui): immobili, contratti immobiliari e soggetti terzi con filtri uniformi"
```

---

### Task 11: Capitoli, anagrafiche di impostazione, utenti

**Files:**
- Create: `pages/budget-chapters/budget-chapters-filters.ts`, `pages/asset-nature/asset-nature-filters.ts`, `pages/asset-function/asset-function-filters.ts`, `pages/utility-types/utility-types-filters.ts`, `pages/system-users/system-users-filters.ts`
- Modify: le 5 pagine e le 5 `data-table-*`
- Delete: i 5 `search-*` e i 5 `*-filter-dialog`

- [ ] **Step 1: Configurazioni**

```ts
// budget-chapters-filters.ts — supplyTypeOptions copiate dal vecchio dialog
[
  {key: 'supply_type', label: 'Tipo fornitura', type: 'select', inline: true, options: SUPPLY_TYPE_OPTIONS},
  {key: 'chapter_code', label: 'Codice capitolo', type: 'text', group: 'Capitolo'},
  {key: 'article', label: 'Articolo', type: 'text', group: 'Capitolo'},
  {key: 'pdc', label: 'PDC', type: 'text', group: 'Capitolo'},
  {key: 'description', label: 'Descrizione', type: 'text', group: 'Capitolo'},
  DELETED_FILTER,
]
// asset-nature-filters.ts e asset-function-filters.ts
[{key: 'name', label: 'Nome', type: 'text'}, DELETED_FILTER]
// utility-types-filters.ts — hardTypeOptions dal vecchio dialog
[{key: 'hard_type', label: 'Tipo', type: 'select', options: HARD_TYPE_OPTIONS},
 {key: 'name', label: 'Nome', type: 'text'}, {key: 'description', label: 'Descrizione', type: 'text'}, DELETED_FILTER]
// system-users-filters.ts — roleOptions, statusOptions dal vecchio dialog; niente DELETED_FILTER
[{key: 'role', label: 'Ruolo', type: 'select', inline: true, options: ROLE_OPTIONS},
 {key: 'status', label: 'Stato', type: 'select', inline: true, options: STATUS_OPTIONS},
 {key: 'email', label: 'Nome o email', type: 'text'}]
```

Ogni file esporta una funzione `xxxFilters(): FilterDef[]` come nei task precedenti.

- [ ] **Step 2: Pagine e tabelle** — come Task 7. Titoli: "Capitoli di spesa", "Tipologie immobili", "Funzioni immobili", "Tipologie uso contatore", "Utenti e ruoli". Toolbar: "Nuovo capitolo", "Nuova tipologia", "Nuova funzione", "Nuova tipologia", "Nuovo utente". Le pagine senza `selectedId` chiamano comunque `initFromRoute(this.route)` (serve per i query param futuri) — iniettare `ActivatedRoute` dove manca.

- [ ] **Step 3: Eliminare i vecchi file, verifica log, commit**

```bash
git add frontend/src/app/pages/budget-chapters/ frontend/src/app/pages/asset-nature/ frontend/src/app/pages/asset-function/ frontend/src/app/pages/utility-types/ frontend/src/app/pages/system-users/
git commit -m "feat(ui): capitoli, impostazioni e utenti con filtri uniformi"
```

---

### Task 12: Impianti, Log modifiche, pulizia

**Files:**
- Create: `pages/plants/plants-filters.ts`
- Modify: `pages/plants/plants.component.ts`, `pages/audit-log/audit-log-page.component.{ts,html}`, `core/components/abstract.component.ts`
- Delete: `core/components/abstract-search.component.ts` (se `grep -rn "AbstractSearchComponent\|FilterDialogData" frontend/src` non trova più usi)

- [ ] **Step 1: `plants-filters.ts`**

```ts
export function plantFilters(): FilterDef[] {
  return [
    {key: 'type', label: 'Tipo', type: 'select', inline: true, options: PLANT_TYPES.map(t => ({label: PLANT_TYPE_LABEL[t], value: t}))},
    {key: 'status', label: 'Stato', type: 'select', inline: true, options: PLANT_STATUSES.map(s => ({label: PLANT_STATUS_LABEL[s], value: s}))},
    {key: 'inspection', label: 'Verifiche', type: 'select', inline: true,
      options: [{label: 'Scadute', value: 'overdue'}, {label: 'In scadenza', value: 'due_soon'}]},
    {key: 'position', label: 'Posizione', type: 'select', group: 'Posizione',
      options: [{label: 'Precisa', value: 'precise'}, {label: "Dall'immobile", value: 'from_asset'},
                {label: 'Stimata', value: 'estimated'}, {label: 'Mancante', value: 'missing'}]},
  ];
}
```

Nomi di costanti ed etichette: quelli già usati dalle select attuali nel template di `plants.component.ts` (verificare `grep -n "typeLabel\|statusLabel\|types\b\|statuses" pages/plants/plants.component.ts` e riusarli; le etichette di Verifiche/Posizione sono quelle delle `mat-option` attuali).

- [ ] **Step 2: `plants.component.ts`** — sostituire le 4 `mat-form-field` filtro e la ricerca con `<app-list-filters [defs]="filterDefs" [values]="filterValues" placeholder="Cerca codice, nome, indirizzo, immobile, utenza..." (valuesChange)="onFilters($event)" (quickSearch)="query = $event; applyFilter()">`; i campi `type`/`status`/`inspection`/`position` diventano `filterValues`; `reload()` usa `toSearchParams(this.filterDefs, this.filterValues)`; lettura iniziale da query param con `fromQueryParams`. Barra con `app-list-toolbar` (`count` = `dataSource.filteredData.length`, Esporta CSV, "Nuovo impianto"); i conteggi per tipo restano sotto. Paginatore `[25, 50, 100]`, default 25 ricordato con chiave `list-page-size:Impianti` (stesse funzioni `readPageSize`/`onPage` del Task 5, copiate nel componente perché non estende `AbstractDataTableComponent`).

- [ ] **Step 3: Log modifiche** — `pageSize = 25`, `[pageSizeOptions]="[25, 50, 100]"`, `showFirstLastButtons`, titolo `<h1>Log modifiche</h1>` + `list-subtitle`; i filtri Entità/Utente restano i suoi (paginazione lato server).

- [ ] **Step 4: Pulizia** — rimuovere da `AbstractComponent` il vecchio `onSearch(filters)` se `grep -rn "onSearch(" frontend/src/app/pages` non trova più usi; eliminare `abstract-search.component.ts` se senza usi.

- [ ] **Step 5: Verifica** — log `ng serve`; poi build completa:

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK (cattura i binding di template che `ng serve` incrementale può non segnalare).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/plants/ frontend/src/app/pages/audit-log/ frontend/src/app/core/components/abstract.component.ts
git rm frontend/src/app/core/components/abstract-search.component.ts
git commit -m "feat(ui): impianti e log modifiche allineati, rimossi i vecchi filtri"
```

---

### Task 13: E2E finale, roadmap, CLAUDE.md

**Files:**
- Modify: `docs/roadmap-patrimonio.md` (voce 15: primi due punti fatti; righe 141–143 della voce 6: residuo di testo vecchio da togliere), `CLAUDE.md` (sezione Frontend: una riga sul modello filtri)

- [ ] **Step 1: E2E Playwright** (utente temporaneo da creare e cancellare come da CLAUDE.md) su Utenze, Fatture, Soggetti terzi, più un giro veloce su ogni altra pagina:
  - filtro in linea → chip; filtro avanzato → chip e badge "Filtri avanzati (N)";
  - × sul chip e "Azzera";
  - ricerca libera + filtro, poi testo cancellato → restano i filtrati;
  - righe 50 → ricarica → 50;
  - dashboard: "Contratti di fornitura senza CIG", "Contratti in scadenza" (immobiliari), salvaguardia utenze, impianti senza posizione, verifiche scadute → chip giusto e togliibile;
  - `?selectedId=` su `/utilities`, `/building`, `/contracts` apre ancora la scheda;
  - "Mostra: Eliminati" su contratti di fornitura → compaiono gli eliminati con Ripristina.

- [ ] **Step 2: Doc**

`CLAUDE.md`, sezione Frontend, aggiungere:

```
- Elenchi: filtri dichiarati in `pages/<entità>/<entità>-filters.ts` (`FilterDef[]`, `core/components/list/`), barra `app-list-filters` (max 3 in linea, resto in "Filtri avanzati", chip), toolbar `app-list-toolbar`, righe per pagina 25/50/100 ricordate. Un query param con il nome di un filtro lo valorizza (link dalla dashboard). Niente più `search-*`/`*-filter-dialog` per pagina.
```

`docs/roadmap-patrimonio.md`: voce 15, primi due punti barrati con "(fatto, elenchi uniformi 2026-10-05)"; rimuovere le righe residue della voce 6 (" a contratto e capitolo, non all'utenza. Fonte pronta…" e il paragrafo "In previsione delle utility di importazione massiva…", ormai superati dalla v1.10.0).

- [ ] **Step 3: Commit e PR**

```bash
git add CLAUDE.md docs/roadmap-patrimonio.md
git commit -m "docs: elenchi uniformi in CLAUDE.md e roadmap"
git push -u origin ui/elenchi-uniformi
```

PR con `gh pr create --repo Comune-di-Montesilvano/UtenzePA`, corpo con riepilogo, verifiche fatte e chiusura `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
