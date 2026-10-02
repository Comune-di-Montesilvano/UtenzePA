# Schede entità — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Riscrivere i dialog di immobile, utenza, impianto, contratto di fornitura e contratto immobiliare come "schede": header fisso con badge di stato, primo tab Riepilogo (dati generali + mappa + anteprime), resto in tab per categoria con icona e badge, collegamenti in tabelle cliccabili, dialog ad altezza fissa.

**Architecture:** Componenti condivisi in `frontend/src/app/core/components/entity-sheet/` (shell, badge, etichetta tab, anteprima, tabella collegamenti, barra validità) + funzioni pure di stato in `core/helpers/entity-status.ts` + `EntityNavigatorService` che apre/persiste le schede collegate (dialog impilati). Ogni dialog mantiene il suo form e il suo flusso di salvataggio; cambia solo il layout e la navigazione.

**Tech Stack:** Angular 22 standalone, Angular Material 22 (MatDialog, MatTabs), Reactive Forms, RxJS. Nessuna modifica backend.

**Spec:** `docs/superpowers/specs/2026-10-02-schede-entita-design.md`

## Global Constraints

- Solo frontend (`frontend/`). Nessuna modifica a backend, API, migration.
- Ogni componente nuovo: `standalone: true`, `changeDetection: ChangeDetectionStrategy.Eager` (convenzione del progetto dopo la migrazione Angular 22).
- Testi UI in italiano, con accenti corretti. Icone solo Material Icons (font già caricato).
- Ruolo `Lettore`: form disabilitato, nessun pulsante aggiungi/collega/scollega/crea/salva; può comunque cambiare tab e aprire le schede collegate.
- Verifica: niente Karma (nessun browser nel container, la CI non lo esegue). Ogni task si chiude con `ng build` reale nel container; i task dei dialog anche con verifica E2E via Playwright MCP (browser sull'host, `http://localhost:4300`).
- Comandi Docker **uno alla volta**, mai in parallelo/background multipli (CLAUDE.md: crash Docker/PC sotto carico).
- Build: `docker exec utenzepa-frontend-1 pnpm run build` (se il container frontend non è up: `docker compose up -d` dalla root, dopo aver verificato con `docker ps`).
- Commit: Conventional Commits, file elencati esplicitamente (mai `git add -A`/`git add .`: `.playwright-mcp/`, `.serena/`, `CLAUDE.md` e i `.txt` di trascrizione non vanno committati salvo il Task 13). Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch: `feat/schede-entita` (già creato, contiene la spec). Una sola PR.
- Righe di array/collegamenti passate a `LinkedTableComponent` e `FilterableSelectComponent` devono essere **campi cache** aggiornati solo su evento (load/add/unlink), mai getter che creano un array nuovo a ogni change detection (resetta il filtro mentre si digita — vedi commento in `contract-edit-dialog.component.ts`).

## Review Focus

1. **Lettore** apre una scheda: deve poter cambiare tab e aprire le schede collegate, ma non vedere azioni di modifica. Oggi `[readOnly]` (pointer-events:none) sul `<form>` che avvolge i tab bloccherebbe anche i click su tab/tabelle → i nuovi template non usano più `ReadOnlyDirective`; il form resta disabilitato da `form.disable()`. Verifica E2E nel Task 12 con utente Lettore temporaneo.
2. **Picker "Collega" che perde il testo digitato**: `LinkedTableComponent` ricalcola le opzioni disponibili solo in `ngOnChanges` (riferimenti nuovi), e i dialog passano righe cache. Verifica E2E: digitare nel picker, attendere, il testo resta.
3. **Campo obbligatorio vuoto in un tab non visibile**: Salva non è più disabilitato; al click con form invalido `markAllAsTouched()` e l'etichetta del tab mostra il pallino rosso. Verifica E2E nei Task 7–11.
4. **Collegamenti utenza↔impianto modificati in una scheda figlia**: aprendo un'utenza dall'impianto (o un impianto dall'utenza) e salvando lì, il form del padre ha `utility_ids`/`plant_ids` vecchi e al suo Salva li sovrascriverebbe. Dopo il salvataggio del figlio il padre riallinea il proprio form control (`syncUtilityLink` / `syncPlantLink`). Verifica E2E nei Task 8 e 9.
5. **Dialog impilati profondi** (immobile → utenza → impianto → immobile → …): offset di 2vh per livello, limitato a 5 livelli (altezza minima 80vh). Verifica E2E nel Task 12.

---

## File Structure

Create:
- `frontend/src/app/core/helpers/entity-status.ts` — funzioni pure `{tone,label,icon,tooltip}` per badge di stato di tutte le entità.
- `frontend/src/app/core/components/entity-sheet/sheet-utils.ts` — config dialog (`sheetDialogConfig`, `openSheet`), ruoli, formattazione, helper form/tab, `validityProgress`.
- `frontend/src/app/core/components/entity-sheet/status-badge.component.ts`
- `frontend/src/app/core/components/entity-sheet/tab-label.component.ts`
- `frontend/src/app/core/components/entity-sheet/entity-sheet.component.ts`
- `frontend/src/app/core/components/entity-sheet/preview-card.component.ts`
- `frontend/src/app/core/components/entity-sheet/linked-table.component.ts`
- `frontend/src/app/core/components/entity-sheet/validity-bar.component.ts`
- `frontend/src/app/core/services/entity-navigator.service.ts`
- `frontend/src/app/pages/plants/plant-edit-dialog.component.html` (template estratto dal `.ts`)

Modify:
- `frontend/src/styles.scss` — token colore, classi tone, layout shell.
- `frontend/src/app/pages/utility-types/enum/hard-type.enum.ts` — `HardTypeMatIcon`.
- `frontend/src/app/pages/plants/plant.model.ts` — `PlantTab`, `PLANT_TYPE_TABS`, `plantTabs()`.
- `frontend/src/app/core/components/abstract-data-table.component.ts` — `useSheet()`.
- Dialog: `assets/asset-edit-dialog.component.{ts,html}`, `utilities/utility-edit-dialog.component.{ts,html}`, `plants/plant-edit-dialog.component.ts`, `contracts/contract-edit-dialog.component.{ts,html}`, `utilizer-grant/utilizer-grant-edit-dialog.component.{ts,html}`.
- Aperture: `assets/data-table-assets.component.ts`, `utilities/data-table-utilities.component.ts`, `contracts/data-table-contracts.component.ts`, `utilizer-grant/data-table-utilizer-grant.component.ts`, `plants/plants.component.ts`, `map/map.component.ts`, `audit-log/audit-log-page.component.ts`.

Delete:
- `frontend/src/app/pages/plants/asset-plants-tab.component.ts`
- `frontend/src/app/pages/utilizer-grant/asset-real-estate-contracts-tab.component.ts`

---

### Task 1: Token colore, stati, utility della scheda

**Files:**
- Modify: `frontend/src/styles.scss` (append in fondo)
- Modify: `frontend/src/app/pages/utility-types/enum/hard-type.enum.ts`
- Modify: `frontend/src/app/pages/plants/plant.model.ts`
- Create: `frontend/src/app/core/helpers/entity-status.ts`
- Create: `frontend/src/app/core/components/entity-sheet/sheet-utils.ts`

**Interfaces:**
- Produces: `Tone`, `StatusInfo`, `assetStatus`, `legacyTypeStatus`, `utilityStatus`, `utilityFlags`, `plantStatus`, `positionStatusInfo`, `inspectionStatusInfo`, `supplyContractStatus`, `supplyContractFlags`, `grantStatus`, `grantFlags` (entity-status.ts); `SHEET_PANEL_CLASS`, `sheetDialogConfig`, `openSheet`, `isEditorRole`, `lastModifiedLabel`, `hasInvalid`, `hasAnyValue`, `selectTab`, `dateIt`, `ValidityProgress`, `validityProgress` (sheet-utils.ts); `HardTypeMatIcon`; `PlantTab`, `PLANT_TYPE_TABS`, `plantTabs`.

- [ ] **Step 1: Append global styles to `frontend/src/styles.scss`**

```scss
/* ===== Schede entità (dialog Riepilogo + tab) ===== */
:root {
  --tone-ok-bg: #dcfce7; --tone-ok-fg: #166534;
  --tone-warn-bg: #fef3c7; --tone-warn-fg: #92400e;
  --tone-danger-bg: #fee2e2; --tone-danger-fg: #991b1b;
  --tone-off-bg: #f3f4f6; --tone-off-fg: #4b5563;
  --tone-info-bg: #dbeafe; --tone-info-fg: #1e40af;
  --entity-asset: #2563eb;
  --entity-utility: #0891b2;
  --entity-plant: #ea580c;
  --entity-supply-contract: #7c3aed;
  --entity-grant: #0d9488;
  --sheet-border: #e5e7eb;
  --sheet-muted: #6b7280;
}

.tone-ok { background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
.tone-warn { background: var(--tone-warn-bg); color: var(--tone-warn-fg); }
.tone-danger { background: var(--tone-danger-bg); color: var(--tone-danger-fg); }
.tone-off { background: var(--tone-off-bg); color: var(--tone-off-fg); }
.tone-info { background: var(--tone-info-bg); color: var(--tone-info-fg); }

/* Dialog a altezza fissa: la superficie MDC diventa una colonna flex e il
   componente del dialog (figlio diretto) la riempie. min-height:0 a ogni
   livello, altrimenti il figlio flex non si restringe sotto il contenuto. */
.entity-sheet-panel .mat-mdc-dialog-surface { display: flex; flex-direction: column; overflow: hidden; }
.entity-sheet-panel .mat-mdc-dialog-surface > * { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }

.sheet-body > form { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sheet-body .mat-mdc-tab-group { flex: 1 1 auto; min-height: 0; }
.sheet-body .mat-mdc-tab-header { padding: 0 16px; border-bottom: 1px solid var(--sheet-border); }
.sheet-body .mat-mdc-tab-body-wrapper { flex: 1 1 auto; min-height: 0; }
.sheet-body .mat-mdc-tab-body-content { padding: 16px 24px 24px; box-sizing: border-box; }

.sheet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  column-gap: 16px;
  row-gap: 4px;
  align-items: start;
}
.sheet-grid .span-2 { grid-column: span 2; }
.sheet-grid .span-all { grid-column: 1 / -1; }
.sheet-section-title {
  display: flex; align-items: center; gap: 8px;
  margin: 20px 0 8px; font-weight: 600; font-size: 0.95rem; color: #111827;
}
.sheet-section-title:first-child { margin-top: 0; }
.sheet-section-title .mat-icon { font-size: 20px; width: 20px; height: 20px; }
.sheet-previews { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 16px; }
.sheet-memo {
  display: flex; gap: 12px; margin-top: 16px; padding: 12px 16px; border-radius: 8px;
  background: var(--tone-warn-bg); color: var(--tone-warn-fg); white-space: pre-wrap;
}
.sheet-memo p { margin: 4px 0 0; }
.sheet-alert { padding: 8px 12px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 12px; }
.sheet-empty { color: var(--sheet-muted); margin: 0; }
.sheet-hint { font-size: 0.8rem; color: var(--sheet-muted); margin: 4px 0 0; }
.sheet-add-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.sheet-section { margin-bottom: 20px; }
.sheet-stat {
  display: flex; flex-direction: column; gap: 4px; padding: 12px 16px;
  border: 1px solid var(--sheet-border); border-radius: 8px;
}
.sheet-stat-value { font-size: 1.1rem; font-weight: 600; }
.sheet-error { color: #b91c1c; margin: 0 auto 0 0; font-size: 0.875rem; }
.sheet-list { margin: 0; padding-left: 1.5rem; }
@media (max-width: 700px) {
  .sheet-grid .span-2 { grid-column: 1 / -1; }
}
```

- [ ] **Step 2: Add `HardTypeMatIcon` to `hard-type.enum.ts`** (dopo `HardTypeColor`)

```ts
// Icone Material per il tipo utenza (schede e tabelle nuove); HardTypeIcon
// (font-awesome) resta per gli usi esistenti.
export const HardTypeMatIcon: Record<HardType, string> = {
  [HardType.WATER]: 'water_drop',
  [HardType.LIGHT]: 'bolt',
  [HardType.GAS]: 'local_fire_department',
  [HardType.INTERNET]: 'wifi',
};
```

- [ ] **Step 3: Add plant tab config to `plant.model.ts`** (dopo `PLANT_STATUS_LABEL`)

```ts
// Tab specifici per tipo d'impianto (oltre a Riepilogo/Immobili/Utenze/Foto/
// Storico, sempre presenti). Un tipo nuovo dichiara qui i suoi tab.
export type PlantTab = 'technical' | 'fire_equipment' | 'inspections';
const DEFAULT_PLANT_TABS: PlantTab[] = ['inspections'];
export const PLANT_TYPE_TABS: Partial<Record<PlantType, PlantTab[]>> = {
  THERMAL: ['technical', 'inspections'],
  ELEVATOR: ['technical', 'inspections'],
  FIRE_PROTECTION: ['fire_equipment', 'inspections'],
};
export function plantTabs(type: PlantType): PlantTab[] {
  return PLANT_TYPE_TABS[type] ?? DEFAULT_PLANT_TABS;
}
```

- [ ] **Step 4: Create `frontend/src/app/core/helpers/entity-status.ts`**

```ts
import {AssetStatus} from '../../pages/assets/enum/asset-status.enum';
import {
  INSPECTION_LABEL,
  InspectionStatus,
  PLANT_STATUS_LABEL,
  PlantStatus,
  POSITION_LABEL,
  PositionQuality,
  todayIso,
} from '../../pages/plants/plant.model';
import {ContractStatus, DisplayStatus, STATUS_LABEL} from '../../pages/utilizer-grant/real-estate-contract.model';
import {toIsoDate} from '../../pages/utilities/consumptions/consumption.model';

// Badge di stato delle schede entità: tono semantico + testo. Funzioni pure,
// riusabili in header, tabelle collegamenti e anteprime.
export type Tone = 'ok' | 'warn' | 'danger' | 'off' | 'info';

export interface StatusInfo {
  tone: Tone;
  label: string;
  icon?: string;
  tooltip?: string;
}

const isoOf = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIsoDate(v));

export function assetStatus(status: string | null | undefined): StatusInfo {
  switch (status) {
    case AssetStatus.ATTIVO: return {tone: 'ok', label: 'Attivo', icon: 'check_circle'};
    case AssetStatus.DA_VERIFICARE: return {tone: 'warn', label: 'Da verificare', icon: 'help'};
    case AssetStatus.DISMESSO: return {tone: 'off', label: 'Dismesso', icon: 'block'};
    default: return {tone: 'off', label: 'Stato non indicato', icon: 'help_outline'};
  }
}

export function legacyTypeStatus(code: string | null): StatusInfo | null {
  if (!code) return null;
  return {
    tone: 'warn',
    label: `Tipo precedente: ${code}`,
    icon: 'history',
    tooltip: 'Classificazione precedente: sparisce dopo aver salvato tipologia e funzione',
  };
}

export function utilityStatus(active: boolean | null | undefined): StatusInfo {
  if (active === true) return {tone: 'ok', label: 'Attiva', icon: 'power'};
  if (active === false) return {tone: 'off', label: 'Non attiva', icon: 'power_off'};
  return {tone: 'warn', label: 'Fornitura non indicata', icon: 'help_outline'};
}

export function utilityFlags(meterRemoved: boolean | null | undefined, meterVerified: boolean | null | undefined): StatusInfo[] {
  const flags: StatusInfo[] = [];
  if (meterRemoved) flags.push({tone: 'off', label: 'Contatore rimosso', icon: 'remove_circle_outline'});
  if (meterVerified === false) flags.push({tone: 'warn', label: 'Contatore non verificato', icon: 'report'});
  return flags;
}

export function plantStatus(status: PlantStatus | null | undefined): StatusInfo {
  switch (status) {
    case 'ACTIVE': return {tone: 'ok', label: PLANT_STATUS_LABEL.ACTIVE, icon: 'check_circle'};
    case 'TO_VERIFY': return {tone: 'warn', label: PLANT_STATUS_LABEL.TO_VERIFY, icon: 'help'};
    case 'DECOMMISSIONED': return {tone: 'off', label: PLANT_STATUS_LABEL.DECOMMISSIONED, icon: 'block'};
    default: return {tone: 'off', label: 'Stato non indicato', icon: 'help_outline'};
  }
}

export function positionStatusInfo(q: PositionQuality): StatusInfo {
  switch (q) {
    case 'PRECISE': return {tone: 'ok', label: POSITION_LABEL.PRECISE, icon: 'my_location'};
    case 'FROM_ASSET': return {tone: 'ok', label: POSITION_LABEL.FROM_ASSET, icon: 'apartment'};
    case 'ESTIMATED': return {tone: 'warn', label: POSITION_LABEL.ESTIMATED, icon: 'location_searching'};
    default: return {tone: 'danger', label: POSITION_LABEL.MISSING, icon: 'location_off'};
  }
}

export function inspectionStatusInfo(s: InspectionStatus | null | undefined): StatusInfo | null {
  switch (s) {
    case 'OVERDUE': return {tone: 'danger', label: INSPECTION_LABEL.OVERDUE, icon: 'event_busy'};
    case 'DUE_SOON': return {tone: 'warn', label: INSPECTION_LABEL.DUE_SOON, icon: 'event'};
    case 'OK': return {tone: 'ok', label: INSPECTION_LABEL.OK, icon: 'event_available'};
    default: return null;
  }
}

// Stesso criterio di Contract.isCurrent: chiuso = mai corrente; senza
// scadenza = in corso; scadenza uguale a oggi = ancora in corso.
export function supplyContractStatus(
  c: {closed?: boolean | null; supply_expiry_date?: Date | string | null},
  today = todayIso(),
): StatusInfo {
  if (c.closed) return {tone: 'off', label: 'Chiuso', icon: 'lock'};
  if (c.supply_expiry_date && isoOf(c.supply_expiry_date) < today) {
    return {tone: 'danger', label: 'Scaduto', icon: 'event_busy'};
  }
  return {tone: 'ok', label: 'In corso', icon: 'check_circle'};
}

// Stessa regola del validatore cigRequiredUnlessExempt del dialog.
export function supplyContractFlags(c: {cig_contract?: string | null; cig_exempt?: boolean | null; closed?: boolean | null}): StatusInfo[] {
  if (c.cig_exempt) return [{tone: 'info', label: 'Escluso da CIG', icon: 'info'}];
  if (!(c.cig_contract ?? '').trim() && !c.closed) {
    return [{tone: 'danger', label: 'Senza CIG', icon: 'report', tooltip: 'Senza CIG il contratto è considerato inesistente'}];
  }
  return [];
}

export function grantStatus(s: DisplayStatus | null | undefined): StatusInfo {
  switch (s) {
    case 'ACTIVE': return {tone: 'ok', label: STATUS_LABEL.ACTIVE, icon: 'check_circle'};
    case 'EXPIRING': return {tone: 'warn', label: STATUS_LABEL.EXPIRING, icon: 'schedule'};
    case 'EXPIRED': return {tone: 'danger', label: STATUS_LABEL.EXPIRED, icon: 'event_busy'};
    case 'DISPUTED': return {tone: 'danger', label: STATUS_LABEL.DISPUTED, icon: 'gavel'};
    case 'RETURNED': return {tone: 'off', label: STATUS_LABEL.RETURNED, icon: 'undo'};
    case 'TERMINATED': return {tone: 'off', label: STATUS_LABEL.TERMINATED, icon: 'block'};
    default: return {tone: 'off', label: 'Stato non calcolato', icon: 'help_outline'};
  }
}

// Avviso quando lo stato calcolato dalle date diverge da quello dichiarato
// (dichiarato Attivo e calcolato In scadenza è normale, non si segnala).
export function grantFlags(declared: ContractStatus | null | undefined, computed: DisplayStatus | null | undefined): StatusInfo[] {
  if (!declared || !computed || declared === computed) return [];
  if (declared === 'ACTIVE' && computed === 'EXPIRING') return [];
  return [{
    tone: 'warn',
    label: `Stato dichiarato: ${STATUS_LABEL[declared]}`,
    icon: 'sync_problem',
    tooltip: 'Lo stato calcolato dalle date è diverso da quello dichiarato',
  }];
}
```

- [ ] **Step 5: Create `frontend/src/app/core/components/entity-sheet/sheet-utils.ts`**

```ts
import {QueryList} from '@angular/core';
import {AbstractControl} from '@angular/forms';
import {ComponentType} from '@angular/cdk/portal';
import {MatDialog, MatDialogConfig, MatDialogRef} from '@angular/material/dialog';
import {MatTab, MatTabGroup} from '@angular/material/tabs';
import {todayIso} from '../../../pages/plants/plant.model';
import {toIsoDate} from '../../../pages/utilities/consumptions/consumption.model';

export const SHEET_PANEL_CLASS = 'entity-sheet-panel';
const MAX_DEPTH = 5;

// Dialog scheda: altezza fissa ancorata in alto (non salta più cambiando tab).
// Ogni dialog già aperto sposta il nuovo 2vh più in basso, così si vede la
// profondità della pila; oltre 5 livelli l'offset non cresce più.
export function sheetDialogConfig<D>(data: D, depth: number): MatDialogConfig<D> {
  const offset = Math.min(Math.max(depth, 0), MAX_DEPTH) * 2;
  return {
    data,
    width: '1150px',
    maxWidth: '95vw',
    height: `${90 - offset}vh`,
    position: {top: `${5 + offset}vh`},
    panelClass: SHEET_PANEL_CLASS,
  };
}

export function openSheet<C, D, R = unknown>(dialog: MatDialog, component: ComponentType<C>, data: D): MatDialogRef<C, R> {
  return dialog.open<C, D, R>(component, sheetDialogConfig(data, dialog.openDialogs.length));
}

export function isEditorRole(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Operatore';
}

export function lastModifiedLabel(
  date: Date | string | null | undefined,
  user: {firstName?: string | null; lastName?: string | null} | null | undefined,
): string | null {
  if (!date || !user) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  const who = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return `Ultima modifica: ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}${who ? ' — ' + who : ''}`;
}

// Un tab con campi invalidi già toccati (o dopo un Salva fallito, che fa
// markAllAsTouched) mostra il pallino rosso.
export function hasInvalid(form: AbstractControl, ...names: string[]): boolean {
  return names.some(n => {
    const c = form.get(n);
    return !!c && c.invalid && c.touched;
  });
}

export function hasAnyValue(form: AbstractControl, ...names: string[]): boolean {
  return names.some(n => {
    const v = form.get(n)?.value;
    return v !== null && v !== undefined && `${v}`.trim() !== '';
  });
}

// I tab si identificano con aria-label (= testo dell'etichetta): l'indice
// cambia quando alcuni tab sono condizionali.
export function selectTab(group: MatTabGroup | undefined, tabs: QueryList<MatTab> | undefined, label: string): void {
  if (!group || !tabs) return;
  const index = tabs.toArray().findIndex(t => t.ariaLabel === label);
  if (index >= 0) group.selectedIndex = index;
}

export function dateIt(v: Date | string | null | undefined): string {
  if (!v) return '';
  const iso = typeof v === 'string' ? v.slice(0, 10) : toIsoDate(v);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export interface ValidityProgress {
  state: 'none' | 'open' | 'future' | 'running' | 'expired';
  percent: number | null;
}

export function validityProgress(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  today = todayIso(),
): ValidityProgress {
  const iso = (v: Date | string) => (typeof v === 'string' ? v.slice(0, 10) : toIsoDate(v));
  const s = start ? iso(start) : null;
  const e = end ? iso(end) : null;
  if (!s && !e) return {state: 'none', percent: null};
  if (s && today < s) return {state: 'future', percent: 0};
  if (e && today > e) return {state: 'expired', percent: 100};
  if (!e) return {state: 'open', percent: null};
  if (!s) return {state: 'running', percent: null};
  const days = (a: string) => Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const total = days(e) - days(s);
  const pct = total <= 0 ? 100 : Math.round(((days(today) - days(s)) / total) * 100);
  return {state: 'running', percent: Math.min(100, Math.max(0, pct))};
}
```

- [ ] **Step 6: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: build OK (warning di budget preesistenti accettabili), nessun errore TS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/styles.scss frontend/src/app/pages/utility-types/enum/hard-type.enum.ts frontend/src/app/pages/plants/plant.model.ts frontend/src/app/core/helpers/entity-status.ts frontend/src/app/core/components/entity-sheet/sheet-utils.ts
git commit -m "feat(frontend): token colore, stati e utility per le schede entità

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Componenti di presentazione (badge, etichetta tab, shell, anteprima, barra validità)

**Files:**
- Create: `frontend/src/app/core/components/entity-sheet/status-badge.component.ts`
- Create: `frontend/src/app/core/components/entity-sheet/tab-label.component.ts`
- Create: `frontend/src/app/core/components/entity-sheet/entity-sheet.component.ts`
- Create: `frontend/src/app/core/components/entity-sheet/preview-card.component.ts`
- Create: `frontend/src/app/core/components/entity-sheet/validity-bar.component.ts`

**Interfaces:**
- Consumes: `StatusInfo`, `Tone` (Task 1); `dateIt`, `validityProgress` (Task 1).
- Produces:
  - `<app-status-badge [info]="StatusInfo" size="md|sm">`
  - `<app-tab-label icon label [count]="number|null" [tone]="Tone" [dot]="boolean" [error]="boolean">`
  - `<app-entity-sheet icon color title [subtitle] [lastModified]>` con slot `[sheetBadges]`, contenuto di default, slot `[sheetActions]`
  - `PreviewItem {id:number; label:string; sublabel?:string; icon?:string; color?:string; status?:StatusInfo|null}`; `<app-preview-card title icon color [items] [emptyText] [max] (seeAll) (open)>`
  - `<app-validity-bar [start] [end]>`

- [ ] **Step 1: Create `status-badge.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {StatusInfo} from '../../helpers/entity-status';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <span [class]="'badge tone-' + info.tone + (size === 'sm' ? ' sm' : '')" [matTooltip]="info.tooltip ?? ''">
      @if (info.icon) {
        <mat-icon>{{ info.icon }}</mat-icon>
      }
      {{ info.label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      border-radius: 999px; padding: 3px 12px;
      font-size: 0.8rem; font-weight: 600; line-height: 1.3; white-space: nowrap;
    }
    .badge .mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .badge.sm { padding: 1px 8px; font-size: 0.72rem; font-weight: 500; }
    .badge.sm .mat-icon { font-size: 14px; width: 14px; height: 14px; }
  `],
})
export class StatusBadgeComponent {
  @Input({required: true}) info!: StatusInfo;
  @Input() size: 'md' | 'sm' = 'md';
}
```

- [ ] **Step 2: Create `tab-label.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {Tone} from '../../helpers/entity-status';

// Etichetta di un mat-tab: icona, testo e un indicatore. Priorità:
// errore (pallino rosso) > conteggio > pallino "contiene dati".
@Component({
  selector: 'app-tab-label',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <mat-icon class="tl-icon">{{ icon }}</mat-icon>
    <span>{{ label }}</span>
    @if (error) {
      <span class="tl-dot tone-danger" title="Campi da correggere"></span>
    } @else if (count !== null && count !== undefined) {
      <span [class]="'tl-count tone-' + (count === 0 ? 'off' : tone)">{{ count }}</span>
    } @else if (dot) {
      <span [class]="'tl-dot tone-' + tone"></span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: 6px; }
    .tl-icon { font-size: 20px; width: 20px; height: 20px; }
    .tl-count { border-radius: 999px; padding: 0 7px; font-size: 0.72rem; font-weight: 600; line-height: 18px; min-width: 8px; text-align: center; }
    .tl-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .tl-dot.tone-danger { background: var(--tone-danger-fg); }
    .tl-dot.tone-info { background: var(--tone-info-fg); }
    .tl-dot.tone-warn { background: var(--tone-warn-fg); }
    .tl-dot.tone-ok { background: var(--tone-ok-fg); }
  `],
})
export class TabLabelComponent {
  @Input({required: true}) icon!: string;
  @Input({required: true}) label!: string;
  @Input() count: number | null | undefined = null;
  @Input() tone: Tone = 'info';
  @Input() dot = false;
  @Input() error = false;
}
```

- [ ] **Step 3: Create `entity-sheet.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

// Shell dei dialog scheda: header fisso (icona, titolo, badge, ultima
// modifica), corpo che riempie l'altezza (il mat-tab-group del dialog, che
// scorre solo nel corpo del tab) e footer fisso con le azioni. I mat-tab
// restano nel template del dialog: mat-tab-group non vede tab proiettati
// tramite ng-content di un altro componente.
@Component({
  selector: 'app-entity-sheet',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header class="sheet-header">
      <div class="sheet-icon" [style.background]="color"><mat-icon>{{ icon }}</mat-icon></div>
      <div class="sheet-titles">
        <div class="sheet-title-row">
          <h2 class="sheet-title">{{ title }}</h2>
          <ng-content select="[sheetBadges]"></ng-content>
        </div>
        @if (subtitle) {
          <div class="sheet-subtitle">{{ subtitle }}</div>
        }
      </div>
      @if (lastModified) {
        <div class="sheet-meta">{{ lastModified }}</div>
      }
    </header>
    <div class="sheet-body">
      <ng-content></ng-content>
    </div>
    <footer class="sheet-footer">
      <ng-content select="[sheetActions]"></ng-content>
    </footer>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
    .sheet-header {
      display: flex; align-items: center; gap: 16px;
      padding: 16px 24px 12px; border-bottom: 1px solid var(--sheet-border);
    }
    .sheet-icon {
      flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; color: #fff;
    }
    .sheet-titles { flex: 1 1 auto; min-width: 0; }
    .sheet-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .sheet-title {
      margin: 0; font-size: 1.25rem; font-weight: 600; line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
    }
    .sheet-subtitle { color: var(--sheet-muted); font-size: 0.875rem; margin-top: 2px; }
    .sheet-meta { flex: 0 0 auto; color: var(--sheet-muted); font-size: 0.75rem; text-align: right; max-width: 260px; }
    .sheet-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    .sheet-footer {
      display: flex; justify-content: flex-end; align-items: center; gap: 8px;
      padding: 12px 24px; border-top: 1px solid var(--sheet-border);
    }
    @media (max-width: 700px) { .sheet-meta { display: none; } }
  `],
})
export class EntitySheetComponent {
  @Input({required: true}) icon!: string;
  @Input() color = 'var(--entity-asset)';
  @Input({required: true}) title!: string;
  @Input() subtitle: string | null | undefined = null;
  @Input() lastModified: string | null | undefined = null;
}
```

- [ ] **Step 4: Create `preview-card.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {StatusInfo} from '../../helpers/entity-status';
import {StatusBadgeComponent} from './status-badge.component';

export interface PreviewItem {
  id: number;
  label: string;
  sublabel?: string;
  icon?: string;
  color?: string;
  status?: StatusInfo | null;
}

// Riquadro del Riepilogo: prime righe di un collegamento + link al tab.
@Component({
  selector: 'app-preview-card',
  standalone: true,
  imports: [MatIconModule, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="pc">
      <div class="pc-head">
        <mat-icon [style.color]="color">{{ icon }}</mat-icon>
        <span class="pc-title">{{ title }}</span>
        <span [class]="'pc-count tone-' + (items.length ? 'info' : 'off')">{{ items.length }}</span>
      </div>
      @if (items.length === 0) {
        <div class="pc-empty">{{ emptyText }}</div>
      } @else {
        <ul class="pc-list">
          @for (it of items.slice(0, max); track it.id) {
            <li>
              <button type="button" class="pc-item" (click)="open.emit(it)">
                @if (it.icon) {
                  <mat-icon [style.color]="it.color ?? null">{{ it.icon }}</mat-icon>
                }
                <span class="pc-text">
                  <span class="pc-label">{{ it.label }}</span>
                  @if (it.sublabel) {
                    <span class="pc-sub">{{ it.sublabel }}</span>
                  }
                </span>
                @if (it.status) {
                  <app-status-badge [info]="it.status" size="sm"></app-status-badge>
                }
              </button>
            </li>
          }
        </ul>
      }
      <button type="button" class="pc-all" (click)="seeAll.emit()">
        {{ items.length > max ? 'Vedi tutti (' + items.length + ')' : 'Apri sezione' }}
        <mat-icon>arrow_forward</mat-icon>
      </button>
    </div>
  `,
  styles: [`
    .pc { border: 1px solid var(--sheet-border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; height: 100%; box-sizing: border-box; }
    .pc-head { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .pc-title { flex: 1 1 auto; }
    .pc-count { border-radius: 999px; padding: 0 8px; font-size: 0.75rem; font-weight: 600; }
    .pc-empty { color: var(--sheet-muted); font-size: 0.85rem; }
    .pc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    .pc-item {
      width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
      border: 0; background: transparent; padding: 6px; border-radius: 6px; cursor: pointer; font: inherit;
    }
    .pc-item:hover { background: #f3f4f6; }
    .pc-item .mat-icon { font-size: 20px; width: 20px; height: 20px; flex: 0 0 auto; }
    .pc-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
    .pc-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pc-sub { color: var(--sheet-muted); font-size: 0.75rem; }
    .pc-all {
      margin-top: auto; align-self: flex-end; display: inline-flex; align-items: center; gap: 4px;
      border: 0; background: transparent; color: var(--entity-asset); cursor: pointer; font: inherit; font-size: 0.85rem;
    }
    .pc-all .mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `],
})
export class PreviewCardComponent {
  @Input({required: true}) title!: string;
  @Input({required: true}) icon!: string;
  @Input() color = 'var(--entity-asset)';
  @Input() items: PreviewItem[] = [];
  @Input() emptyText = 'Nessuno';
  @Input() max = 3;
  @Output() seeAll = new EventEmitter<void>();
  @Output() open = new EventEmitter<PreviewItem>();
}
```

- [ ] **Step 5: Create `validity-bar.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {Tone} from '../../helpers/entity-status';
import {dateIt, validityProgress, ValidityProgress} from './sheet-utils';

// Barra decorrenza → scadenza con la posizione di oggi.
@Component({
  selector: 'app-validity-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @let p = progress();
    <div class="vb">
      <div class="vb-dates">
        <span>{{ dateIt(start) || 'senza decorrenza' }}</span>
        <span [class]="'vb-state tone-' + tone(p)">{{ stateLabel(p) }}</span>
        <span>{{ dateIt(end) || 'senza scadenza' }}</span>
      </div>
      <div class="vb-track">
        <div class="vb-fill" [style.background]="'var(--tone-' + tone(p) + '-fg)'"
             [style.width.%]="p.percent ?? (p.state === 'open' || p.state === 'running' ? 100 : 0)"></div>
      </div>
    </div>
  `,
  styles: [`
    .vb { display: flex; flex-direction: column; gap: 6px; }
    .vb-dates { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--sheet-muted); }
    .vb-state { border-radius: 999px; padding: 1px 8px; font-weight: 600; }
    .vb-track { height: 8px; border-radius: 4px; background: #e5e7eb; overflow: hidden; }
    .vb-fill { height: 100%; border-radius: 4px; opacity: 0.7; }
  `],
})
export class ValidityBarComponent {
  @Input() start: Date | string | null | undefined = null;
  @Input() end: Date | string | null | undefined = null;
  readonly dateIt = dateIt;

  progress(): ValidityProgress {
    return validityProgress(this.start, this.end);
  }

  tone(p: ValidityProgress): Tone {
    switch (p.state) {
      case 'expired': return 'danger';
      case 'future': return 'info';
      case 'none': return 'off';
      default: return 'ok';
    }
  }

  stateLabel(p: ValidityProgress): string {
    switch (p.state) {
      case 'none': return 'Date non indicate';
      case 'open': return 'In corso, senza scadenza';
      case 'future': return 'Non ancora iniziato';
      case 'expired': return 'Scaduto';
      default: return p.percent === null ? 'In corso' : `In corso · ${p.percent}%`;
    }
  }
}
```

- [ ] **Step 6: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK. (Componenti non ancora usati: esbuild li elimina, ma il type-check dei template standalone avviene comunque solo quando sono importati — il vero controllo arriva dal Task 6.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/core/components/entity-sheet/status-badge.component.ts frontend/src/app/core/components/entity-sheet/tab-label.component.ts frontend/src/app/core/components/entity-sheet/entity-sheet.component.ts frontend/src/app/core/components/entity-sheet/preview-card.component.ts frontend/src/app/core/components/entity-sheet/validity-bar.component.ts
git commit -m "feat(frontend): shell scheda, badge stato, etichette tab e anteprime

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tabella collegamenti

**Files:**
- Create: `frontend/src/app/core/components/entity-sheet/linked-table.component.ts`

**Interfaces:**
- Consumes: `FilterableSelectComponent` (`app-filterable-select`, CVA, inputs `label`, `placeholder`, `options`), `TOption` (`{label, value, sublabel?, searchText?}`), `StatusBadgeComponent`, `StatusInfo`.
- Produces: `LinkedRow {id:number}`, `LinkedColumn<R> {label:string; value:(row:R)=>string}`, `RowIcon {icon:string; color?:string}`; `<app-linked-table [columns] [rows] [addOptions] [addLabel] [createLabel] [unlinkable] [emptyText] [rowIcon] [rowStatus] (open)="R" (add)="number" (unlink)="number" (create)>`.

- [ ] **Step 1: Create `linked-table.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {FilterableSelectComponent} from '../filterable-select.component';
import {TOption} from '../../types/option.interface';
import {StatusInfo} from '../../helpers/entity-status';
import {StatusBadgeComponent} from './status-badge.component';

export interface LinkedRow {
  id: number;
}

export interface LinkedColumn<R> {
  label: string;
  value: (row: R) => string;
}

export interface RowIcon {
  icon: string;
  color?: string;
}

// Tabella dei collegamenti di una scheda: righe cliccabili (aprono la scheda
// collegata), "Collega" da un elenco, "Scollega" per riga, "Nuovo" opzionale.
// Le opzioni disponibili si ricalcolano solo quando cambiano gli input: un
// array nuovo a ogni change detection azzererebbe il filtro mentre si digita.
@Component({
  selector: 'app-linked-table',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule, MatTooltipModule, FilterableSelectComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (addOptions || createLabel) {
      <div class="lt-toolbar">
        @if (addOptions) {
          <div class="lt-picker">
            <app-filterable-select [label]="addLabel" placeholder="Cerca..." [options]="available" [(ngModel)]="toAdd"></app-filterable-select>
          </div>
          <button mat-flat-button type="button" class="lt-link-btn" [disabled]="toAdd === null" (click)="confirmAdd()">
            <mat-icon>link</mat-icon> Collega
          </button>
        }
        @if (createLabel) {
          <button mat-stroked-button type="button" class="lt-link-btn" (click)="create.emit()">
            <mat-icon>add</mat-icon> {{ createLabel }}
          </button>
        }
      </div>
    }
    @if (rows.length === 0) {
      <p class="lt-empty">{{ emptyText }}</p>
    } @else {
      <div class="lt-scroll">
        <table class="lt-table">
          <thead>
            <tr>
              @if (rowIcon) {
                <th class="lt-icon-col"></th>
              }
              @for (c of columns; track c.label) {
                <th>{{ c.label }}</th>
              }
              @if (rowStatus) {
                <th>Stato</th>
              }
              <th class="lt-actions"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track row.id) {
              <tr class="lt-row" tabindex="0" (click)="open.emit(row)" (keydown.enter)="open.emit(row)">
                @if (rowIcon) {
                  @let ic = rowIcon(row);
                  <td class="lt-icon-col">
                    @if (ic) {
                      <mat-icon [style.color]="ic.color ?? null">{{ ic.icon }}</mat-icon>
                    }
                  </td>
                }
                @for (c of columns; track c.label) {
                  <td>{{ c.value(row) }}</td>
                }
                @if (rowStatus) {
                  @let st = rowStatus(row);
                  <td>
                    @if (st) {
                      <app-status-badge [info]="st" size="sm"></app-status-badge>
                    }
                  </td>
                }
                <td class="lt-actions">
                  @if (unlinkable) {
                    <button mat-icon-button type="button" matTooltip="Scollega" (click)="onUnlink($event, row)">
                      <mat-icon>link_off</mat-icon>
                    </button>
                  }
                  <mat-icon class="lt-chevron">chevron_right</mat-icon>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .lt-toolbar { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
    .lt-picker { flex: 1 1 320px; }
    .lt-link-btn { margin-top: 8px; }
    .lt-empty { color: var(--sheet-muted); margin: 0; }
    .lt-scroll { overflow-x: auto; }
    .lt-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .lt-table th { text-align: left; font-weight: 600; color: var(--sheet-muted); padding: 6px 8px; border-bottom: 1px solid var(--sheet-border); white-space: nowrap; }
    .lt-table td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
    .lt-row { cursor: pointer; }
    .lt-row:hover, .lt-row:focus { background: #f9fafb; outline: none; }
    .lt-icon-col { width: 32px; }
    .lt-icon-col .mat-icon { font-size: 20px; width: 20px; height: 20px; vertical-align: middle; }
    .lt-actions { width: 1%; white-space: nowrap; text-align: right; }
    .lt-chevron { color: #9ca3af; vertical-align: middle; }
  `],
})
export class LinkedTableComponent<R extends LinkedRow> implements OnChanges {
  @Input({required: true}) columns: LinkedColumn<R>[] = [];
  @Input({required: true}) rows: R[] = [];
  @Input() addOptions: TOption[] | null = null;
  @Input() addLabel = 'Collega';
  @Input() createLabel: string | null = null;
  @Input() unlinkable = false;
  @Input() emptyText = 'Nessun elemento collegato.';
  @Input() rowIcon: ((row: R) => RowIcon | null) | null = null;
  @Input() rowStatus: ((row: R) => StatusInfo | null) | null = null;

  @Output() open = new EventEmitter<R>();
  @Output() add = new EventEmitter<number>();
  @Output() unlink = new EventEmitter<number>();
  @Output() create = new EventEmitter<void>();

  available: TOption[] = [];
  toAdd: number | null = null;

  ngOnChanges(): void {
    const linked = new Set(this.rows.map(r => r.id));
    this.available = (this.addOptions ?? []).filter(o => !linked.has(Number(o.value)));
  }

  confirmAdd(): void {
    if (this.toAdd === null) return;
    this.add.emit(Number(this.toAdd));
    this.toAdd = null;
  }

  onUnlink(event: Event, row: R): void {
    event.stopPropagation();
    this.unlink.emit(row.id);
  }
}
```

- [ ] **Step 2: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/components/entity-sheet/linked-table.component.ts
git commit -m "feat(frontend): tabella collegamenti cliccabile per le schede

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: EntityNavigatorService

**Files:**
- Create: `frontend/src/app/core/services/entity-navigator.service.ts`

**Interfaces:**
- Consumes: `openSheet` (Task 1); `AssetService`, `UtilityService`, `ContractsService`, `UtilizerGrantService` (`getById`, `create`, `update` da `AbstractService`); `AuthService.getCurrentUser()`.
- Produces (tutti Observable *cold*, il chiamante fa `subscribe`):
  - `openAsset(id: number): Observable<Asset | null>` — salvato o null
  - `openUtility(id: number): Observable<Utility | null>`
  - `createUtility(prefill: Utility): Observable<Utility | null>`
  - `openPlant(id: number): Observable<boolean>` — true se qualcosa è stato salvato
  - `createPlant(assetId: number | null): Observable<boolean>`
  - `openSupplyContract(id: number): Observable<Contract | null>`
  - `createSupplyContract(utilityIds: number[]): Observable<Contract | null>`
  - `openGrant(id: number): Observable<UtilizerGrant | null>`
  - `createGrant(assetIds: number[]): Observable<UtilizerGrant | null>`

- [ ] **Step 1: Create the service**

```ts
import {inject, Injectable} from '@angular/core';
import {ComponentType} from '@angular/cdk/portal';
import {MatDialog} from '@angular/material/dialog';
import {catchError, from, map, Observable, of, switchMap} from 'rxjs';
import {openSheet} from '../components/entity-sheet/sheet-utils';
import {EditDialogData} from '../components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {AssetService} from '../../pages/assets/asset.service';
import {Asset} from '../../pages/assets/entity/asset.entity';
import {UtilityService} from '../../pages/utilities/utility.service';
import {Utility} from '../../pages/utilities/entity/utility.entity';
import {ContractsService} from '../../pages/contracts/contract.service';
import {Contract} from '../../pages/contracts/entity/contract.entity';
import {UtilizerGrantService} from '../../pages/utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../../pages/utilizer-grant/entity/utilizer-grant.entity';

// Import dinamici: i dialog iniettano questo servizio, un import statico dei
// dialog qui creerebbe un ciclo di moduli.
const ASSET_DIALOG = () => import('../../pages/assets/asset-edit-dialog.component').then(m => m.AssetEditDialogComponent);
const UTILITY_DIALOG = () => import('../../pages/utilities/utility-edit-dialog.component').then(m => m.UtilityEditDialogComponent);
const PLANT_DIALOG = () => import('../../pages/plants/plant-edit-dialog.component').then(m => m.PlantEditDialogComponent);
const CONTRACT_DIALOG = () => import('../../pages/contracts/contract-edit-dialog.component').then(m => m.ContractEditDialogComponent);
const GRANT_DIALOG = () => import('../../pages/utilizer-grant/utilizer-grant-edit-dialog.component').then(m => m.UtilizerGrantEditDialogComponent);

// Apre le schede collegate (impilate sopra quella corrente) e persiste il
// risultato dove il dialog non salva da sé (immobile, utenza, contratti: la
// persistenza normalmente la fa la tabella via onSave/onCreate). Carica
// sempre il record completo: findAll() non joina le stesse relazioni di
// findOne(), aprire con la riga di una lista darebbe dati bucati.
@Injectable({providedIn: 'root'})
export class EntityNavigatorService {
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private assets = inject(AssetService);
  private utilities = inject(UtilityService);
  private contracts = inject(ContractsService);
  private grants = inject(UtilizerGrantService);

  openAsset(id: number): Observable<Asset | null> {
    return this.assets.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Asset>, Asset>(ASSET_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.assets.update(r.id, r) : of(null))),
      catchError(err => this.fail("Errore apertura/salvataggio dell'immobile", err)),
    );
  }

  openUtility(id: number): Observable<Utility | null> {
    return this.utilities.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Utility>, Utility>(UTILITY_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.utilities.update(r.id, r) : of(null))),
      catchError(err => this.fail("Errore apertura/salvataggio dell'utenza", err)),
    );
  }

  createUtility(prefill: Utility): Observable<Utility | null> {
    return this.sheet<EditDialogData<Utility>, Utility>(UTILITY_DIALOG, {mode: 'create', item: prefill}).pipe(
      switchMap(r => (r ? this.utilities.create({...r, ...this.authorship()}) : of(null))),
      catchError(err => this.fail("Errore nella creazione dell'utenza", err)),
    );
  }

  // Il dialog impianto salva da sé e chiude con true se ha salvato qualcosa.
  openPlant(id: number): Observable<boolean> {
    return this.sheet<{plantId: number; readOnly: boolean}, boolean>(PLANT_DIALOG, {plantId: id, readOnly: this.readOnly()}).pipe(
      map(saved => !!saved),
    );
  }

  createPlant(assetId: number | null): Observable<boolean> {
    return this.sheet<{plantId: null; assetId: number | null; readOnly: boolean}, boolean>(
      PLANT_DIALOG, {plantId: null, assetId, readOnly: this.readOnly()},
    ).pipe(map(saved => !!saved));
  }

  openSupplyContract(id: number): Observable<Contract | null> {
    return this.contracts.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Contract>, Contract>(CONTRACT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.contracts.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto', err)),
    );
  }

  createSupplyContract(utilityIds: number[]): Observable<Contract | null> {
    return this.sheet<EditDialogData<Contract> & {preselectedUtilityIds: number[]}, Contract>(
      CONTRACT_DIALOG, {mode: 'create', item: Contract.create(), preselectedUtilityIds: utilityIds},
    ).pipe(
      switchMap(r => (r ? this.contracts.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto', err)),
    );
  }

  openGrant(id: number): Observable<UtilizerGrant | null> {
    return this.grants.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(GRANT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.grants.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto immobiliare', err)),
    );
  }

  createGrant(assetIds: number[]): Observable<UtilizerGrant | null> {
    return this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(
      GRANT_DIALOG, {mode: 'create', item: UtilizerGrant.create({asset_ids: assetIds})},
    ).pipe(
      switchMap(r => (r ? this.grants.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto immobiliare', err)),
    );
  }

  private sheet<D, R>(load: () => Promise<ComponentType<unknown>>, data: D): Observable<R | undefined> {
    return from(load()).pipe(
      switchMap(component => openSheet<unknown, D, R>(this.dialog, component, data).afterClosed()),
    );
  }

  private readOnly(): boolean {
    const role = this.auth.getCurrentUser()?.role;
    return !role || role === 'Lettore';
  }

  private authorship(): {created_by_user_id?: number; updated_by_user_id?: number} {
    const userId = this.auth.getCurrentUser()?.id;
    return {created_by_user_id: userId, updated_by_user_id: userId};
  }

  private fail(message: string, err: unknown): Observable<null> {
    console.error(message, err);
    return of(null);
  }
}
```

Note per l'implementer: se `Contract.create()` / `UtilizerGrant.create()` richiedono un argomento o `create`/`update` di `AbstractService` hanno una firma diversa, adattare leggendo `core/services/abstract.service.ts` e le entity (`Contract.create()` è già chiamato senza argomenti in `utility-edit-dialog.component.ts`). Se `getCurrentUser()?.id` non esiste con quel nome, usare quanto fa oggi `AssetEditDialogComponent.addUtility`.

- [ ] **Step 2: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK (nessun errore di import circolare; esbuild crea chunk lazy per i dialog o li condivide con gli import statici esistenti).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/services/entity-navigator.service.ts
git commit -m "feat(frontend): servizio di navigazione tra schede collegate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Aperture uniformi (openSheet ovunque)

**Files:**
- Modify: `frontend/src/app/core/components/abstract-data-table.component.ts:106-136`
- Modify: `frontend/src/app/pages/assets/data-table-assets.component.ts`
- Modify: `frontend/src/app/pages/utilities/data-table-utilities.component.ts:220-237` (+ costante `ASSET_DIALOG_WIDTH` riga 30)
- Modify: `frontend/src/app/pages/contracts/data-table-contracts.component.ts:79-81`
- Modify: `frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts:158-160`
- Modify: `frontend/src/app/pages/plants/plants.component.ts:287-296`
- Modify: `frontend/src/app/pages/map/map.component.ts:881-1000` (+ costante `EDIT_DIALOG_WIDTH` riga 81)
- Modify: `frontend/src/app/pages/audit-log/audit-log-page.component.ts:115-145` (+ costante riga 21)

**Interfaces:**
- Consumes: `sheetDialogConfig`, `openSheet` (Task 1); `EntityNavigatorService` (Task 4).
- Produces: `AbstractDataTableComponent.useSheet(): boolean` (protected, default false).

- [ ] **Step 1: `AbstractDataTableComponent`** — import `sheetDialogConfig` da `./entity-sheet/sheet-utils` e sostituire `openCreateDialog`/`openEditDialog`:

```ts
  openCreateDialog(): void {
    const data: EditDialogData<T> = {mode: 'create', item: this.itemInstance()};
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), this.dialogConfig(data))
      .afterClosed().subscribe(result => {
        if (result) this.onCreate.emit(result);
      });
  }

  openEditDialog(item: T): void {
    const data: EditDialogData<T> = {mode: 'edit', item: {...item}};
    this.dialog.open<unknown, EditDialogData<T>, T | undefined>(this.editDialogComponent(), this.dialogConfig(data))
      .afterClosed().subscribe(result => {
        if (result) this.onSave.emit(result);
      });
  }

  // Le entità con scheda (immobile, utenza, contratti) usano il dialog ad
  // altezza fissa; le anagrafiche semplici restano col dialog classico.
  protected useSheet(): boolean {
    return false;
  }

  private dialogConfig(data: EditDialogData<T>) {
    return this.useSheet()
      ? sheetDialogConfig(data, this.dialog.openDialogs.length)
      : {width: this.editDialogWidth(), maxWidth: this.editDialogWidth(), position: EDIT_DIALOG_POSITION, data};
  }
```

- [ ] **Step 2: Le 4 tabelle con scheda** — in `data-table-assets.component.ts`, `data-table-utilities.component.ts`, `data-table-contracts.component.ts`, `data-table-utilizer-grant.component.ts` aggiungere:

```ts
  protected override useSheet(): boolean {
    return true;
  }
```

e in `data-table-contracts.component.ts` / `data-table-utilizer-grant.component.ts` cancellare l'override `editDialogWidth()` (900px/1000px, ora inutilizzato).

- [ ] **Step 3: `DataTableUtilitiesComponent.navigateToAsset`** — sostituire il corpo (oggi apre il dialog e non salva alla chiusura) e iniettare il navigatore:

```ts
  private navigator = inject(EntityNavigatorService);

  navigateToAsset(assetId: number | null | undefined): void {
    if (!assetId) return;
    this.navigator.openAsset(assetId).subscribe();
  }
```

Rimuovere la costante `ASSET_DIALOG_WIDTH` e gli import non più usati (`AssetEditDialogComponent`, `EDIT_DIALOG_POSITION` se non usati altrove nel file). `inject` da `@angular/core` se non già importato.

- [ ] **Step 4: `PlantsComponent.openDialog`**

```ts
  openDialog(item?: Plant, plantId?: number): void {
    const role = this.auth.getCurrentUser()?.role;
    openSheet<PlantEditDialogComponent, PlantEditDialogData, boolean>(this.dialog, PlantEditDialogComponent, {
      plantId: item?.id ?? plantId ?? null,
      readOnly: !role || role === 'Lettore',
    }).afterClosed().subscribe(saved => {
      if (saved) this.reload();
    });
  }
```

(import `openSheet` da `../../core/components/entity-sheet/sheet-utils`).

- [ ] **Step 5: `MapComponent`** — iniettare `private navigator = inject(EntityNavigatorService);` e sostituire `openDetail`:

```ts
  openDetail(point: MapPoint | UngeolocatedItem): void {
    if (point.type === 'plant') {
      this.navigator.openPlant(point.id).subscribe(saved => {
        if (saved) this.reload();
      });
      return;
    }
    const opened = point.type === 'asset'
      ? this.navigator.openAsset(point.id)
      : this.navigator.openUtility(point.id);
    opened.subscribe(saved => {
      if (saved) this.reload();
    });
  }
```

In `createAssetAt` / `createUtilityAt` sostituire `.open(X, {width, maxWidth, position, data: D})` con `openSheet(this.dialog, X, D)` lasciando invariata la catena `.afterClosed().subscribe(...)`. Rimuovere la costante `EDIT_DIALOG_WIDTH` e gli import non più usati (`PlantEditDialogComponent`, `PlantEditDialogData`, `EDIT_DIALOG_POSITION`), verificando con grep nel file.

- [ ] **Step 6: `AuditLogPageComponent`** — nei due blocchi (righe ~119 e ~134) sostituire `.open(AssetEditDialogComponent, {width: EDIT_DIALOG_WIDTH, maxWidth: EDIT_DIALOG_WIDTH, position: EDIT_DIALOG_POSITION, data: {mode: 'edit', item: asset}})` con `openSheet(this.dialog, AssetEditDialogComponent, {mode: 'edit', item: asset})` (idem per l'utenza), lasciando invariato il resto della catena. Rimuovere la costante `EDIT_DIALOG_WIDTH` e l'import `EDIT_DIALOG_POSITION` se non più usati.

- [ ] **Step 7: Grep di controllo**

Run: `grep -rn "width: '1000px'\|width: '900px'\|EDIT_DIALOG_WIDTH\|ASSET_DIALOG_WIDTH" frontend/src/app/pages --include=*.ts`
Expected: risultati solo dentro `asset-edit-dialog.component.ts`, `utility-edit-dialog.component.ts`, `asset-plants-tab.component.ts`, `asset-real-estate-contracts-tab.component.ts` (riscritti/eliminati nei task successivi).

- [ ] **Step 8: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/core/components/abstract-data-table.component.ts frontend/src/app/pages/assets/data-table-assets.component.ts frontend/src/app/pages/utilities/data-table-utilities.component.ts frontend/src/app/pages/contracts/data-table-contracts.component.ts frontend/src/app/pages/utilizer-grant/data-table-utilizer-grant.component.ts frontend/src/app/pages/plants/plants.component.ts frontend/src/app/pages/map/map.component.ts frontend/src/app/pages/audit-log/audit-log-page.component.ts
git commit -m "refactor(frontend): apertura uniforme delle schede (altezza fissa, top ancorato)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scheda Immobile

**Files:**
- Modify (rewrite): `frontend/src/app/pages/assets/asset-edit-dialog.component.ts`
- Modify (rewrite): `frontend/src/app/pages/assets/asset-edit-dialog.component.html`
- Delete: `frontend/src/app/pages/plants/asset-plants-tab.component.ts`
- Delete: `frontend/src/app/pages/utilizer-grant/asset-real-estate-contracts-tab.component.ts`

**Interfaces:**
- Consumes: tutto da Task 1–4; `PlantService.list({asset_id})`, `UtilizerGrantService.search({asset_id} as never)`.
- Produces: nessuna API nuova (stesso selettore, stessi `MAT_DIALOG_DATA`/risultato `Asset | undefined`).

- [ ] **Step 1: Rewrite `asset-edit-dialog.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Asset} from './entity/asset.entity';
import {AuthService} from '../../services/auth.service';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {AssetNaturesService} from '../asset-nature/asset-nature.service';
import {AssetNature} from '../asset-nature/entity/asset-nature.entity';
import {AssetFunctionsService} from '../asset-function/asset-function.service';
import {AssetFunction} from '../asset-function/entity/asset-function.entity';
import {ASSET_STATUS_OPTIONS, AssetStatus} from './enum/asset-status.enum';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';
import {HardType, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {PhotosService} from '../../services/photos.service';
import {ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {PlantService} from '../plants/plant.service';
import {Plant, PLANT_TYPE_ICON, PLANT_TYPE_LABEL} from '../plants/plant.model';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, formatEuro, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {
  assetStatus,
  grantStatus,
  inspectionStatusInfo,
  legacyTypeStatus,
  plantStatus,
  StatusInfo,
  utilityStatus,
} from '../../core/helpers/entity-status';
import {dateIt, hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

interface UtilitySection {
  type: HardType;
  label: string;
  icon: string;
  color: string;
  rows: Utility[];
}

interface UtilityTypeButton {
  value: HardType;
  label: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-asset-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatTabsModule, MatTooltipModule, MatIconModule, OnlyNumbersDirective, LatitudeInputDirective,
    LongitudeInputDirective, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-edit-dialog.component.html'
})
export class AssetEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetEditDialogComponent, Asset | undefined>);
  private authService = inject(AuthService);
  private naturesService = inject(AssetNaturesService);
  private functionsService = inject(AssetFunctionsService);
  private assetService = inject(AssetService);
  private photosService = inject(PhotosService);
  private utilityTypesService = inject(UtilityTypesService);
  private plantService = inject(PlantService);
  private grantService = inject(UtilizerGrantService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<Asset>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);

  natures: AssetNature[] = [];
  private allFunctions: AssetFunction[] = [];
  statusOptions = ASSET_STATUS_OPTIONS;

  // Regola di classificazione in ordine fisso: la prima risposta "sì"
  // decide, così due operatori classificano lo stesso oggetto allo stesso
  // modo (stessa regola del seed in 1790400000000-AddAssetClassification).
  readonly classificationRule = [
    `Rispondere nell'ordine, la prima risposta "sì" decide:`,
    `1. È un edificio chiuso, con muri e tetto, anche piccolo (es. chiosco)? → Fabbricato`,
    `2. È un dispositivo o un punto di fornitura tecnico (punto luce, semaforo, fontana, presa, pompa, cabina)? → Impianto`,
    `3. È un'opera costruita non chiusa (tribuna, pensilina, ponte, palco fisso, gazebo, colombario, monumento)? → Manufatto`,
    `4. Altrimenti è una superficie scoperta (parco, piazza, parcheggio, rotatoria, campo, terreno) → Area`,
  ].join('\n');

  // Obbligatori per immobili nuovi e per quelli già riclassificati (non
  // devono poter tornare "vuoti"); un immobile legacy si salva anche senza
  // riclassificarlo (tiene il vecchio tipo).
  mustClassify = this.isNew || this.data.item.asset_type_id == null;
  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();
  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];

  form = this.fb.group({
    asset_name: [this.data.item.asset_name ?? '', Validators.required],
    nature_id: [this.data.item.nature_id ?? null, this.mustClassify ? Validators.required : []],
    function_id: [this.data.item.function_id ?? null, this.mustClassify ? Validators.required : []],
    status: [this.data.item.status ?? AssetStatus.ATTIVO, Validators.required],
    category: [this.data.item.category ?? null],
    ownership: [this.data.item.ownership ?? 0],
    toponym: [this.data.item.toponym ?? null],
    address: [this.data.item.address ?? null],
    civic_number: [this.data.item.civic_number ?? null],
    municipality: [this.data.item.municipality ?? null],
    zip_code: [this.data.item.zip_code ?? null],
    services_and_artifacts: [this.data.item.services_and_artifacts ?? null],
    latitude: [this.data.item.latitude ?? null],
    longitude: [this.data.item.longitude ?? null],
    cadastral_value: [this.data.item.cadastral_value ?? null],
    sheet: [this.data.item.sheet ?? null],
    parcel: [this.data.item.parcel ?? null],
    subordinate: [this.data.item.subordinate ?? null],
    area_sqm: [this.data.item.area_sqm ?? null],
    associated_building: [this.data.item.associated_building ?? null],
    specific_details: [this.data.item.specific_details ?? null],
    memo: [this.data.item.memo ?? null],
  });

  photoCount: number | null = null;

  // Collegamenti: campi cache, aggiornati solo su load/aggiunta/salvataggio.
  utilitySections: UtilitySection[] = [];
  missingUtilityTypes: UtilityTypeButton[] = [];
  utilityPreview: PreviewItem[] = [];
  plants: Plant[] = [];
  plantPreview: PreviewItem[] = [];
  grants: UtilizerGrant[] = [];
  grantPreview: PreviewItem[] = [];

  // Serve ad "Aggiungi utenza" per pre-selezionare il UtilityType giusto in
  // base al tipo, dato che il form utenza lavora per id di UtilityType.
  private utilityTypeIdByHardType = new Map<HardType, number>();

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? ''},
    {label: 'Codice cliente', value: u => u.utility_code ?? ''},
    {label: 'Contatore', value: u => u.meter_number ?? ''},
    {label: 'Inizio fornitura', value: u => dateIt(u.supply_start_date)},
  ];
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  readonly plantColumns: LinkedColumn<Plant>[] = [
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
    {label: 'Codice', value: p => p.code},
    {label: 'Nome', value: p => p.name},
    {label: 'Utenze', value: p => (p.utilities ?? []).map(u => u.utility_id).join(', ')},
  ];
  readonly plantIconOf = (p: Plant): RowIcon => ({icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)'});
  readonly plantStatusOf = (p: Plant): StatusInfo | null => inspectionStatusInfo(p.inspection_status);

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Direzione', value: g => (g.direction ? DIRECTION_LABEL[g.direction] : '')},
    {label: 'Tipo', value: g => (g.kind ? KIND_LABEL[g.kind] : '')},
    {label: 'Controparte', value: g => g.utilizer?.name ?? ''},
    {label: 'Oggetto', value: g => g.subject ?? ''},
    {label: 'Canone annuo', value: g => formatEuro(g.annual_rent)},
    {label: 'Scadenza', value: g => dateIt(g.effective_end_date)},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status);

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    } else {
      this.syncFunctionEnabled();
      // Cambio natura: la funzione scelta potrebbe non essere più ammessa.
      this.form.controls.nature_id.valueChanges.subscribe(() => {
        const fid = this.form.controls.function_id.value;
        if (fid != null && !this.functionOptions().some(f => f.id === fid)) {
          this.form.controls.function_id.setValue(null);
        }
        this.syncFunctionEnabled();
      });
    }
  }

  // Funzione selezionabile solo dopo la natura (le funzioni ammesse
  // dipendono dalla natura).
  private syncFunctionEnabled(): void {
    const fn = this.form.controls.function_id;
    if (this.form.controls.nature_id.value == null) fn.disable({emitEvent: false});
    else fn.enable({emitEvent: false});
  }

  ngOnInit(): void {
    this.naturesService.search({deleted: false} as never).subscribe({
      next: data => this.natures = data,
      error: err => console.error('Errore nel caricamento delle tipologie immobile:', err)
    });
    this.functionsService.search({deleted: false} as never).subscribe({
      next: data => this.allFunctions = data,
      error: err => console.error('Errore nel caricamento delle funzioni immobile:', err)
    });
    this.utilityTypesService.search({deleted: false}).subscribe({
      next: (data: UtilityType[]) => {
        this.utilityTypeIdByHardType.clear();
        for (const t of data) {
          if (!this.utilityTypeIdByHardType.has(t.hard_type)) this.utilityTypeIdByHardType.set(t.hard_type, t.id);
        }
      },
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
    this.refreshUtilities();
    if (!this.isNew) {
      // Conteggio "Foto (N)" prima di aprire il tab (lazy): solo metadati.
      this.photosService.list('asset', this.data.item.id).subscribe({
        next: photos => this.photoCount = photos.length,
        error: () => {}
      });
      this.loadPlants();
      this.loadGrants();
    }
  }

  // Icona header: segue la funzione selezionata nel form; in transizione
  // ricade sull'icona del vecchio aggregato, stesso fallback dei marker mappa.
  currentAssetIcon(): string {
    const fid = this.form.controls.function_id.value;
    const fn = this.allFunctions.find(f => f.id === fid);
    return fn?.icon || this.data.item.assetAggregator?.icon || ASSET_AGGREGATOR_ICON_FALLBACK;
  }

  functionOptions(): AssetFunction[] {
    const nature = this.natures.find(n => n.id === this.form.controls.nature_id.value);
    return nature?.functions ?? [];
  }

  selectedNature(): AssetNature | undefined {
    return this.natures.find(n => n.id === this.form.controls.nature_id.value);
  }

  selectedFunction(): AssetFunction | undefined {
    return this.allFunctions.find(f => f.id === this.form.controls.function_id.value);
  }

  // Vecchio tipo ancora valorizzato = immobile da riclassificare.
  legacyTypeLabel(): string | null {
    return this.data.item.asset_type_id != null ? (this.data.item.assetAggregator?.code ?? null) : null;
  }

  statusInfo(): StatusInfo {
    return assetStatus(this.form.controls.status.value);
  }

  legacyBadge(): StatusInfo | null {
    return legacyTypeStatus(this.legacyTypeLabel());
  }

  titleText(): string {
    return this.isNew ? 'Nuovo immobile' : (this.form.controls.asset_name.value || 'Immobile senza nome');
  }

  addressLine(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [street, v.municipality].filter(Boolean).join(', ');
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  utilityCount(): number {
    return this.data.item.utilities?.length ?? 0;
  }

  hasOverdueInspections(): boolean {
    return this.plants.some(p => p.inspection_status === 'OVERDUE');
  }

  hasExpiredGrants(): boolean {
    return this.grants.some(g => g.computed_status === 'EXPIRED');
  }

  private refreshUtilities(): void {
    const all = this.data.item.utilities ?? [];
    const types = HardType.items();
    this.utilitySections = types
      .map(t => ({
        type: t.value, label: t.label, icon: HardTypeMatIcon[t.value], color: t.color,
        rows: all.filter(u => u.utilityType?.hard_type === t.value),
      }))
      .filter(s => s.rows.length > 0);
    this.missingUtilityTypes = types
      .filter(t => !this.utilitySections.some(s => s.type === t.value))
      .map(t => ({value: t.value, label: t.label, icon: HardTypeMatIcon[t.value], color: t.color}));
    this.utilityPreview = this.utilitySections.flatMap(s => s.rows.map(u => ({
      id: u.id, label: u.utility_id ?? `#${u.id}`, sublabel: s.label, icon: s.icon, color: s.color,
      status: utilityStatus(u.supply_active),
    })));
  }

  private loadPlants(): void {
    this.plantService.list({asset_id: this.data.item.id}).subscribe({
      next: rows => {
        this.plants = rows;
        this.plantPreview = rows.map(p => ({
          id: p.id, label: `${p.code} — ${p.name}`, sublabel: PLANT_TYPE_LABEL[p.type],
          icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)', status: plantStatus(p.status),
        }));
      },
      error: err => console.error('Errore caricamento impianti:', err),
    });
  }

  private loadGrants(): void {
    this.grantService.search({asset_id: this.data.item.id} as never).subscribe({
      next: rows => {
        this.grants = rows;
        this.grantPreview = rows
          .filter(g => g.computed_status === 'ACTIVE' || g.computed_status === 'EXPIRING')
          .map(g => ({
            id: g.id, label: g.utilizer?.name ?? `#${g.id}`,
            sublabel: [g.kind ? KIND_LABEL[g.kind] : null, g.subject].filter(Boolean).join(' · '),
            icon: 'real_estate_agent', color: 'var(--entity-grant)', status: grantStatus(g.computed_status),
          }));
      },
      error: err => console.error('Errore caricamento contratti immobiliari:', err),
    });
  }

  addUtility(hardType: HardType): void {
    const prefill = Utility.create({
      asset_ids: [this.data.item.id],
      assets: [this.data.item],
      utility_type_id_fk: this.utilityTypeIdByHardType.get(hardType) ?? undefined,
    });
    this.navigator.createUtility(prefill).subscribe(created => {
      if (!created) return;
      // La POST non popola le relazioni: senza questo stub la nuova utenza
      // resterebbe invisibile nella sua sezione finché non si riapre.
      created.utilityType = {hard_type: hardType} as UtilityType;
      this.data.item.utilities = [...(this.data.item.utilities ?? []), created];
      this.refreshUtilities();
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (!saved) return;
      const stillLinked = saved.assets?.some(a => a.id === this.data.item.id) ?? true;
      const others = (this.data.item.utilities ?? []).filter(u => u.id !== saved.id);
      this.data.item.utilities = stillLinked ? [...others, saved] : others;
      this.refreshUtilities();
    });
  }

  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (saved) this.loadPlants();
    });
  }

  createPlant(): void {
    this.navigator.createPlant(this.data.item.id).subscribe(saved => {
      if (saved) this.loadPlants();
    });
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved) this.loadGrants();
    });
  }

  createGrant(): void {
    this.navigator.createGrant([this.data.item.id]).subscribe(saved => {
      if (saved) this.loadGrants();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const result = plainToInstance(Asset, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }
}
```

- [ ] **Step 2: Rewrite `asset-edit-dialog.component.html`**

```html
<app-entity-sheet
  [icon]="currentAssetIcon()"
  color="var(--entity-asset)"
  [title]="titleText()"
  [subtitle]="addressLine()"
  [lastModified]="lastModified">
  <ng-container sheetBadges>
    <app-status-badge [info]="statusInfo()"></app-status-badge>
    @if (legacyBadge(); as legacy) {
      <app-status-badge [info]="legacy" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo"
                         [error]="invalid('asset_name', 'nature_id', 'function_id', 'status')"></app-tab-label>
        </ng-template>

        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>Nome edificio *</mat-label>
            <input matInput formControlName="asset_name">
            @if (form.controls.asset_name.invalid && form.controls.asset_name.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>

          <mat-form-field>
            <mat-label>Stato</mat-label>
            <mat-select formControlName="status">
              @for (opt of statusOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Proprietà</mat-label>
            <mat-select formControlName="ownership">
              @for (opt of ownershipOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Tipologia</mat-label>
            <mat-select formControlName="nature_id">
              <!-- Trigger esplicito: senza, la select chiusa mostrerebbe il testo
                   completo dell'opzione, ligatura icona inclusa ("apartmentFabbricato"). -->
              <mat-select-trigger>{{ selectedNature()?.name }}</mat-select-trigger>
              <mat-option [value]="null">—</mat-option>
              @for (opt of natures; track opt.id) {
                <mat-option [value]="opt.id">
                  <span><mat-icon style="vertical-align: middle; margin-right: 4px; font-size: 18px; height: 18px; width: 18px;">{{ opt.icon || 'category' }}</mat-icon>{{ opt.name }}</span>
                </mat-option>
              }
            </mat-select>
            <mat-icon matSuffix class="classification-help" [matTooltip]="classificationRule" matTooltipClass="tooltip-multiline"
                      (click)="$event.stopPropagation()">help_outline</mat-icon>
            @if (form.controls.nature_id.invalid && form.controls.nature_id.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>

          <mat-form-field>
            <mat-label>Funzione</mat-label>
            <mat-select formControlName="function_id">
              <mat-select-trigger>{{ selectedFunction()?.name }}</mat-select-trigger>
              <mat-option [value]="null">—</mat-option>
              @for (opt of functionOptions(); track opt.id) {
                <mat-option [value]="opt.id">
                  <span><mat-icon style="vertical-align: middle; margin-right: 4px; font-size: 18px; height: 18px; width: 18px;">{{ opt.icon || 'apartment' }}</mat-icon>{{ opt.name }}</span>
                </mat-option>
              }
            </mat-select>
            @if (form.controls.nature_id.value == null) {
              <mat-hint>Scegliere prima la tipologia</mat-hint>
            }
            @if (form.controls.function_id.invalid && form.controls.function_id.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>

          <mat-form-field class="span-2">
            <mat-label>Categoria (destinazione d'uso)</mat-label>
            <mat-select formControlName="category">
              @for (opt of categoryOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <div class="sheet-section-title"><mat-icon>place</mat-icon>Indirizzo e posizione</div>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Toponimo</mat-label>
            <mat-select formControlName="toponym">
              @for (opt of toponomyOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Indirizzo</mat-label>
            <input matInput formControlName="address">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Civico</mat-label>
            <input matInput formControlName="civic_number">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Comune</mat-label>
            <input matInput formControlName="municipality">
          </mat-form-field>
          <mat-form-field>
            <mat-label>CAP</mat-label>
            <input matInput formControlName="zip_code" maxlength="5" inputmode="numeric" onlyNumbers>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Latitudine</mat-label>
            <input matInput formControlName="latitude" placeholder="Es. 41.1158" geoLatitude>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Longitudine</mat-label>
            <input matInput formControlName="longitude" placeholder="Es. 16.8776" geoLongitude>
          </mat-form-field>
        </div>
        <app-location-map
          [latitude]="form.controls.latitude.value"
          [longitude]="form.controls.longitude.value"
          [estimatedLatitude]="data.item.geocoded_latitude ?? null"
          [estimatedLongitude]="data.item.geocoded_longitude ?? null"
          (positionSelected)="onPositionSelected($event)"
          (positionCleared)="onPositionCleared()">
        </app-location-map>
        @if (!form.controls.latitude.value && data.item.geocoded_latitude) {
          <p class="sheet-hint">Posizione stimata da indirizzo (geocodifica) — clicca sulla mappa per confermarne una reale.</p>
        }

        @if (form.controls.memo.value) {
          <div class="sheet-memo">
            <mat-icon>sticky_note_2</mat-icon>
            <div><strong>Promemoria</strong><p>{{ form.controls.memo.value }}</p></div>
          </div>
        }

        @if (!isNew) {
          <div class="sheet-previews">
            <app-preview-card title="Utenze" icon="electric_meter" color="var(--entity-utility)"
                              [items]="utilityPreview" emptyText="Nessuna utenza"
                              (seeAll)="goTo('Utenze')" (open)="openUtility($event.id)"></app-preview-card>
            <app-preview-card title="Impianti" icon="settings_input_component" color="var(--entity-plant)"
                              [items]="plantPreview" emptyText="Nessun impianto"
                              (seeAll)="goTo('Impianti')" (open)="openPlant($event.id)"></app-preview-card>
            <app-preview-card title="Contratti immobiliari attivi" icon="real_estate_agent" color="var(--entity-grant)"
                              [items]="grantPreview" emptyText="Nessun contratto attivo"
                              (seeAll)="goTo('Contratti immobiliari')" (open)="openGrant($event.id)"></app-preview-card>
          </div>
        }
      </mat-tab>

      <mat-tab aria-label="Catasto">
        <ng-template mat-tab-label>
          <app-tab-label icon="map" label="Catasto"
                         [dot]="filled('cadastral_value', 'sheet', 'parcel', 'subordinate', 'area_sqm', 'associated_building', 'services_and_artifacts')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Foglio</mat-label>
            <input matInput formControlName="sheet">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Particella (Mappale)</mat-label>
            <input matInput formControlName="parcel">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Subalterno</mat-label>
            <input matInput formControlName="subordinate">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Valore catastale (€)</mat-label>
            <input matInput type="number" step="0.01" formControlName="cadastral_value">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Superficie (mq)</mat-label>
            <input matInput type="number" step="0.01" formControlName="area_sqm">
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Servizi/Manufatti</mat-label>
            <input matInput formControlName="services_and_artifacts">
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Descrizione fabbricato</mat-label>
            <textarea matInput formControlName="associated_building" rows="3" maxlength="255"></textarea>
          </mat-form-field>
        </div>
      </mat-tab>

      <mat-tab aria-label="Utenze" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="electric_meter" label="Utenze" [count]="isNew ? null : utilityCount()"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          @for (s of utilitySections; track s.type) {
            <section class="sheet-section">
              <div class="sheet-section-title">
                <mat-icon [style.color]="s.color">{{ s.icon }}</mat-icon>{{ s.label }} ({{ s.rows.length }})
              </div>
              <app-linked-table
                [columns]="utilityColumns"
                [rows]="s.rows"
                [rowStatus]="utilityStatusOf"
                [createLabel]="canEdit ? 'Aggiungi utenza ' + s.label : null"
                (create)="addUtility(s.type)"
                (open)="openUtility($event.id)">
              </app-linked-table>
            </section>
          } @empty {
            <p class="sheet-empty">Nessuna utenza collegata a questo immobile.</p>
          }
          @if (canEdit && missingUtilityTypes.length) {
            <div class="sheet-add-row">
              @for (t of missingUtilityTypes; track t.value) {
                <button mat-stroked-button type="button" (click)="addUtility(t.value)">
                  <mat-icon [style.color]="t.color">{{ t.icon }}</mat-icon> Utenza {{ t.label }}
                </button>
              }
            </div>
          }
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Impianti" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="settings_input_component" label="Impianti"
                         [count]="isNew ? null : plants.length" [tone]="hasOverdueInspections() ? 'danger' : 'info'"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-linked-table
            [columns]="plantColumns"
            [rows]="plants"
            [rowIcon]="plantIconOf"
            [rowStatus]="plantStatusOf"
            [createLabel]="canEdit ? 'Nuovo impianto' : null"
            emptyText="Nessun impianto censito in questo immobile."
            (create)="createPlant()"
            (open)="openPlant($event.id)">
          </app-linked-table>
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Contratti immobiliari" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="real_estate_agent" label="Contratti immobiliari"
                         [count]="isNew ? null : grants.length" [tone]="hasExpiredGrants() ? 'danger' : 'info'"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-linked-table
            [columns]="grantColumns"
            [rows]="grants"
            [rowStatus]="grantStatusOf"
            [createLabel]="canEdit ? 'Nuovo contratto' : null"
            emptyText="Nessun contratto immobiliare per questo immobile."
            (create)="createGrant()"
            (open)="openGrant($event.id)">
          </app-linked-table>
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Note">
        <ng-template mat-tab-label>
          <app-tab-label icon="notes" label="Note" [dot]="filled('specific_details', 'memo')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field class="span-all">
            <mat-label>Specifiche</mat-label>
            <textarea matInput formControlName="specific_details" rows="4"></textarea>
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Promemoria</mat-label>
            <textarea matInput formControlName="memo" rows="4"></textarea>
            <mat-hint>Mostrato in evidenza nel Riepilogo</mat-hint>
          </mat-form-field>
        </div>
      </mat-tab>

      <mat-tab aria-label="Foto" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="photo_library" label="Foto" [count]="photoCount"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-photo-gallery [entityType]="'asset'" [entityId]="data.item.id"></app-photo-gallery>
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Storico" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="history" label="Storico"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-entity-history
            [entity]="'assets'"
            [entityId]="data.item.id"
            [lastModifiedBy]="data.item.updated_by ? data.item.updated_by.firstName + ' ' + data.item.updated_by.lastName : null"
            [lastModifiedAt]="data.item.update_date ? data.item.update_date.toString() : null">
          </app-entity-history>
        </ng-template>
      </mat-tab>
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea immobile' : 'Salva immobile' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

- [ ] **Step 3: Delete the old tab components**

```bash
git rm frontend/src/app/pages/plants/asset-plants-tab.component.ts frontend/src/app/pages/utilizer-grant/asset-real-estate-contracts-tab.component.ts
```

Poi `grep -rn "asset-plants-tab\|asset-real-estate-contracts-tab\|AssetPlantsTabComponent\|AssetRealEstateContractsTabComponent" frontend/src` → atteso: nessun risultato.

- [ ] **Step 4: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK. Errori di template tipici da correggere: tipo di `update_date` (Date) accettato da `lastModifiedLabel`; `PlantService.list` con `{asset_id}` (firma `PlantFilters`).

- [ ] **Step 5: Verifica E2E (Playwright MCP)**

Credenziali: utente temporaneo Admin come da CLAUDE.md ("Nessuna credenziale dev/seed…": hash con `docker exec utenzepa-api-1 node -e "require('bcrypt').hash('Sheet-Test-2026', 10).then(console.log)"`, INSERT in `system_users` con `username='e2e_sheet'`, `role='Admin'`, `status='Attivo'`, `auth_provider='local'`, `created_by_user_id=1`, `updated_by_user_id=1`). Riusarlo per i Task 6–12; eliminarlo nel Task 12.

Verificare su `http://localhost:4300/building?selectedId=<id di un immobile con utenze, impianti e contratti>` (trovarlo con `SELECT a.id FROM assets a JOIN plant_assets ...` o scegliendone uno dalla lista):
1. Header: icona colorata, nome, badge stato verde/ambra/grigio coerente con `status`; cambiando Stato nel form il badge cambia subito.
2. Altezza e posizione del dialog costanti cambiando tab (`browser_evaluate`: `document.querySelector('.entity-sheet-panel').getBoundingClientRect()` uguale su Riepilogo, Catasto, Foto); scorre solo il contenuto del tab, header/tab/footer restano visibili.
3. Riepilogo: mappa visibile, tre riquadri anteprima con conteggi; "Apri sezione"/"Vedi tutti" porta al tab giusto; click su una riga apre la scheda collegata impilata, 2vh più in basso.
4. Tab Utenze: sezioni per tipo con conteggio, righe cliccabili; pulsanti "Utenza <tipo>" solo per i tipi assenti.
5. Svuotare "Nome edificio", passare al tab Catasto, cliccare Salva: il dialog resta aperto e l'etichetta Riepilogo mostra il pallino rosso. Ripristinare con Annulla (nessun salvataggio).
6. Nuovo immobile da `/building` (pulsante aggiungi): tab Utenze/Impianti/Contratti/Foto/Storico disabilitati, nessuna anteprima.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/pages/assets/asset-edit-dialog.component.ts frontend/src/app/pages/assets/asset-edit-dialog.component.html
git commit -m "feat(frontend): scheda immobile con riepilogo, catasto e tab collegamenti

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(I `git rm` dello Step 3 sono già in stage e finiscono nello stesso commit.)

---

### Task 7: Scheda Utenza

**Files:**
- Modify (rewrite): `frontend/src/app/pages/utilities/utility-edit-dialog.component.ts`
- Modify (rewrite): `frontend/src/app/pages/utilities/utility-edit-dialog.component.html`

**Interfaces:**
- Consumes: Task 1–4; `PlantService.list()` (`Plant[]`), `PlantService.get(id)`, `ContractsService.search({utility_id} as never)`.
- Produces: stesso contratto del dialog (dati `EditDialogData<Utility>`, risultato `Utility | undefined`).

- [ ] **Step 1: Rewrite `utility-edit-dialog.component.ts`**

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectChange, MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {AuthService} from '../../services/auth.service';
import {Utility} from './entity/utility.entity';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {HardType, HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Phase} from './enum/phase.enum';
import {Asset} from '../assets/entity/asset.entity';
import {UseTypeDescription} from '../purpose/enum/use-type.enum';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {UtilityAggregatorsService} from '../utility-aggregator/utility-aggregator.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {CostsBorneByService} from '../costs-borne-by/costs-borne-by.service';
import {MaintenanceManagersService} from '../maintenance-managers/maintenance-managers.service';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {ContractsService} from '../contracts/contract.service';
import {Contract} from '../contracts/entity/contract.entity';
import {UtilityConsumptionsTabComponent} from './consumptions/utility-consumptions-tab.component';
import {PlantService} from '../plants/plant.service';
import {PLANT_TYPE_ICON, PLANT_TYPE_LABEL, PlantStatus, PlantType} from '../plants/plant.model';
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {SupplyType, SupplyTypeDescription} from '../budget-chapters/enum/supply-type.enum';
import {CONSUMPTION_UNIT_BY_HARD_TYPE, ConsumptionSummary, formatQty} from './consumptions/consumption.model';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {assetStatus, plantStatus, StatusInfo, supplyContractStatus, utilityFlags, utilityStatus} from '../../core/helpers/entity-status';
import {dateIt, hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

// Tipi fornitura capitolo compatibili col tipo utenza; SPRAR sempre
// compatibile (capitolo multi-utenza). Solo ordinamento, nessun blocco.
const CHAPTER_COMPATIBILITY: Record<HardType, SupplyType[]> = {
  [HardType.LIGHT]: [SupplyType.ELECTRICITY],
  [HardType.GAS]: [SupplyType.GAS_SUPPLY_ONLY, SupplyType.THERMAL_MANAGEMENT],
  [HardType.WATER]: [SupplyType.WATER],
  [HardType.INTERNET]: [],
};

// Un'utenza serve almeno un immobile o un impianto (stessa regola del backend).
function atLeastOneLink(group: AbstractControl): ValidationErrors | null {
  const assets = (group.get('asset_ids')?.value ?? []) as unknown[];
  const plants = (group.get('plant_ids')?.value ?? []) as unknown[];
  return assets.length + plants.length > 0 ? null : {noLink: true};
}

// Riga impianto: dall'elenco completo, o dai dati parziali dell'utenza
// finché l'elenco non è caricato.
interface PlantRow {
  id: number;
  code: string;
  name: string;
  type: PlantType;
  status?: PlantStatus;
}

@Component({
  selector: 'app-utility-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatTooltipModule, MatDatepickerModule, MatTabsModule,
    FilterableSelectComponent, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    UtilityConsumptionsTabComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent,
    PreviewCardComponent, LinkedTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utility-edit-dialog.component.html'
})
export class UtilityEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilityEditDialogComponent, Utility | undefined>);
  private authService = inject(AuthService);
  private assetsService = inject(AssetService);
  private plantService = inject(PlantService);
  private utilityAggregatorService = inject(UtilityAggregatorsService);
  private budgetChapterService = inject(BudgetChaptersService);
  private costsBorneByService = inject(CostsBorneByService);
  private maintenanceManagerService = inject(MaintenanceManagersService);
  private utilityTypeService = inject(UtilityTypesService);
  private contractsService = inject(ContractsService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<Utility>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly useTypeDescription = UseTypeDescription;
  readonly formatQty = formatQty;
  readonly HardType = HardType;

  utilityTypeOptions: UtilityType[] = [];
  assetOptions: Asset[] = [];
  assetSelectOptions: TOption[] = [];
  private allPlants: PlantRow[] = [];
  plantSelectOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];
  private budgetChapters: BudgetChapter[] = [];
  aggregatorOptions: TOption[] = [];
  costsBorneByOptions: TOption[] = [];
  maintenanceOptions: TOption[] = [];

  booleanOptions: TOption[] = [
    {label: 'Sì', value: true},
    {label: 'No', value: false}
  ];

  phaseTypeOptions: TOption[] = [
    {label: 'Monofase', value: Phase.SINGLE_PHASE},
    {label: 'Trifase', value: Phase.THREE_PHASE},
    {label: 'N/A', value: Phase.NOT_APPLICABLE}
  ];

  // Dall'utilityType già presente sull'item (edit) o null (create).
  selectedHardType: HardType | null = this.data.item.utilityType?.hard_type ?? null;

  get showLightFields(): boolean { return this.selectedHardType === HardType.LIGHT; }
  get showGasFields(): boolean { return this.selectedHardType === HardType.GAS; }

  // Se la relazione non è popolata (FK orfana o non caricata), il campo FK
  // parte null invece di mostrare un id non risolvibile nella select.
  private resolveOnRelation<K extends keyof Utility>(relation: keyof Utility, prop: K, data?: Partial<Utility>): Utility[K] | null {
    return (data as any)?.[relation] != null ? ((data as any)?.[prop] ?? null) : null;
  }

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    additional_notes: [this.data.item.additional_notes ?? ''],
    aggregator_id_fk: [this.resolveOnRelation('aggregator', 'aggregator_id_fk', this.data.item) ?? null],
    asset_ids: [(this.data.item.assets ?? []).map(a => a.id)],
    plant_ids: [(this.data.item.plants ?? []).map(p => p.id)],
    budget_chapter_code_fk: [this.resolveOnRelation('budgetChapter', 'budget_chapter_code_fk', this.data.item) ?? null, Validators.required],
    costs_borne_by_id_fk: [this.resolveOnRelation('costsBorneBy', 'costs_borne_by_id_fk', this.data.item) ?? null, Validators.required],
    disconnection_ability: [this.data.item.disconnection_ability ?? ''],
    estimated_annual_consumption: [this.data.item.estimated_annual_consumption ?? 0, Validators.required],
    latitude: [this.data.item.latitude ?? ''],
    longitude: [this.data.item.longitude ?? ''],
    maintenance_management_id_fk: [this.resolveOnRelation('maintenanceManager', 'maintenance_management_id_fk', this.data.item) ?? null],
    meter_number: [this.data.item.meter_number ?? ''],
    meter_removed: [this.data.item.meter_removed ?? null],
    meter_verified: [this.data.item.meter_verified ?? null],
    notes: [this.data.item.notes ?? ''],
    phase_type_electric: [this.data.item.phase_type_electric ?? null],
    power_kw_electric: [this.data.item.power_kw_electric ?? null],
    security_deposit: [this.data.item.security_deposit ?? 0],
    reported_consumption_year: [this.data.item.reported_consumption_year ?? 0, Validators.required],
    specifications: [this.data.item.specifications ?? ''],
    supplier_address: [this.data.item.supplier_address ?? ''],
    supply_active: [this.data.item.supply_active ?? null],
    utility_code: [this.data.item.utility_code ?? ''],
    utility_id: [{value: this.data.item.utility_id ?? '', disabled: !this.isNew}, Validators.required],
    utility_type_id_fk: [this.data.item.utility_type_id_fk ?? null, Validators.required],
    voltage_kw_electric: [this.data.item.voltage_kw_electric ?? ''],
    water_concession: [this.toDate(this.data.item.water_concession)],
    wbs_gas_element: [this.data.item.wbs_gas_element ?? ''],
  }, {validators: atLeastOneLink});

  // Collegamenti: campi cache aggiornati da refreshLinks().
  contracts: Contract[] = this.data.item.contratti ?? [];
  assetRows: Asset[] = [];
  plantRows: PlantRow[] = [];
  assetPreview: PreviewItem[] = [];
  plantPreview: PreviewItem[] = [];
  contractPreview: PreviewItem[] = [];

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly plantColumns: LinkedColumn<PlantRow>[] = [
    {label: 'Codice', value: p => p.code},
    {label: 'Nome', value: p => p.name},
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
  ];
  readonly plantIconOf = (p: PlantRow): RowIcon => ({icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)'});
  readonly plantStatusOf = (p: PlantRow): StatusInfo | null => (p.status ? plantStatus(p.status) : null);

  readonly contractColumns: LinkedColumn<Contract>[] = [
    {label: 'CIG', value: c => c.cig_contract || (c.cig_exempt ? 'Escluso da CIG' : '—')},
    {label: 'Fornitore', value: c => c.supplier?.supplier_id ?? ''},
    {label: 'Decorrenza', value: c => dateIt(c.supply_start_date)},
    {label: 'Scadenza', value: c => dateIt(c.supply_expiry_date)},
  ];
  readonly contractStatusOf = (c: Contract): StatusInfo => supplyContractStatus(c);

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.refreshLinks();
    this.loadPlants();
    this.loadAssets();
    this.utilityAggregatorService.search({deleted: false}).subscribe({
      next: data => this.aggregatorOptions = data
        .map(a => ({label: a.description ?? '', value: a.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento degli Aggregati Utenza:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => {
        this.budgetChapters = data;
        this.buildBudgetChapterOptions();
      },
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
    this.costsBorneByService.search().subscribe({
      next: data => this.costsBorneByOptions = data
        .map(c => ({label: c.name ?? '', value: c.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Costi a Carico di:', err)
    });
    this.maintenanceManagerService.search().subscribe({
      next: data => this.maintenanceOptions = data
        .map(m => ({label: m.code ?? '', value: m.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento Gestori Manutenzione:', err)
    });
    this.utilityTypeService.search().subscribe({
      next: data => this.utilityTypeOptions = data,
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });
  }

  private loadAssets(): void {
    this.assetsService.search({deleted: false}).subscribe({
      next: data => {
        this.assetOptions = data.sort((a, b) => (a.asset_name ?? '').localeCompare(b.asset_name ?? ''));
        this.assetSelectOptions = this.assetOptions.map(a => ({label: a.asset_name ?? '', value: a.id}));
        this.refreshLinks();
      },
      error: err => console.error('Errore nel caricamento dei Fabbricati:', err)
    });
  }

  private loadPlants(): void {
    this.plantService.list().subscribe({
      next: plants => {
        this.allPlants = plants.map(p => ({id: p.id, code: p.code, name: p.name, type: p.type, status: p.status}));
        this.plantSelectOptions = plants.map(p => ({
          label: `${p.code} — ${p.name}`,
          value: p.id,
          sublabel: PLANT_TYPE_LABEL[p.type],
          searchText: `${p.code} ${p.name} ${PLANT_TYPE_LABEL[p.type]}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento impianti:', err),
    });
  }

  refreshLinks(): void {
    const assetIds = (this.form.controls.asset_ids.value ?? []) as number[];
    this.assetRows = assetIds
      .map(id => this.assetOptions.find(a => a.id === id) ?? this.data.item.assets?.find(a => a.id === id))
      .filter((a): a is Asset => !!a);
    const plantIds = (this.form.controls.plant_ids.value ?? []) as number[];
    this.plantRows = plantIds
      .map(id => this.allPlants.find(p => p.id === id) ?? this.data.item.plants?.find(p => p.id === id))
      .filter((p): p is PlantRow => !!p);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
    this.plantPreview = this.plantRows.map(p => ({
      id: p.id, label: `${p.code} — ${p.name}`, sublabel: PLANT_TYPE_LABEL[p.type],
      icon: PLANT_TYPE_ICON[p.type], color: 'var(--entity-plant)', status: p.status ? plantStatus(p.status) : null,
    }));
    this.contractPreview = this.contracts
      .filter(c => supplyContractStatus(c).tone === 'ok')
      .map(c => ({
        id: c.id, label: c.cig_contract || 'CIG non specificato', sublabel: c.supplier?.supplier_id ?? undefined,
        icon: 'description', color: 'var(--entity-supply-contract)', status: supplyContractStatus(c),
      }));
  }

  // Header
  headerIcon(): string {
    return this.selectedHardType ? HardTypeMatIcon[this.selectedHardType] : 'electric_meter';
  }

  headerColor(): string {
    return this.selectedHardType ? HardTypeColor[this.selectedHardType] : 'var(--entity-utility)';
  }

  titleText(): string {
    return this.isNew ? 'Nuova utenza' : (this.form.controls.utility_id.value || 'Utenza');
  }

  subtitleText(): string {
    const type = this.utilityTypeOptions.find(t => t.id === this.form.controls.utility_type_id_fk.value)?.name;
    return [type, this.form.controls.supplier_address.value].filter(Boolean).join(' · ');
  }

  statusInfo(): StatusInfo {
    return utilityStatus(this.form.controls.supply_active.value);
  }

  flags(): StatusInfo[] {
    return utilityFlags(this.form.controls.meter_removed.value, this.form.controls.meter_verified.value);
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  linkError(): boolean {
    const c = this.form.controls;
    return this.form.hasError('noLink') && (c.asset_ids.touched || c.plant_ids.touched);
  }

  hasCurrentContract(): boolean {
    return this.contractPreview.length > 0;
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  // Collegamenti (form control → salvati con "Salva")
  private setIds(control: 'asset_ids' | 'plant_ids', ids: number[]): void {
    const c = this.form.controls[control];
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    this.setIds('asset_ids', [...((this.form.controls.asset_ids.value ?? []) as number[]), id]);
  }

  unlinkAsset(id: number): void {
    this.setIds('asset_ids', ((this.form.controls.asset_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  addPlant(id: number): void {
    this.setIds('plant_ids', [...((this.form.controls.plant_ids.value ?? []) as number[]), id]);
  }

  unlinkPlant(id: number): void {
    this.setIds('plant_ids', ((this.form.controls.plant_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.loadAssets();
    });
  }

  // L'impianto salva da sé anche i suoi collegamenti alle utenze: dopo il
  // salvataggio riallinea plant_ids, altrimenti "Salva" qui sovrascriverebbe
  // la modifica fatta nella scheda impianto.
  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (!saved) return;
      this.loadPlants();
      if (this.isNew) return;
      this.plantService.get(id).subscribe(plant => this.syncPlantLink(id, plant.utilities.some(u => u.id === this.data.item.id)));
    });
  }

  private syncPlantLink(plantId: number, linked: boolean): void {
    const ids = (this.form.controls.plant_ids.value ?? []) as number[];
    const has = ids.includes(plantId);
    if (linked === has) return;
    this.form.controls.plant_ids.setValue(linked ? [...ids, plantId] : ids.filter(x => x !== plantId));
    this.refreshLinks();
  }

  openContract(id: number): void {
    this.navigator.openSupplyContract(id).subscribe(saved => {
      if (saved) this.reloadContracts();
    });
  }

  newContract(): void {
    this.navigator.createSupplyContract([this.data.item.id]).subscribe(saved => {
      if (saved) this.reloadContracts();
    });
  }

  private reloadContracts(): void {
    this.contractsService.search({utility_id: this.data.item.id} as never).subscribe(contracts => {
      this.contracts = contracts;
      this.data.item.contratti = contracts;
      this.refreshLinks();
    });
  }

  onUtilityTypeChange(event: MatSelectChange): void {
    const selected = this.utilityTypeOptions.find(t => t.id === event.value) ?? null;
    this.selectedHardType = selected?.hard_type ?? null;
    this.buildBudgetChapterOptions();
  }

  private buildBudgetChapterOptions(): void {
    const compatible = (c: BudgetChapter) =>
      this.selectedHardType === null ||
      c.supply_type === SupplyType.SPRAR_UTILITIES ||
      CHAPTER_COMPATIBILITY[this.selectedHardType].includes(c.supply_type);
    const label = (c: BudgetChapter) => `${c.chapter_code}/${c.article ?? 0} — ${c.description ?? ''}`.trim();
    this.budgetChapterOptions = [...this.budgetChapters]
      .sort((a, b) => Number(compatible(b)) - Number(compatible(a)) || label(a).localeCompare(label(b)))
      .map(c => {
        const parts = [
          c.pdc ? `PDC ${c.pdc}` : null,
          SupplyTypeDescription[c.supply_type] ?? null,
          compatible(c) ? null : 'tipo fornitura diverso dall’utenza',
        ].filter(Boolean);
        return {
          label: label(c),
          value: c.id,
          sublabel: parts.join(' · '),
          searchText: `${label(c)} ${c.pdc ?? ''}`,
        };
      });
  }

  get consumptionUnit(): string | null {
    return this.selectedHardType ? CONSUMPTION_UNIT_BY_HARD_TYPE[this.selectedHardType] : null;
  }

  estimateHint(): string {
    switch (this.data.item.estimated_consumption_source) {
      case 'MANUAL': {
        const setAt = this.data.item.estimated_consumption_set_at;
        if (!setAt) return 'Inserita manualmente';
        const until = new Date(setAt);
        until.setMonth(until.getMonth() + 12);
        return until > new Date()
          ? `Manuale, valida fino al ${until.toLocaleDateString('it-IT')}`
          : 'Manuale scaduta: verrà sostituita dallo storico consumi';
      }
      case 'HISTORY': return 'Calcolata dallo storico consumi';
      default: return 'Metti 0 per calcolarla dallo storico consumi';
    }
  }

  navigateToMaps(lat: string | null | undefined, lon: string | null | undefined): void {
    if (lat == null || lon == null) return;
    window.open(`https://www.google.com/maps/@${lat},${lon},15z?q=${lat},${lon}`, '_blank');
  }

  resolveMapCoordsFromForm(): { lat: string; lon: string } | null {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return {lat, lon};
    // Fallback all'immobile associato: prima il GPS reale, poi la posizione
    // geocodificata dall'indirizzo (caso comune: nessun GPS inserito a mano).
    const asset = this.primaryAsset();
    const assetLat = asset?.latitude ?? asset?.geocoded_latitude;
    const assetLon = asset?.longitude ?? asset?.geocoded_longitude;
    if (isValid(assetLat) && isValid(assetLon)) return {lat: assetLat, lon: assetLon};
    return null;
  }

  isMapCoordsFromAsset(): boolean {
    const isValid = (v: string | null | undefined): v is string => v != null && v.trim() !== '';
    const lat = this.form.controls.latitude.value;
    const lon = this.form.controls.longitude.value;
    if (isValid(lat) && isValid(lon)) return false;
    const asset = this.primaryAsset();
    const assetLat = asset?.latitude ?? asset?.geocoded_latitude;
    const assetLon = asset?.longitude ?? asset?.geocoded_longitude;
    return isValid(assetLat) && isValid(assetLon);
  }

  // Primo immobile selezionato che ha una posizione (GPS reale o geocodificata).
  private primaryAsset(): Asset | undefined {
    return this.assetRows.find(a => (a.latitude ?? a.geocoded_latitude) && (a.longitude ?? a.geocoded_longitude)) ?? this.assetRows[0];
  }

  // Concessioni raggruppate per immobile collegato.
  grantsByAsset(): {assetName: string; utilizers: string[]}[] {
    return (this.data.item.assets ?? [])
      .map(a => ({
        assetName: a.asset_name,
        utilizers: (a.utilizerGrants ?? []).map(g => g.utilizer?.name ?? '').filter(n => !!n),
      }))
      .filter(g => g.utilizers.length > 0);
  }

  counterpartCount(): number {
    return this.grantsByAsset().reduce((n, g) => n + g.utilizers.length, 0) + (this.data.item.utilityType?.purposes?.length ?? 0);
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }

  // Dopo una modifica alle rilevazioni il backend ha già ricalcolato
  // effettivo/stima: allinea dati mostrati e form. La stima nel form si
  // aggiorna solo se l'utente non l'ha toccata — altrimenti "Salva"
  // rimanderebbe il vecchio valore come modificato e la marcherebbe manuale.
  onConsumptionSummary(summary: ConsumptionSummary): void {
    this.data.item.actual_consumption = summary.actual_consumption;
    this.data.item.actual_consumption_coverage_days = summary.coverage_days;
    this.data.item.estimated_consumption_source = summary.estimated_source;
    this.data.item.estimated_annual_consumption = summary.estimated_annual_consumption;
    this.data.item.estimated_consumption_set_at = summary.estimated_set_at;
    const control = this.form.controls.estimated_annual_consumption;
    if (control.pristine) {
      control.setValue(summary.estimated_annual_consumption);
      control.markAsPristine();
    }
    // Una lettura con matricola nuova aggiorna la matricola dell'utenza:
    // senza riallineare il form, "Salva" la riporterebbe a quella vecchia.
    this.data.item.meter_number = summary.meter_number ?? undefined;
    const meter = this.form.controls.meter_number;
    if (meter.pristine) {
      meter.setValue(summary.meter_number ?? '');
      meter.markAsPristine();
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const result = plainToInstance(Utility, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

Note: `Asset` deve avere `status`, `toponym`, `address`, `civic_number`, `latitude`, `geocoded_latitude` (già usati nel codice esistente). `Contract.cig_exempt`, `supplier`, `supply_start_date`, `supply_expiry_date`, `closed` esistono (verificato in `contract.entity.ts`).

- [ ] **Step 2: Rewrite `utility-edit-dialog.component.html`**

```html
<app-entity-sheet
  [icon]="headerIcon()"
  [color]="headerColor()"
  [title]="titleText()"
  [subtitle]="subtitleText()"
  [lastModified]="lastModified">
  <ng-container sheetBadges>
    <app-status-badge [info]="statusInfo()"></app-status-badge>
    @for (f of flags(); track f.label) {
      <app-status-badge [info]="f" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo"
                         [error]="invalid('utility_id', 'utility_type_id_fk', 'budget_chapter_code_fk', 'costs_borne_by_id_fk')"></app-tab-label>
        </ng-template>

        @if (linkError()) {
          <div class="sheet-alert tone-danger">Collegare almeno un immobile o un impianto (tab Immobili o Impianti).</div>
        }

        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Codice Utenza (POD/PDR) *</mat-label>
            <input matInput formControlName="utility_id">
            @if (form.controls.utility_id.invalid && form.controls.utility_id.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Numero Contatore</mat-label>
            <input matInput formControlName="meter_number">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo Uso Contatore *</mat-label>
            <mat-select formControlName="utility_type_id_fk" (selectionChange)="onUtilityTypeChange($event)">
              @for (opt of utilityTypeOptions; track opt.id) {
                <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.utility_type_id_fk.invalid && form.controls.utility_type_id_fk.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Codice Utenza o Cliente</mat-label>
            <input matInput formControlName="utility_code">
          </mat-form-field>
          <div class="span-2">
            <app-filterable-select
              label="ID Aggregato"
              placeholder="Cerca aggregato..."
              [options]="aggregatorOptions"
              formControlName="aggregator_id_fk">
            </app-filterable-select>
          </div>
          <mat-form-field class="span-2">
            <mat-label>Costi a Carico di *</mat-label>
            <mat-select formControlName="costs_borne_by_id_fk">
              @for (opt of costsBorneByOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.costs_borne_by_id_fk.invalid && form.controls.costs_borne_by_id_fk.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>
          <div class="span-all">
            <app-filterable-select
              label="Capitolo di Spesa *"
              placeholder="Cerca per codice, descrizione o PDC..."
              [options]="budgetChapterOptions"
              formControlName="budget_chapter_code_fk"
              [errorMessage]="form.controls.budget_chapter_code_fk.invalid && form.controls.budget_chapter_code_fk.touched ? 'Obbligatorio' : null">
            </app-filterable-select>
          </div>
        </div>

        <div class="sheet-section-title">
          <mat-icon>place</mat-icon>Indirizzo e posizione
          <button mat-icon-button type="button" [disabled]="!resolveMapCoordsFromForm()"
                  (click)="navigateToMaps(resolveMapCoordsFromForm()?.lat, resolveMapCoordsFromForm()?.lon)"
                  [matTooltip]="resolveMapCoordsFromForm() ? 'Apri in Google Maps' : 'Mancano le coordinate'">
            <mat-icon>open_in_new</mat-icon>
          </button>
        </div>
        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>Indirizzo Fornitura</mat-label>
            <input matInput formControlName="supplier_address">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Latitudine</mat-label>
            <input matInput formControlName="latitude">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Longitudine</mat-label>
            <input matInput formControlName="longitude">
          </mat-form-field>
        </div>
        <app-location-map
          [latitude]="resolveMapCoordsFromForm()?.lat ?? null"
          [longitude]="resolveMapCoordsFromForm()?.lon ?? null"
          [previewOnly]="isMapCoordsFromAsset()"
          (positionSelected)="onPositionSelected($event)"
          (positionCleared)="onPositionCleared()">
        </app-location-map>
        @if (isMapCoordsFromAsset()) {
          <p class="sheet-hint">Posizione dell'immobile collegato.</p>
        }

        <div class="sheet-previews">
          <app-preview-card title="Immobili" icon="apartment" color="var(--entity-asset)"
                            [items]="assetPreview" emptyText="Nessun immobile"
                            (seeAll)="goTo('Immobili')" (open)="openAsset($event.id)"></app-preview-card>
          <app-preview-card title="Impianti" icon="settings_input_component" color="var(--entity-plant)"
                            [items]="plantPreview" emptyText="Nessun impianto"
                            (seeAll)="goTo('Impianti')" (open)="openPlant($event.id)"></app-preview-card>
          @if (!isNew) {
            <app-preview-card title="Contratto corrente" icon="description" color="var(--entity-supply-contract)"
                              [items]="contractPreview" emptyText="Nessun contratto corrente"
                              (seeAll)="goTo('Contratti')" (open)="openContract($event.id)"></app-preview-card>
            <div class="sheet-stat">
              <span class="sheet-hint">Consumo effettivo 12 mesi</span>
              <span class="sheet-stat-value">{{ formatQty(data.item.actual_consumption, consumptionUnit) }}</span>
              <span class="sheet-hint">Presunto: {{ formatQty(form.controls.estimated_annual_consumption.value, consumptionUnit) }}</span>
            </div>
          }
        </div>
      </mat-tab>

      <mat-tab aria-label="Tecnici e stato">
        <ng-template mat-tab-label>
          <app-tab-label icon="tune" label="Tecnici e stato"></app-tab-label>
        </ng-template>
        <div class="sheet-section-title">Stato utenza</div>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Fornitura Attiva</mat-label>
            <mat-select formControlName="supply_active">
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Contatore Rimosso</mat-label>
            <mat-select formControlName="meter_removed">
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Contatore Verificato</mat-label>
            <mat-select formControlName="meter_verified">
              @for (opt of booleanOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Disalimentabilità utenza</mat-label>
            <input matInput formControlName="disconnection_ability">
          </mat-form-field>
        </div>

        <div class="sheet-section-title">Caratteristiche tecniche</div>
        <div class="sheet-grid">
          @if (showLightFields) {
            <mat-form-field>
              <mat-label>Potenza (kW)</mat-label>
              <input matInput type="number" step="0.01" formControlName="power_kw_electric">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Tensione (V / kV)</mat-label>
              <input matInput formControlName="voltage_kw_electric">
            </mat-form-field>
            <mat-form-field>
              <mat-label>Tipo Fase</mat-label>
              <mat-select formControlName="phase_type_electric">
                @for (opt of phaseTypeOptions; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (showGasFields) {
            <mat-form-field>
              <mat-label>Elemento WBS Gas</mat-label>
              <input matInput formControlName="wbs_gas_element">
            </mat-form-field>
          }
          @if (!showLightFields && !showGasFields) {
            <p class="sheet-empty span-all">Nessun dato tecnico specifico per questo tipo di utenza.</p>
          }
        </div>

        <div class="sheet-section-title">Gestione</div>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Fornitore Manutenzione</mat-label>
            <mat-select formControlName="maintenance_management_id_fk">
              <mat-option [value]="null">Nessuno</mat-option>
              @for (opt of maintenanceOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Concessione acqua</mat-label>
            <input matInput [matDatepicker]="waterConcessionPicker" formControlName="water_concession">
            <mat-datepicker-toggle matSuffix [for]="waterConcessionPicker"></mat-datepicker-toggle>
            <mat-datepicker #waterConcessionPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Deposito cauzionale (€)</mat-label>
            <input matInput type="number" step="0.01" min="0" formControlName="security_deposit">
          </mat-form-field>
        </div>
      </mat-tab>

      <mat-tab aria-label="Immobili">
        <ng-template mat-tab-label>
          <app-tab-label icon="apartment" label="Immobili" [count]="assetRows.length" [error]="linkError()"></app-tab-label>
        </ng-template>
        <app-linked-table
          [columns]="assetColumns"
          [rows]="assetRows"
          [rowStatus]="assetStatusOf"
          [addOptions]="canEdit ? assetSelectOptions : null"
          addLabel="Collega immobile"
          [unlinkable]="canEdit"
          emptyText="Nessun immobile collegato."
          (add)="addAsset($event)"
          (unlink)="unlinkAsset($event)"
          (open)="openAsset($event.id)">
        </app-linked-table>
      </mat-tab>

      <mat-tab aria-label="Impianti">
        <ng-template mat-tab-label>
          <app-tab-label icon="settings_input_component" label="Impianti" [count]="plantRows.length" [error]="linkError()"></app-tab-label>
        </ng-template>
        <app-linked-table
          [columns]="plantColumns"
          [rows]="plantRows"
          [rowIcon]="plantIconOf"
          [rowStatus]="plantStatusOf"
          [addOptions]="canEdit ? plantSelectOptions : null"
          addLabel="Collega impianto"
          [unlinkable]="canEdit"
          emptyText="Nessun impianto servito da questa utenza."
          (add)="addPlant($event)"
          (unlink)="unlinkPlant($event)"
          (open)="openPlant($event.id)">
        </app-linked-table>
      </mat-tab>

      <mat-tab aria-label="Contratti" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="description" label="Contratti"
                         [count]="isNew ? null : contracts.length" [tone]="hasCurrentContract() ? 'ok' : 'warn'"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-linked-table
            [columns]="contractColumns"
            [rows]="contracts"
            [rowStatus]="contractStatusOf"
            [createLabel]="canEdit ? 'Nuovo contratto' : null"
            emptyText="Nessun contratto associato."
            (create)="newContract()"
            (open)="openContract($event.id)">
          </app-linked-table>
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Consumi">
        <ng-template mat-tab-label>
          <app-tab-label icon="insights" label="Consumi"
                         [error]="invalid('estimated_annual_consumption', 'reported_consumption_year')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Consumo annuo presunto</mat-label>
            <input matInput type="number" formControlName="estimated_annual_consumption">
            <mat-hint>{{ estimateHint() }}</mat-hint>
            @if (form.controls.estimated_annual_consumption.invalid && form.controls.estimated_annual_consumption.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Consumo annuo comunicato Consip</mat-label>
            <input matInput type="number" formControlName="reported_consumption_year">
            @if (form.controls.reported_consumption_year.invalid && form.controls.reported_consumption_year.touched) {
              <mat-error>Obbligatorio</mat-error>
            }
          </mat-form-field>
          @if (!isNew) {
            <mat-form-field>
              <mat-label>Consumo effettivo (12 mesi)</mat-label>
              <input matInput disabled [value]="formatQty(data.item.actual_consumption, consumptionUnit)">
              <mat-hint>Da storico consumi · dati su {{ data.item.actual_consumption_coverage_days ?? 0 }}/365 giorni</mat-hint>
            </mat-form-field>
          }
        </div>
        @if (!isNew && selectedHardType !== HardType.INTERNET) {
          <app-utility-consumptions-tab
            [utilityId]="data.item.id"
            [meterNumber]="data.item.meter_number ?? null"
            (summaryChanged)="onConsumptionSummary($event)">
          </app-utility-consumptions-tab>
        }
      </mat-tab>

      <mat-tab aria-label="Controparti e finalità" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="groups" label="Controparti e finalità" [count]="isNew ? null : counterpartCount()"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <div class="sheet-section-title">Finalità d'uso</div>
          @if (data.item.utilityType?.purposes?.length) {
            <ul class="sheet-list">
              @for (purpose of data.item.utilityType!.purposes; track purpose.id) {
                <li>{{ purpose.name }} ({{ useTypeDescription[purpose.use_type] }})</li>
              }
            </ul>
          } @else {
            <p class="sheet-empty">Nessuna finalità d'uso associata.</p>
          }
          <div class="sheet-section-title">Controparti</div>
          @for (group of grantsByAsset(); track group.assetName) {
            <div style="font-weight: 500; margin-top: 0.25rem;">{{ group.assetName }}</div>
            <ul class="sheet-list">
              @for (name of group.utilizers; track name) {
                <li>{{ name }}</li>
              }
            </ul>
          } @empty {
            <p class="sheet-empty">Nessuna concessione trovata.</p>
          }
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Note">
        <ng-template mat-tab-label>
          <app-tab-label icon="notes" label="Note" [dot]="filled('specifications', 'notes', 'additional_notes')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field class="span-all">
            <mat-label>Specifiche</mat-label>
            <textarea matInput formControlName="specifications" rows="3"></textarea>
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Note</mat-label>
            <textarea matInput formControlName="notes" rows="3"></textarea>
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Note Aggiuntive</mat-label>
            <textarea matInput formControlName="additional_notes" rows="3"></textarea>
          </mat-form-field>
        </div>
      </mat-tab>

      <mat-tab aria-label="Foto" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="photo_library" label="Foto"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-photo-gallery [entityType]="'utility'" [entityId]="data.item.id"></app-photo-gallery>
        </ng-template>
      </mat-tab>

      <mat-tab aria-label="Storico" [disabled]="isNew">
        <ng-template mat-tab-label>
          <app-tab-label icon="history" label="Storico"></app-tab-label>
        </ng-template>
        <ng-template matTabContent>
          <app-entity-history
            [entity]="'utilities'"
            [entityId]="data.item.id"
            [lastModifiedBy]="data.item.updated_by ? data.item.updated_by.firstName + ' ' + data.item.updated_by.lastName : null"
            [lastModifiedAt]="data.item.update_date ? data.item.update_date.toString() : null">
          </app-entity-history>
        </ng-template>
      </mat-tab>
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea utenza' : 'Salva utenza' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

- [ ] **Step 3: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 4: Verifica E2E (Playwright MCP)** su `/utilities?selectedId=<utenza con 1+ immobili, 1 impianto e contratti>`:
1. Header: icona/colore del tipo (luce gialla `bolt`…), badge Attiva/Non attiva coerente; cambiando "Fornitura Attiva" il badge cambia.
2. Riepilogo: anteprime Immobili/Impianti/Contratto corrente/Consumo; click su un immobile apre la scheda immobile impilata.
3. Tab Immobili: digitare nel picker "Collega immobile", attendere 2s: il testo resta (Review Focus 2). Collegare un immobile, scollegarlo, Annulla (nessun salvataggio).
4. Scollegare tutti gli immobili e impianti → banner rosso nel Riepilogo e pallino rosso su Immobili/Impianti; Salva non chiude. Annulla.
5. Review Focus 4: da tab Impianti aprire l'impianto, nel suo tab Utenze scollegare questa utenza, Salva; tornati sull'utenza il tab Impianti non mostra più quell'impianto. Ripristinare il collegamento dall'impianto (riaprirlo, ricollegare, Salva) e chiudere l'utenza con Annulla.
6. Tab Consumi presente anche per una nuova utenza (campi stima), storico assente in creazione.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/utilities/utility-edit-dialog.component.ts frontend/src/app/pages/utilities/utility-edit-dialog.component.html
git commit -m "feat(frontend): scheda utenza con riepilogo e tab immobili/impianti/contratti navigabili

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scheda Impianto (tab per tipo)

**Files:**
- Modify (rewrite): `frontend/src/app/pages/plants/plant-edit-dialog.component.ts`
- Create: `frontend/src/app/pages/plants/plant-edit-dialog.component.html`

**Interfaces:**
- Consumes: Task 1–4; `plantTabs`, `PlantTab`, `missingCertifications`, `inspectionStatusOf`, `certificationStatus` da `plant.model.ts`; `PlantInspectionsTabComponent`, `PlantFireEquipmentTabComponent` (invariati).
- Produces: stesso contratto (`PlantEditDialogData`, risultato `boolean`).

- [ ] **Step 1: Rewrite `plant-edit-dialog.component.ts`** (template spostato in file HTML)

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {TOption} from '../../core/types/option.interface';
import {AssetService} from '../assets/asset.service';
import {Asset} from '../assets/entity/asset.entity';
import {UtilityService} from '../utilities/utility.service';
import {Utility} from '../utilities/entity/utility.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {toIsoDate} from '../utilities/consumptions/consumption.model';
import {PlantService} from './plant.service';
import {
  certificationStatus,
  inspectionStatusOf,
  missingCertifications,
  Plant,
  PLANT_STATUS_LABEL,
  PLANT_TYPE_ICON,
  PLANT_TYPE_LABEL,
  PLANT_TYPES,
  PlantElevatorData,
  PlantPayload,
  PlantStatus,
  PlantTab,
  plantTabs,
  PlantThermalData,
  PlantType,
} from './plant.model';
import {PlantInspectionsTabComponent} from './plant-inspections-tab.component';
import {PlantFireEquipmentTabComponent} from './plant-fire-equipment-tab.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {
  assetStatus,
  inspectionStatusInfo,
  plantStatus,
  positionStatusInfo,
  StatusInfo,
  utilityStatus,
} from '../../core/helpers/entity-status';
import {dateIt, hasInvalid, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

export interface PlantEditDialogData {
  // null = nuovo impianto.
  plantId: number | null;
  // Immobile precompilato (nuovo impianto dal dialog immobile).
  assetId?: number | null;
  readOnly: boolean;
}

const COUNT_FIELDS: {key: 'outdoor_units' | 'indoor_units' | 'fan_coils' | 'air_handling_units' | 'chillers_heat_pumps'; label: string}[] = [
  {key: 'outdoor_units', label: 'Unità esterne'},
  {key: 'indoor_units', label: 'Unità interne'},
  {key: 'fan_coils', label: 'Ventilconvettori'},
  {key: 'air_handling_units', label: 'Unità trattamento aria'},
  {key: 'chillers_heat_pumps', label: 'Gruppi frigo / pompe di calore'},
];

const toDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Dialog impianto: salva da sé e chiude con true se qualcosa è stato
// salvato. Dopo la creazione resta aperto in modifica, così si possono
// aggiungere subito verifiche, presidi e foto.
@Component({
  selector: 'app-plant-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatIconModule, MatTabsModule, MatDatepickerModule, MatProgressBarModule,
    LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    PlantInspectionsTabComponent, PlantFireEquipmentTabComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './plant-edit-dialog.component.html',
})
export class PlantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(PlantService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);
  private navigator = inject(EntityNavigatorService);
  protected dialogRef = inject(MatDialogRef<PlantEditDialogComponent, boolean>);
  protected data = inject<PlantEditDialogData>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly types = PLANT_TYPES;
  readonly typeLabel = PLANT_TYPE_LABEL;
  readonly typeIcon = PLANT_TYPE_ICON;
  readonly statuses = Object.keys(PLANT_STATUS_LABEL) as PlantStatus[];
  readonly statusLabel = PLANT_STATUS_LABEL;
  readonly countFields = COUNT_FIELDS;
  readonly cert = certificationStatus;
  readonly canEdit = !this.data.readOnly;

  plant: Plant | null = null;
  private allAssets: Asset[] = [];
  private allUtilities: Utility[] = [];
  assetOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  assetRows: Asset[] = [];
  utilityRows: Utility[] = [];
  assetPreview: PreviewItem[] = [];
  utilityPreview: PreviewItem[] = [];
  inspectionPreview: PreviewItem[] = [];
  loading = false;
  saving = false;
  // true se qualcosa è stato salvato (anche verifiche/presidi): la pagina ricarica.
  saved = false;
  error: string | null = null;

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? `#${u.id}`},
    {label: 'Tipo uso', value: u => u.utilityType?.name ?? ''},
    {label: 'Immobili', value: u => (u.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  form = this.fb.group({
    type: ['FOUNTAIN' as PlantType, Validators.required],
    code: ['', [Validators.required, Validators.maxLength(100)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    status: ['ACTIVE' as PlantStatus],
    asset_ids: [(this.data.assetId ? [this.data.assetId] : []) as (string | number | boolean)[]],
    toponym: [''],
    address: [''],
    civic_number: [''],
    latitude: [null as string | null],
    longitude: [null as string | null],
    notes: [''],
    utility_ids: [[] as (string | number | boolean)[]],
    thermal: this.fb.group({
      power_kw: [null as number | null, Validators.min(0)],
      generators_description: [''],
      vvf_certification: [''],
      vvf_exempt: [false],
      inail_certification: [''],
      inail_exempt: [false],
      served_area_sqm: [null as number | null, Validators.min(0)],
      water_room: [null as boolean | null],
      outdoor_units: [null as number | null, Validators.min(0)],
      indoor_units: [null as number | null, Validators.min(0)],
      fan_coils: [null as number | null, Validators.min(0)],
      air_handling_units: [null as number | null, Validators.min(0)],
      chillers_heat_pumps: [null as number | null, Validators.min(0)],
    }),
    elevator: this.fb.group({
      serial_number: [''],
      plant_number: [''],
      manufacturer: [''],
      year: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
      test_date: [null as Date | null],
      elevator_type: [''],
      drive: [''],
      capacity_kg: [null as number | null, Validators.min(0)],
      stops: [null as number | null, Validators.min(0)],
      speed: [''],
    }),
  });

  ngOnInit(): void {
    if (this.data.readOnly) this.form.disable();
    this.loadAssets();
    this.loadUtilities();
    if (this.data.plantId) this.load(this.data.plantId);
  }

  private loadAssets(): void {
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => {
        this.allAssets = assets;
        this.assetOptions = assets
          .map(a => ({label: a.asset_name ?? '', value: a.id, sublabel: a.associated_building ?? undefined,
            searchText: `${a.asset_name ?? ''} ${a.associated_building ?? ''}`}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento immobili:', err),
    });
  }

  private loadUtilities(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: utilities => {
        this.allUtilities = utilities;
        this.utilityOptions = utilities.map(u => ({
          label: u.utility_id ?? `#${u.id}`,
          value: u.id,
          sublabel: u.utilityType?.name ?? undefined,
          searchText: `${u.utility_id ?? ''} ${u.utility_code ?? ''} ${u.utilityType?.name ?? ''}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento utenze:', err),
    });
  }

  refreshLinks(): void {
    const assetIds = (this.form.controls.asset_ids.value ?? []).map(Number);
    this.assetRows = assetIds
      .map(id => this.allAssets.find(a => a.id === id) ?? (this.plant?.assets.find(a => a.id === id) as Asset | undefined))
      .filter((a): a is Asset => !!a);
    const utilityIds = (this.form.controls.utility_ids.value ?? []).map(Number);
    this.utilityRows = utilityIds
      .map(id => this.allUtilities.find(u => u.id === id))
      .filter((u): u is Utility => !!u);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
    this.utilityPreview = this.utilityRows.map(u => {
      const t = u.utilityType?.hard_type;
      return {
        id: u.id, label: u.utility_id ?? `#${u.id}`, sublabel: u.utilityType?.name ?? undefined,
        icon: t ? HardTypeMatIcon[t] : 'electric_meter', color: t ? HardTypeColor[t] : 'var(--entity-utility)',
        status: utilityStatus(u.supply_active),
      };
    });
    this.inspectionPreview = [...(this.plant?.inspections ?? [])]
      .sort((a, b) => (a.next_date ?? '9999').localeCompare(b.next_date ?? '9999'))
      .map(i => ({
        id: i.id, label: i.kind, sublabel: i.next_date ? `Prossima: ${dateIt(i.next_date)}` : 'Senza scadenza',
        icon: 'event', color: 'var(--entity-plant)', status: inspectionStatusInfo(inspectionStatusOf(i.next_date)),
      }));
  }

  // Header
  title(): string {
    if (!this.plant) return 'Nuovo impianto';
    return `${this.plant.code} — ${this.plant.name}`;
  }

  subtitle(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [PLANT_TYPE_LABEL[this.currentType()], street].filter(Boolean).join(' · ');
  }

  lastModified(): string | null {
    return this.plant ? lastModifiedLabel(this.plant.update_date, this.plant.updated_by) : null;
  }

  statusInfo(): StatusInfo {
    return plantStatus(this.form.controls.status.value as PlantStatus);
  }

  positionInfo(): StatusInfo | null {
    return this.plant ? positionStatusInfo(this.plant.position_quality) : null;
  }

  // In header solo verifiche scadute o in scadenza.
  inspectionFlag(): StatusInfo | null {
    const info = inspectionStatusInfo(this.plant?.inspection_status);
    return info && (info.tone === 'danger' || info.tone === 'warn') ? info : null;
  }

  currentType(): PlantType {
    return this.form.controls.type.value as PlantType;
  }

  hasTab(tab: PlantTab): boolean {
    return plantTabs(this.currentType()).includes(tab);
  }

  typeLocked(): boolean {
    return (this.plant?.fireEquipment?.length ?? 0) > 0;
  }

  missingCerts(): string[] {
    return this.plant ? missingCertifications(this.plant) : [];
  }

  overdueInspections(): boolean {
    return this.plant?.inspection_status === 'OVERDUE';
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  // Posizione mostrata quando l'impianto non ha coordinate proprie.
  estimated(): {lat: string; lng: string} | null {
    if (!this.plant || this.plant.position_quality === 'PRECISE') return null;
    return this.plant.position;
  }

  onPositionSelected(pos: {lat: string; lng: string}): void {
    this.form.patchValue({latitude: pos.lat, longitude: pos.lng});
    this.form.markAsDirty();
  }

  onPositionCleared(): void {
    this.form.patchValue({latitude: null, longitude: null});
    this.form.markAsDirty();
  }

  // Collegamenti (form control → salvati con "Salva")
  private setIds(control: 'asset_ids' | 'utility_ids', ids: number[]): void {
    const c = this.form.controls[control];
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    this.setIds('asset_ids', [...(this.form.controls.asset_ids.value ?? []).map(Number), id]);
  }

  unlinkAsset(id: number): void {
    this.setIds('asset_ids', (this.form.controls.asset_ids.value ?? []).map(Number).filter(x => x !== id));
  }

  addUtility(id: number): void {
    this.setIds('utility_ids', [...(this.form.controls.utility_ids.value ?? []).map(Number), id]);
  }

  unlinkUtility(id: number): void {
    this.setIds('utility_ids', (this.form.controls.utility_ids.value ?? []).map(Number).filter(x => x !== id));
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (saved) this.loadAssets();
    });
  }

  // L'utenza salva i suoi plant_ids: dopo il salvataggio riallinea
  // utility_ids, altrimenti "Salva" qui sovrascriverebbe la modifica.
  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (!saved) return;
      this.loadUtilities();
      if (this.plant) this.syncUtilityLink(id, (saved.plants ?? []).some(p => p.id === this.plant!.id));
    });
  }

  private syncUtilityLink(utilityId: number, linked: boolean): void {
    const ids = (this.form.controls.utility_ids.value ?? []).map(Number);
    const has = ids.includes(utilityId);
    if (linked === has) return;
    this.form.controls.utility_ids.setValue(linked ? [...ids, utilityId] : ids.filter(x => x !== utilityId));
    this.refreshLinks();
  }

  reloadPlant(): void {
    this.saved = true;
    if (this.plant) this.load(this.plant.id, false);
  }

  private load(id: number, patchForm = true): void {
    this.loading = true;
    this.service.get(id).subscribe({
      next: plant => {
        this.plant = plant;
        this.loading = false;
        if (patchForm) this.patch(plant);
        if (this.typeLocked()) this.form.controls.type.disable();
        this.refreshLinks();
      },
      error: err => {
        this.loading = false;
        this.error = 'Impianto non trovato.';
        console.error('Errore caricamento impianto:', err);
      },
    });
  }

  private patch(p: Plant): void {
    const t = p.thermal;
    const e = p.elevator;
    this.form.patchValue({
      type: p.type,
      code: p.code,
      name: p.name,
      status: p.status,
      asset_ids: (p.assets ?? []).map(a => a.id),
      toponym: p.toponym ?? '',
      address: p.address ?? '',
      civic_number: p.civic_number ?? '',
      latitude: p.latitude ?? null,
      longitude: p.longitude ?? null,
      notes: p.notes ?? '',
      utility_ids: (p.utilities ?? []).map(u => u.id),
      thermal: {
        power_kw: t?.power_kw !== null && t?.power_kw !== undefined ? Number(t.power_kw) : null,
        generators_description: t?.generators_description ?? '',
        vvf_certification: t?.vvf_certification ?? '',
        vvf_exempt: !!t?.vvf_exempt,
        inail_certification: t?.inail_certification ?? '',
        inail_exempt: !!t?.inail_exempt,
        served_area_sqm: t?.served_area_sqm !== null && t?.served_area_sqm !== undefined ? Number(t.served_area_sqm) : null,
        water_room: t?.water_room ?? null,
        outdoor_units: t?.outdoor_units ?? null,
        indoor_units: t?.indoor_units ?? null,
        fan_coils: t?.fan_coils ?? null,
        air_handling_units: t?.air_handling_units ?? null,
        chillers_heat_pumps: t?.chillers_heat_pumps ?? null,
      },
      elevator: {
        serial_number: e?.serial_number ?? '',
        plant_number: e?.plant_number ?? '',
        manufacturer: e?.manufacturer ?? '',
        year: e?.year ?? null,
        test_date: toDate(e?.test_date),
        elevator_type: e?.elevator_type ?? '',
        drive: e?.drive ?? '',
        capacity_kg: e?.capacity_kg ?? null,
        stops: e?.stops ?? null,
        speed: e?.speed ?? '',
      },
    });
    this.form.markAsPristine();
    this.refreshLinks();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const num = (n: number | null | undefined) => (n === null || n === undefined || `${n}` === '' ? null : Number(n));
    const type = v.type as PlantType;
    const payload: PlantPayload = {
      type,
      code: (v.code ?? '').trim(),
      name: (v.name ?? '').trim(),
      status: v.status as PlantStatus,
      asset_ids: (v.asset_ids ?? []).map(Number),
      toponym: text(v.toponym),
      address: text(v.address),
      civic_number: text(v.civic_number),
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      notes: text(v.notes),
      utility_ids: (v.utility_ids ?? []).map(Number),
    };
    // Dati specifici solo per il tipo corrente.
    if (type === 'THERMAL') {
      const t = v.thermal;
      const thermal: PlantThermalData = {
        power_kw: num(t.power_kw),
        generators_description: text(t.generators_description),
        vvf_certification: text(t.vvf_certification),
        vvf_exempt: !!t.vvf_exempt,
        inail_certification: text(t.inail_certification),
        inail_exempt: !!t.inail_exempt,
        served_area_sqm: num(t.served_area_sqm),
        water_room: t.water_room ?? null,
        outdoor_units: num(t.outdoor_units),
        indoor_units: num(t.indoor_units),
        fan_coils: num(t.fan_coils),
        air_handling_units: num(t.air_handling_units),
        chillers_heat_pumps: num(t.chillers_heat_pumps),
      };
      payload.thermal = thermal;
    }
    if (type === 'ELEVATOR') {
      const e = v.elevator;
      const elevator: PlantElevatorData = {
        serial_number: text(e.serial_number),
        plant_number: text(e.plant_number),
        manufacturer: text(e.manufacturer),
        year: num(e.year),
        test_date: e.test_date ? toIsoDate(e.test_date) : null,
        elevator_type: text(e.elevator_type),
        drive: text(e.drive),
        capacity_kg: num(e.capacity_kg),
        stops: num(e.stops),
        speed: text(e.speed),
      };
      payload.elevator = elevator;
    }
    this.saving = true;
    this.error = null;
    const request = this.plant ? this.service.update(this.plant.id, payload) : this.service.create(payload);
    const isNew = !this.plant;
    request.subscribe({
      next: plant => {
        this.saving = false;
        this.saved = true;
        if (isNew) {
          // Resta aperto in modifica: verifiche, presidi e foto richiedono l'id.
          this.plant = plant;
          this.patch(plant);
        } else {
          this.dialogRef.close(true);
        }
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        const message = err.error?.message;
        this.error = Array.isArray(message) ? message.join(' ') : (message ?? 'Errore durante il salvataggio.');
      },
    });
  }
}
```

Nota: se `Plant.update_date`/`updated_by` hanno tipi diversi da quelli accettati da `lastModifiedLabel` (`string` e `{firstName?, lastName?}` — compatibili), adattare il cast.

- [ ] **Step 2: Create `plant-edit-dialog.component.html`**

```html
<app-entity-sheet
  [icon]="typeIcon[currentType()]"
  color="var(--entity-plant)"
  [title]="title()"
  [subtitle]="subtitle()"
  [lastModified]="lastModified()">
  <ng-container sheetBadges>
    <app-status-badge [info]="statusInfo()"></app-status-badge>
    @if (positionInfo(); as pos) {
      <app-status-badge [info]="pos" size="sm"></app-status-badge>
    }
    @if (inspectionFlag(); as f) {
      <app-status-badge [info]="f" size="sm"></app-status-badge>
    }
  </ng-container>

  @if (loading) {
    <mat-progress-bar mode="indeterminate"></mat-progress-bar>
  }
  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo" [error]="invalid('type', 'code', 'name')"></app-tab-label>
        </ng-template>
        @if (missingCerts().length) {
          <div class="sheet-alert tone-warn">Certificazioni obbligatorie mancanti: {{ missingCerts().join(', ') }} (tab Dati tecnici).</div>
        }
        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>Tipo *</mat-label>
            <mat-select formControlName="type">
              <mat-select-trigger>{{ typeLabel[currentType()] }}</mat-select-trigger>
              @for (t of types; track t) {
                <mat-option [value]="t"><span><mat-icon style="vertical-align: middle; margin-right: 6px;">{{ typeIcon[t] }}</mat-icon>{{ typeLabel[t] }}</span></mat-option>
              }
            </mat-select>
            @if (typeLocked()) {
              <mat-hint>Tipo bloccato: ci sono presidi antincendio</mat-hint>
            }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Codice *</mat-label>
            <input matInput formControlName="code" placeholder="es. fon_17">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Stato</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s) {
                <mat-option [value]="s">{{ statusLabel[s] }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Nome *</mat-label>
            <input matInput formControlName="name">
          </mat-form-field>
        </div>

        <div class="sheet-section-title"><mat-icon>place</mat-icon>Indirizzo e posizione</div>
        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Toponimo</mat-label>
            <input matInput formControlName="toponym" placeholder="es. Via, Piazza">
          </mat-form-field>
          <mat-form-field class="span-2">
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
          [estimatedLatitude]="estimated()?.lat ?? null"
          [estimatedLongitude]="estimated()?.lng ?? null"
          [previewOnly]="data.readOnly"
          (positionSelected)="onPositionSelected($event)"
          (positionCleared)="onPositionCleared()">
        </app-location-map>
        @if (!form.controls.latitude.value && estimated()) {
          <p class="sheet-hint">
            {{ plant?.position_quality === 'FROM_ASSET' ? "Posizione dell'immobile collegato" : 'Posizione stimata da indirizzo (geocodifica)' }}
            — clicca sulla mappa per fissarne una propria.
          </p>
        }

        <div class="sheet-grid" style="margin-top: 12px;">
          <mat-form-field class="span-all">
            <mat-label>Note</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </div>

        <div class="sheet-previews">
          <app-preview-card title="Immobili" icon="apartment" color="var(--entity-asset)"
                            [items]="assetPreview" emptyText="Nessun immobile (es. fontana in piazza)"
                            (seeAll)="goTo('Immobili')" (open)="openAsset($event.id)"></app-preview-card>
          <app-preview-card title="Utenze" icon="electric_meter" color="var(--entity-utility)"
                            [items]="utilityPreview" emptyText="Nessuna utenza"
                            (seeAll)="goTo('Utenze')" (open)="openUtility($event.id)"></app-preview-card>
          @if (plant && hasTab('inspections')) {
            <app-preview-card title="Verifiche" icon="event" color="var(--entity-plant)"
                              [items]="inspectionPreview" emptyText="Nessuna verifica registrata"
                              (seeAll)="goTo('Verifiche')" (open)="goTo('Verifiche')"></app-preview-card>
          }
        </div>
      </mat-tab>

      @if (hasTab('technical')) {
        <mat-tab aria-label="Dati tecnici">
          <ng-template mat-tab-label>
            <app-tab-label icon="engineering" label="Dati tecnici"
                           [dot]="missingCerts().length > 0" tone="warn"></app-tab-label>
          </ng-template>
          @if (currentType() === 'THERMAL') {
            <div formGroupName="thermal">
              <div class="sheet-section-title">Centrale termica</div>
              <div class="sheet-grid">
                <mat-form-field>
                  <mat-label>Potenza totale (kW)</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="power_kw">
                  <mat-hint>Somma dei generatori</mat-hint>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Generatori</mat-label>
                  <input matInput formControlName="generators_description" placeholder="es. 160+80">
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Mq serviti</mat-label>
                  <input matInput type="number" min="0" step="0.01" formControlName="served_area_sqm">
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Locale idrico</mat-label>
                  <mat-select formControlName="water_room">
                    <mat-option [value]="null">Non indicato</mat-option>
                    <mat-option [value]="true">Sì</mat-option>
                    <mat-option [value]="false">No</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field class="span-2">
                  <mat-label>Certificazione VVF</mat-label>
                  <input matInput formControlName="vvf_certification" placeholder="es. pratica nr. ...">
                  <mat-hint>Obbligatoria oltre 116 kW</mat-hint>
                </mat-form-field>
                <mat-checkbox formControlName="vvf_exempt" style="align-self: center;">Esente VVF</mat-checkbox>
                <div></div>
                <mat-form-field class="span-2">
                  <mat-label>Certificazione INAIL</mat-label>
                  <input matInput formControlName="inail_certification" placeholder="es. pratica nr. ...">
                  <mat-hint>Obbligatoria oltre 35 kW</mat-hint>
                </mat-form-field>
                <mat-checkbox formControlName="inail_exempt" style="align-self: center;">Esente INAIL</mat-checkbox>
              </div>
              @if (plant?.obligations; as o) {
                @let vvf = cert(o.vvf_required, !!plant?.thermal?.vvf_exempt, plant?.thermal?.vvf_certification ?? null);
                @let inail = cert(o.inail_required, !!plant?.thermal?.inail_exempt, plant?.thermal?.inail_certification ?? null);
                <div style="display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.85rem; margin-top: 8px;">
                  <span>VVF: <span [style.background]="vvf.bg" [style.color]="vvf.fg" style="border-radius: 10px; padding: 1px 8px;">{{ vvf.text }}</span></span>
                  <span>INAIL: <span [style.background]="inail.bg" [style.color]="inail.fg" style="border-radius: 10px; padding: 1px 8px;">{{ inail.text }}</span></span>
                  <span>Controllo efficienza: {{ o.efficiency_check_required ? 'obbligatorio (≥ 10 kW)' : 'non richiesto' }}</span>
                </div>
              }
              <div class="sheet-section-title">Climatizzazione</div>
              <div class="sheet-grid">
                @for (f of countFields; track f.key) {
                  <mat-form-field>
                    <mat-label>{{ f.label }}</mat-label>
                    <input matInput type="number" min="0" step="1" [formControlName]="f.key">
                  </mat-form-field>
                }
              </div>
              <p class="sheet-hint">
                Obblighi indicativi calcolati dalla potenza: controllo di efficienza da 10 kW (DPR 74/2013), INAIL oltre 35 kW, VVF oltre 116 kW (DPR 151/2011).
              </p>
            </div>
          }
          @if (currentType() === 'ELEVATOR') {
            <div formGroupName="elevator" class="sheet-grid">
              <mat-form-field>
                <mat-label>Matricola</mat-label>
                <input matInput formControlName="serial_number">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Numero impianto</mat-label>
                <input matInput formControlName="plant_number">
              </mat-form-field>
              <mat-form-field class="span-2">
                <mat-label>Costruttore</mat-label>
                <input matInput formControlName="manufacturer">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Anno</mat-label>
                <input matInput type="number" min="1900" max="2100" step="1" formControlName="year">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Data collaudo</mat-label>
                <input matInput [matDatepicker]="testPicker" formControlName="test_date" placeholder="GG/MM/AAAA">
                <mat-datepicker-toggle matIconSuffix [for]="testPicker"></mat-datepicker-toggle>
                <mat-datepicker #testPicker></mat-datepicker>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Tipologia</mat-label>
                <input matInput formControlName="elevator_type" placeholder="ascensore, montacarichi, piattaforma">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Azionamento</mat-label>
                <input matInput formControlName="drive" placeholder="elettrico, oleodinamico">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Portata (kg)</mat-label>
                <input matInput type="number" min="0" step="1" formControlName="capacity_kg">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Fermate</mat-label>
                <input matInput type="number" min="0" step="1" formControlName="stops">
              </mat-form-field>
              <mat-form-field>
                <mat-label>Velocità</mat-label>
                <input matInput formControlName="speed" placeholder="es. 0,63 m/s">
              </mat-form-field>
            </div>
          }
        </mat-tab>
      }

      @if (plant && hasTab('fire_equipment')) {
        <mat-tab aria-label="Presidi">
          <ng-template mat-tab-label>
            <app-tab-label icon="fire_extinguisher" label="Presidi" [count]="plant.fireEquipment.length"></app-tab-label>
          </ng-template>
          <app-plant-fire-equipment-tab
            [plantId]="plant.id"
            [rows]="plant.fireEquipment"
            [readOnly]="data.readOnly"
            (changed)="reloadPlant()">
          </app-plant-fire-equipment-tab>
        </mat-tab>
      }

      @if (plant && hasTab('inspections')) {
        <mat-tab aria-label="Verifiche">
          <ng-template mat-tab-label>
            <app-tab-label icon="event" label="Verifiche" [count]="plant.inspections.length"
                           [tone]="overdueInspections() ? 'danger' : 'info'"></app-tab-label>
          </ng-template>
          <app-plant-inspections-tab
            [plantId]="plant.id"
            [plantType]="plant.type"
            [powerKw]="plant.thermal?.power_kw ?? null"
            [rows]="plant.inspections"
            [readOnly]="data.readOnly"
            (changed)="reloadPlant()">
          </app-plant-inspections-tab>
        </mat-tab>
      }

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
          [unlinkable]="canEdit"
          emptyText="Nessun immobile collegato (es. fontana in piazza)."
          (add)="addAsset($event)"
          (unlink)="unlinkAsset($event)"
          (open)="openAsset($event.id)">
        </app-linked-table>
      </mat-tab>

      <mat-tab aria-label="Utenze">
        <ng-template mat-tab-label>
          <app-tab-label icon="electric_meter" label="Utenze" [count]="utilityRows.length"></app-tab-label>
        </ng-template>
        <app-linked-table
          [columns]="utilityColumns"
          [rows]="utilityRows"
          [rowIcon]="utilityIconOf"
          [rowStatus]="utilityStatusOf"
          [addOptions]="canEdit ? utilityOptions : null"
          addLabel="Collega utenza"
          [unlinkable]="canEdit"
          emptyText="Nessuna utenza a servizio dell'impianto."
          (add)="addUtility($event)"
          (unlink)="unlinkUtility($event)"
          (open)="openUtility($event.id)">
        </app-linked-table>
      </mat-tab>

      @if (plant) {
        <mat-tab aria-label="Foto">
          <ng-template mat-tab-label>
            <app-tab-label icon="photo_library" label="Foto"></app-tab-label>
          </ng-template>
          <ng-template matTabContent>
            <app-photo-gallery [entityType]="'plant'" [entityId]="plant.id"></app-photo-gallery>
          </ng-template>
        </mat-tab>
        <mat-tab aria-label="Storico">
          <ng-template mat-tab-label>
            <app-tab-label icon="history" label="Storico"></app-tab-label>
          </ng-template>
          <ng-template matTabContent>
            <app-entity-history
              [entity]="'plants'"
              [entityId]="plant.id"
              [lastModifiedBy]="plant.updated_by ? (plant.updated_by.firstName ?? '') + ' ' + (plant.updated_by.lastName ?? '') : null"
              [lastModifiedAt]="plant.update_date ?? null">
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
    <button mat-stroked-button type="button" (click)="dialogRef.close(saved)">{{ data.readOnly ? 'Chiudi' : 'Annulla' }}</button>
    @if (!data.readOnly) {
      <button mat-flat-button type="button" (click)="save()" [disabled]="saving || loading">Salva</button>
    }
  </ng-container>
</app-entity-sheet>
```

- [ ] **Step 3: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 4: Verifica E2E (Playwright MCP)** su `/plants?selectedId=<id>` per tre impianti: uno THERMAL, uno FIRE_PROTECTION, uno FOUNTAIN (o altro tipo senza tab specifici):
1. Tab visibili per tipo: THERMAL → Dati tecnici + Verifiche; FIRE_PROTECTION → Presidi + Verifiche; FOUNTAIN → solo Verifiche (più Riepilogo/Immobili/Utenze/Foto/Storico). Cambiando Tipo nel form di un impianto nuovo i tab compaiono/scompaiono.
2. Tab Utenze: tabella cliccabile, click apre la scheda utenza impilata; "Collega utenza" funziona; nessuna multi-select.
3. Header: badge stato + qualità posizione (+ verifiche scadute se presenti).
4. Nuovo impianto (`/plants`, aggiungi): compilare tipo/codice/nome, Salva → resta aperto, compaiono Verifiche/Foto/Storico.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/plants/plant-edit-dialog.component.ts frontend/src/app/pages/plants/plant-edit-dialog.component.html
git commit -m "feat(frontend): scheda impianto con tab per tipo e utenze/immobili navigabili

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Scheda Contratto di fornitura

**Files:**
- Modify: `frontend/src/app/pages/contracts/contract-edit-dialog.component.ts`
- Modify (rewrite): `frontend/src/app/pages/contracts/contract-edit-dialog.component.html`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: stesso contratto del dialog (`EditDialogData<Contract> & ContractDialogExtra`, risultato `Contract | undefined`).

- [ ] **Step 1: Modify `contract-edit-dialog.component.ts`**

Sostituire import, decorator e corpo della classe con:

```ts
import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectChange, MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {Utility} from '../utilities/entity/utility.entity';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Contract} from './entity/contract.entity';
import {AuthService} from '../../services/auth.service';
import {TOption} from '../../core/types/option.interface';
import {SuppliersService} from '../suppliers/suppliers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityService} from '../utilities/utility.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {ValidityBarComponent} from '../../core/components/entity-sheet/validity-bar.component';
import {StatusInfo, supplyContractFlags, supplyContractStatus, utilityStatus} from '../../core/helpers/entity-status';
import {isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';

/** Precompila l'associazione utenze quando aperto dal dettaglio Utenza ("Nuovo contratto"). */
export interface ContractDialogExtra {
  preselectedUtilityIds?: number[];
}

// CIG obbligatorio salvo contratto escluso (stessa regola del backend).
function cigRequiredUnlessExempt(group: AbstractControl): ValidationErrors | null {
  const cig = (group.get('cig_contract')?.value ?? '').toString().trim();
  const exempt = !!group.get('cig_exempt')?.value;
  const closed = !!group.get('closed')?.value;
  return !cig && !exempt && !closed ? {cigRequired: true} : null;
}

@Component({
  selector: 'app-contract-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, MatCheckboxModule, MatTabsModule, MatIconModule, MatTooltipModule,
    FilterableSelectComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent,
    LinkedTableComponent, ValidityBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contract-edit-dialog.component.html'
})
export class ContractEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractEditDialogComponent, Contract | undefined>);
  private authService = inject(AuthService);
  private suppliersService = inject(SuppliersService);
  private consipService = inject(ConsipAgreementService);
  private utilityService = inject(UtilityService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<Contract> & ContractDialogExtra>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);

  supplierOptions: TOption[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];
  // Tutte le utenze: quelle collegate sono form.utility_ids.
  private allUtilities: Utility[] = [];
  utilityOptions: TOption[] = [];
  utilityFilter = '';
  // Campi cache (vedi LinkedTableComponent): aggiornati solo su evento.
  linkedRows: Utility[] = [];
  filteredRows: Utility[] = [];
  utilityPreview: PreviewItem[] = [];

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id},
    {label: 'Tipo', value: u => u.utilityType?.name ?? ''},
    {label: 'Matricola', value: u => u.meter_number ?? ''},
    {label: 'Immobili', value: u => this.assetNames(u)},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    cig_contract: [this.data.item.cig_contract ?? ''],
    cig_exempt: [this.data.item.cig_exempt ?? false],
    closed: [this.data.item.closed ?? false],
    order_number: [this.data.item.order_number ?? ''],
    consip_order: [this.data.item.consip_order ?? ''],
    consip_agreement_id: [this.data.item.consip_agreement_id ?? null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    utility_ids: [
      this.data.item.utilities?.map(u => u.id) ?? this.data.preselectedUtilityIds ?? []
    ],
  }, {validators: cigRequiredUnlessExempt});

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.consipService.search({deleted: false}).subscribe({
      next: data => this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
    this.loadUtilities();
  }

  private loadUtilities(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: data => {
        this.allUtilities = data.sort((a, b) => a.utility_id.localeCompare(b.utility_id));
        this.utilityOptions = this.allUtilities.map(u => ({
          label: u.utility_id,
          value: u.id,
          sublabel: [u.utilityType?.name, u.meter_number ? `matr. ${u.meter_number}` : null, this.assetNames(u)]
            .filter(Boolean).join(' · '),
          searchText: `${u.utility_id} ${u.meter_number ?? ''} ${this.assetNames(u)}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore nel caricamento delle utenze:', err)
    });
  }

  private get linkedIds(): number[] {
    return this.form.controls.utility_ids.value ?? [];
  }

  refreshLinks(): void {
    const ids = new Set(this.linkedIds);
    this.linkedRows = this.allUtilities.filter(u => ids.has(u.id));
    this.utilityPreview = this.linkedRows.map(u => {
      const t = u.utilityType?.hard_type;
      return {
        id: u.id, label: u.utility_id, sublabel: [u.utilityType?.name, this.assetNames(u)].filter(Boolean).join(' · '),
        icon: t ? HardTypeMatIcon[t] : 'electric_meter', color: t ? HardTypeColor[t] : 'var(--entity-utility)',
        status: utilityStatus(u.supply_active),
      };
    });
    this.applyFilter();
  }

  applyFilter(): void {
    const term = this.utilityFilter.trim().toLowerCase();
    this.filteredRows = !term ? this.linkedRows : this.linkedRows
      .filter(u => [u.utility_id, u.meter_number, u.utilityType?.name, this.assetNames(u)]
        .some(v => (v ?? '').toLowerCase().includes(term)));
  }

  assetNames(u: Utility): string {
    return (u.assets ?? []).map(a => a.asset_name).join(', ');
  }

  // Header
  titleText(): string {
    if (this.isNew) return 'Nuovo contratto di fornitura';
    return this.form.controls.cig_contract.value || 'CIG non specificato';
  }

  supplierName(): string {
    const id = this.form.controls.supplier_id_fk.value;
    return this.supplierOptions.find(o => o.value === id)?.label ?? this.data.item.supplier?.supplier_id ?? '';
  }

  statusInfo(): StatusInfo {
    return supplyContractStatus(this.form.getRawValue());
  }

  flags(): StatusInfo[] {
    return supplyContractFlags(this.form.getRawValue());
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  onConsipAgreementChange(event: MatSelectChange): void {
    const selectedAgreementId: number | null = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    }
  }

  // Con il filtro attivo il picker esclude solo le righe visibili: un'utenza
  // già collegata ma nascosta dal filtro potrebbe essere riproposta.
  addUtility(id: number): void {
    if (this.linkedIds.includes(id)) return;
    this.form.controls.utility_ids.setValue([...this.linkedIds, id]);
    this.form.markAsDirty();
    this.refreshLinks();
  }

  removeUtility(id: number): void {
    this.form.controls.utility_ids.setValue(this.linkedIds.filter(x => x !== id));
    this.form.markAsDirty();
    this.refreshLinks();
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.loadUtilities();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const result = plainToInstance(Contract, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
```

- [ ] **Step 2: Rewrite `contract-edit-dialog.component.html`**

```html
<app-entity-sheet
  icon="description"
  color="var(--entity-supply-contract)"
  [title]="titleText()"
  [subtitle]="supplierName()"
  [lastModified]="lastModified">
  <ng-container sheetBadges>
    <app-status-badge [info]="statusInfo()"></app-status-badge>
    @for (f of flags(); track f.label) {
      <app-status-badge [info]="f" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo" [error]="form.hasError('cigRequired') && form.touched"></app-tab-label>
        </ng-template>

        @if (form.hasError('cigRequired')) {
          <div class="sheet-alert tone-danger">
            Contratto senza CIG: senza CIG il contratto è considerato inesistente. Inserisci il CIG oppure marca il contratto come escluso.
          </div>
        }

        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>CIG{{ form.controls.cig_exempt.value ? '' : ' *' }}</mat-label>
            <input matInput formControlName="cig_contract">
          </mat-form-field>
          <mat-checkbox formControlName="cig_exempt" style="align-self: center;">Escluso da CIG (es. in house)</mat-checkbox>
          <mat-checkbox formControlName="closed" style="align-self: center;"
                        matTooltip="Chiuso/scaduto: non è mai il contratto corrente delle utenze, anche senza date">Contratto chiuso</mat-checkbox>
          <div class="span-2">
            <app-filterable-select label="Fornitore" placeholder="Cerca fornitore..." [options]="supplierOptions" formControlName="supplier_id_fk"></app-filterable-select>
          </div>
          <mat-form-field class="span-2">
            <mat-label>Numero Ordine</mat-label>
            <input matInput formControlName="order_number">
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Convenzione CONSIP</mat-label>
            <mat-select formControlName="consip_agreement_id" (selectionChange)="onConsipAgreementChange($event)">
              <mat-option [value]="null">Nessuna</mat-option>
              @for (opt of consipAgreementOptions; track opt.id) {
                <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Ordine CONSIP</mat-label>
            <input matInput formControlName="consip_order">
          </mat-form-field>
        </div>

        <div class="sheet-section-title"><mat-icon>date_range</mat-icon>Durata</div>
        <app-validity-bar [start]="form.controls.supply_start_date.value" [end]="form.controls.supply_expiry_date.value"></app-validity-bar>
        <div class="sheet-grid" style="margin-top: 12px;">
          <mat-form-field>
            <mat-label>Decorrenza Fornitura</mat-label>
            <input matInput [matDatepicker]="startPicker" formControlName="supply_start_date">
            <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Scadenza Fornitura</mat-label>
            <input matInput [matDatepicker]="expiryPicker" formControlName="supply_expiry_date">
            <mat-datepicker-toggle matIconSuffix [for]="expiryPicker"></mat-datepicker-toggle>
            <mat-datepicker #expiryPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Scadenza Gestione</mat-label>
            <input matInput [matDatepicker]="managementPicker" formControlName="management_expiry_date">
            <mat-datepicker-toggle matIconSuffix [for]="managementPicker"></mat-datepicker-toggle>
            <mat-datepicker #managementPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Data Voltura/Cessazione</mat-label>
            <input matInput [matDatepicker]="takeoverPicker" formControlName="takeover_termination_date">
            <mat-datepicker-toggle matIconSuffix [for]="takeoverPicker"></mat-datepicker-toggle>
            <mat-datepicker #takeoverPicker></mat-datepicker>
          </mat-form-field>
        </div>

        <div class="sheet-previews">
          <app-preview-card title="Utenze" icon="electric_meter" color="var(--entity-utility)"
                            [items]="utilityPreview" emptyText="Nessuna utenza collegata"
                            (seeAll)="goTo('Utenze')" (open)="openUtility($event.id)"></app-preview-card>
        </div>
      </mat-tab>

      <mat-tab aria-label="Utenze">
        <ng-template mat-tab-label>
          <app-tab-label icon="electric_meter" label="Utenze" [count]="linkedRows.length"></app-tab-label>
        </ng-template>
        <mat-form-field subscriptSizing="dynamic" style="width: 100%;">
          <mat-label>Filtra utenze collegate</mat-label>
          <input matInput [(ngModel)]="utilityFilter" [ngModelOptions]="{standalone: true}" (ngModelChange)="applyFilter()"
                 placeholder="Codice, matricola, tipo, immobile">
        </mat-form-field>
        <app-linked-table
          [columns]="utilityColumns"
          [rows]="filteredRows"
          [rowIcon]="utilityIconOf"
          [rowStatus]="utilityStatusOf"
          [addOptions]="canEdit ? utilityOptions : null"
          addLabel="Collega utenza"
          [unlinkable]="canEdit"
          emptyText="Nessuna utenza collegata."
          (add)="addUtility($event)"
          (unlink)="removeUtility($event)"
          (open)="openUtility($event.id)">
        </app-linked-table>
      </mat-tab>
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea contratto' : 'Salva contratto' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

- [ ] **Step 3: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 4: Verifica E2E (Playwright MCP)** su `/contracts?selectedId=<id con utenze>`:
1. Header: CIG, fornitore, badge In corso/Scaduto/Chiuso coerente con le date; spuntando "Contratto chiuso" diventa Chiuso; svuotando il CIG compare "Senza CIG".
2. Barra validità con percentuale coerente.
3. Tab Utenze: filtro testo riduce le righe; click su una riga apre la scheda utenza impilata; collega/scollega senza salvare (Annulla).
4. Dal dashboard anomalie "contratti senza CIG" (`/contracts?selectedId=...`) la scheda si apre correttamente.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/contracts/contract-edit-dialog.component.ts frontend/src/app/pages/contracts/contract-edit-dialog.component.html
git commit -m "feat(frontend): scheda contratto di fornitura con barra validità e utenze navigabili

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Scheda Contratto immobiliare

**Files:**
- Modify: `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts`
- Modify (rewrite): `frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: stesso contratto del dialog.

- [ ] **Step 1: Modify `utilizer-grant-edit-dialog.component.ts`**

1. Import: aggiungere

```ts
import {QueryList, ViewChild, ViewChildren} from '@angular/core';
import {MatTab, MatTabGroup} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Asset} from '../assets/entity/asset.entity';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {ValidityBarComponent} from '../../core/components/entity-sheet/validity-bar.component';
import {assetStatus, grantFlags, grantStatus, StatusInfo} from '../../core/helpers/entity-status';
import {hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
```

(unire `QueryList, ViewChild, ViewChildren` all'import esistente da `@angular/core`, `MatTab, MatTabGroup` a quello di `@angular/material/tabs` se presente come `MatTabsModule`).

2. Nel decorator, `imports`: rimuovere `ReadOnlyDirective`, `MultiSelectComponent`; aggiungere `MatTooltipModule, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, LinkedTableComponent, ValidityBarComponent`. Rimuovere i relativi import TS non più usati.

3. Campi nuovi nella classe (dopo `protected data = ...`):

```ts
  private navigator = inject(EntityNavigatorService);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.item.update_date, this.item.updated_by);

  private allAssets: Asset[] = [];
  assetRows: Asset[] = [];
  childRows: UtilizerGrant[] = (this.item.children ?? []).filter(c => !c.deleted);

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly childColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: '#', value: c => String(c.id)},
    {label: 'Controparte', value: c => c.utilizer?.name ?? ''},
    {label: 'Tipo', value: c => this.kindText(c)},
  ];
  readonly childStatusOf = (c: UtilizerGrant): StatusInfo => grantStatus(c.computed_status ?? c.status);
```

(`authService` è già iniettato prima: verificare che i campi `canEdit`/`lastModified` siano dichiarati **dopo** `private authService = inject(AuthService)` e dopo `readonly item = this.data.item`.)

4. Nel constructor sostituire il controllo ruolo con `if (!this.canEdit) { this.form.disable(); }`.

5. In `ngOnInit` sostituire il blocco `this.assetService.search(...)` con:

```ts
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.allAssets = data;
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshAssets();
      },
      error: (err) => console.error('Errore nel caricamento degli immobili:', err),
    });
```

e chiamare `this.refreshAssets();` anche come prima riga di `ngOnInit`.

6. Metodi nuovi:

```ts
  refreshAssets(): void {
    const ids = (this.form.controls.asset_ids.value ?? []) as number[];
    this.assetRows = ids
      .map(id => this.allAssets.find(a => a.id === id) ?? this.item.assets?.find(a => a.id === id))
      .filter((a): a is Asset => !!a);
  }

  private setAssetIds(ids: number[]): void {
    const c = this.form.controls.asset_ids;
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshAssets();
  }

  addAsset(id: number): void {
    const ids = (this.form.controls.asset_ids.value ?? []) as number[];
    if (!ids.includes(id)) this.setAssetIds([...ids, id]);
  }

  unlinkAsset(id: number): void {
    this.setAssetIds(((this.form.controls.asset_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe();
  }

  openGrant(id: number | null | undefined): void {
    if (id) this.navigator.openGrant(id).subscribe();
  }

  // Header
  titleText(): string {
    if (this.isNew) return 'Nuovo contratto immobiliare';
    const utilizer = this.utilizerOptions.find(o => o.value === this.form.controls.utilizer_id_fk.value)?.label ?? this.item.utilizer?.name;
    const kind = this.form.controls.kind.value ? KIND_LABEL[this.form.controls.kind.value as ContractKind] : '';
    return [utilizer, kind].filter(Boolean).join(' — ') || `Contratto immobiliare #${this.item.id}`;
  }

  headerIcon(): string {
    return this.form.controls.direction.value === 'PASSIVE' ? 'call_made' : 'call_received';
  }

  // Badge: stato calcolato dal server, salvo nuovo contratto o stato appena
  // cambiato nel form (allora si mostra quello dichiarato).
  statusInfo(): StatusInfo {
    const declared = this.form.controls.status.value as ContractStatus;
    if (this.isNew || this.form.controls.status.dirty || !this.item.computed_status) return grantStatus(declared);
    return grantStatus(this.item.computed_status);
  }

  flags(): StatusInfo[] {
    return this.isNew ? [] : grantFlags(this.form.controls.status.value as ContractStatus, this.item.computed_status);
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  linkedCount(): number {
    return this.childRows.length + (this.form.controls.parent_contract_id.value ? 1 : 0);
  }
```

7. In `save()` sostituire `if (!this.form.valid) return;` con:

```ts
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
```

- [ ] **Step 2: Rewrite `utilizer-grant-edit-dialog.component.html`**

```html
<app-entity-sheet
  [icon]="headerIcon()"
  color="var(--entity-grant)"
  [title]="titleText()"
  [subtitle]="form.controls.subject.value"
  [lastModified]="lastModified">
  <ng-container sheetBadges>
    <app-status-badge [info]="statusInfo()"></app-status-badge>
    @for (f of flags(); track f.label) {
      <app-status-badge [info]="f" size="sm"></app-status-badge>
    }
  </ng-container>

  <form [formGroup]="form">
    <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms">

      <mat-tab aria-label="Riepilogo">
        <ng-template mat-tab-label>
          <app-tab-label icon="dashboard" label="Riepilogo"
                         [error]="invalid('direction', 'kind', 'status', 'utilizer_id_fk', 'rent_amount', 'renewal_months', 'notice_months')"></app-tab-label>
        </ng-template>

        <div class="sheet-grid">
          <mat-form-field>
            <mat-label>Direzione *</mat-label>
            <mat-select formControlName="direction">
              @for (o of directionOptions; track o.value) {
                <mat-option [value]="o.value">{{ o.label }}</mat-option>
              }
            </mat-select>
            <mat-hint>Entrata: il Comune incassa</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo *</mat-label>
            <mat-select formControlName="kind">
              @for (o of kindOptions; track o.value) {
                <mat-option [value]="o.value">{{ o.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Stato *</mat-label>
            <mat-select formControlName="status">
              @for (o of statusOptions; track o.value) {
                <mat-option [value]="o.value">{{ o.label }}</mat-option>
              }
            </mat-select>
            @if (!isNew && item.computed_status) {
              <mat-hint>Ora: {{ computedStatusText() }}</mat-hint>
            }
          </mat-form-field>
          <div></div>
          <div class="span-all">
            <app-filterable-select
              label="Controparte *"
              placeholder="Cerca controparte..."
              [options]="utilizerOptions"
              formControlName="utilizer_id_fk"
              [errorMessage]="form.controls.utilizer_id_fk.invalid && form.controls.utilizer_id_fk.touched ? 'Obbligatorio' : null">
            </app-filterable-select>
          </div>
          <mat-form-field class="span-2">
            <mat-label>Oggetto / destinazione d'uso</mat-label>
            <input matInput formControlName="subject">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Settore</mat-label>
            <input matInput formControlName="department" placeholder="es. LLPP">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Tipo utilizzo</mat-label>
            <input matInput formControlName="usage_type">
          </mat-form-field>
          <mat-form-field class="span-all">
            <mat-label>Atto (delibera / determina / repertorio)</mat-label>
            <textarea matInput formControlName="concession_act" rows="2"></textarea>
          </mat-form-field>
        </div>

        <div class="sheet-section-title"><mat-icon>euro</mat-icon>Canone e durata</div>
        <app-validity-bar [start]="form.controls.start_date.value" [end]="item.effective_end_date ?? form.controls.end_date.value"></app-validity-bar>
        <div class="sheet-grid" style="margin-top: 12px;">
          <mat-form-field>
            <mat-label>Canone (€)</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="rent_amount">
            <mat-hint>{{ annualPreview() }}</mat-hint>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Periodicità</mat-label>
            <mat-select formControlName="rent_period">
              <mat-option [value]="null">—</mat-option>
              @for (o of periodOptions; track o.value) {
                <mat-option [value]="o.value">{{ o.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-checkbox formControlName="vat_applicable" style="align-self: center;">Soggetto a IVA</mat-checkbox>
          <div></div>
          <mat-form-field>
            <mat-label>Decorrenza</mat-label>
            <input matInput [matDatepicker]="startPicker" formControlName="start_date" placeholder="GG/MM/AAAA">
            <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Scadenza</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="end_date" placeholder="GG/MM/AAAA">
            <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
            <mat-datepicker #endPicker></mat-datepicker>
          </mat-form-field>
          <mat-checkbox formControlName="tacit_renewal" style="align-self: center;">Rinnovo tacito</mat-checkbox>
          <div></div>
          @if (form.controls.tacit_renewal.value) {
            <mat-form-field>
              <mat-label>Durata rinnovo (mesi) *</mat-label>
              <input matInput type="number" min="1" step="1" formControlName="renewal_months">
              <mat-hint>es. 48 per un 4+4</mat-hint>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Preavviso disdetta (mesi) *</mat-label>
              <input matInput type="number" min="0" step="1" formControlName="notice_months">
            </mat-form-field>
          }
        </div>
        @if (!isNew && (item.effective_end_date || item.notice_deadline)) {
          <p style="margin: 8px 0 0; color: #374151;">
            Scadenza effettiva: <strong>{{ dateIt(item.effective_end_date) || '—' }}</strong>
            @if (item.notice_deadline) {
              · Disdetta entro: <strong>{{ dateIt(item.notice_deadline) }}</strong>
            }
          </p>
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
          [unlinkable]="canEdit"
          emptyText="Nessun immobile collegato."
          (add)="addAsset($event)"
          (unlink)="unlinkAsset($event)"
          (open)="openAsset($event.id)">
        </app-linked-table>
      </mat-tab>

      <mat-tab aria-label="Contratti collegati">
        <ng-template mat-tab-label>
          <app-tab-label icon="account_tree" label="Contratti collegati" [count]="linkedCount()"></app-tab-label>
        </ng-template>
        <div class="sheet-section-title">Contratto padre</div>
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <div style="flex: 1 1 auto;">
            <app-filterable-select
              label="Contratto padre"
              placeholder="Cerca contratto..."
              [options]="parentOptions"
              formControlName="parent_contract_id">
            </app-filterable-select>
          </div>
          <button mat-icon-button type="button" style="margin-top: 8px;" [disabled]="!form.controls.parent_contract_id.value"
                  (click)="openGrant(form.controls.parent_contract_id.value)" matTooltip="Apri il contratto padre">
            <mat-icon>open_in_new</mat-icon>
          </button>
        </div>
        <p class="sheet-hint">
          Il contratto padre collega, per esempio, un'assegnazione di alloggio alla concessione
          all'Azienda Speciale o alla locazione passiva da cui deriva.
        </p>
        <div class="sheet-section-title">Contratti figli</div>
        <app-linked-table
          [columns]="childColumns"
          [rows]="childRows"
          [rowStatus]="childStatusOf"
          emptyText="Nessun contratto figlio."
          (open)="openGrant($event.id)">
        </app-linked-table>
      </mat-tab>

      <mat-tab aria-label="Dati amministrativi">
        <ng-template mat-tab-label>
          <app-tab-label icon="gavel" label="Dati amministrativi"
                         [dot]="filled('registration_ref', 'cadastral_ref', 'area_sqm', 'notes')"
                         [error]="invalid('area_sqm')"></app-tab-label>
        </ng-template>
        <div class="sheet-grid">
          <mat-form-field class="span-2">
            <mat-label>Registrazione / repertorio</mat-label>
            <input matInput formControlName="registration_ref">
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>Dati catastali</mat-label>
            <input matInput formControlName="cadastral_ref" placeholder="es. Fg. 7 – Part. 54 – Sub 21">
          </mat-form-field>
          <mat-form-field>
            <mat-label>Superficie (mq)</mat-label>
            <input matInput type="number" min="0" step="0.01" formControlName="area_sqm">
          </mat-form-field>
          <mat-checkbox formControlName="utilities_to_be_taken_over" style="align-self: center;">Utenze da volturare</mat-checkbox>
          <mat-form-field class="span-all">
            <mat-label>Note</mat-label>
            <textarea matInput formControlName="notes" rows="3"></textarea>
          </mat-form-field>
        </div>
      </mat-tab>

      @if (!isNew) {
        <mat-tab aria-label="Storico">
          <ng-template mat-tab-label>
            <app-tab-label icon="history" label="Storico"></app-tab-label>
          </ng-template>
          <ng-template matTabContent>
            <app-entity-history
              [entity]="'utilizer_grant'"
              [entityId]="item.id"
              [lastModifiedBy]="item.updated_by ? item.updated_by.firstName + ' ' + item.updated_by.lastName : null"
              [lastModifiedAt]="item.update_date ? item.update_date.toString() : null">
            </app-entity-history>
          </ng-template>
        </mat-tab>
      }
    </mat-tab-group>
  </form>

  <ng-container sheetActions>
    <button mat-stroked-button type="button" (click)="cancel()">{{ canEdit ? 'Annulla' : 'Chiudi' }}</button>
    @if (canEdit) {
      <button mat-flat-button type="button" (click)="save()">{{ isNew ? 'Crea contratto' : 'Salva contratto' }}</button>
    }
  </ng-container>
</app-entity-sheet>
```

Nota: `dateIt` del template esistente è `formatDateIt` (`readonly dateIt = formatDateIt;` già nella classe) — lasciarlo. `ContractKind`, `ContractStatus`, `KIND_LABEL` sono già importati nel file.

- [ ] **Step 3: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK.

- [ ] **Step 4: Verifica E2E (Playwright MCP)** su `/utilizer-grant?selectedId=<id con figli e immobili>`:
1. Header: "controparte — tipo", icona direzione, badge stato calcolato; cambiando Stato nel form il badge mostra quello dichiarato; flag "Stato dichiarato" quando divergono.
2. Barra validità sulla scadenza effettiva.
3. Tab Immobili: tabella cliccabile, collega/scollega.
4. Tab Contratti collegati: apertura padre (icona) e figli (riga) in scheda impilata.
5. Lettore non ancora testato qui (Task 12).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.ts frontend/src/app/pages/utilizer-grant/utilizer-grant-edit-dialog.component.html
git commit -m "feat(frontend): scheda contratto immobiliare con canone, immobili e contratti collegati

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Pulizia residui

**Files:**
- Modify: file che importano ancora simboli rimossi (individuati via grep).
- Modify: `frontend/src/app/core/components/abstract-data-table.component.ts:14-23` (commento `EDIT_DIALOG_POSITION`).

- [ ] **Step 1: Grep dei residui**

Run (uno alla volta):
- `grep -rn "EDIT_DIALOG_POSITION" frontend/src --include=*.ts`
- `grep -rn "ReadOnlyDirective\|MultiSelectComponent" frontend/src/app/pages/assets frontend/src/app/pages/utilities frontend/src/app/pages/plants frontend/src/app/pages/contracts frontend/src/app/pages/utilizer-grant --include=*.ts`
- `grep -rn "width: '1000px'\|width: '900px'" frontend/src/app --include=*.ts`

Expected: `EDIT_DIALOG_POSITION` usato solo da `abstract-data-table.component.ts` (anagrafiche semplici) — aggiornare il commento sopra la costante aggiungendo: "Le schede entità usano invece sheetDialogConfig (altezza fissa, entity-sheet/sheet-utils.ts)." Nessun `ReadOnlyDirective`/`MultiSelectComponent` nei 5 dialog riscritti (se `MultiSelectComponent` è ancora usato altrove, ad es. nei filtri, va lasciato). Nessuna larghezza 900/1000 residua nei punti di apertura delle schede.

- [ ] **Step 2: Build**

Run: `docker exec utenzepa-frontend-1 pnpm run build`
Expected: OK, nessun warning "unused import" nuovo nei file toccati.

- [ ] **Step 3: Commit** (solo se ci sono modifiche)

```bash
git add frontend/src/app/core/components/abstract-data-table.component.ts
git commit -m "chore(frontend): pulizia residui dei vecchi dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verifica trasversale E2E (Lettore, pile profonde, layout)

**Files:** nessuno (solo verifica + pulizia DB di test).

- [ ] **Step 1: Utente Lettore temporaneo** — creare `e2e_sheet_reader` (`role='Lettore'`) come da CLAUDE.md, login su `http://localhost:4300`.

- [ ] **Step 2: Review Focus 1 (Lettore)** — per ognuna delle 5 schede: i tab si cambiano; righe di tabelle e anteprime aprono la scheda collegata; nessun pulsante Collega/Scollega/Nuovo/Salva; il pulsante in basso dice "Chiudi"; i campi sono disabilitati.

- [ ] **Step 3: Review Focus 5 (pila profonda)** — come Admin: immobile → utenza (anteprima) → impianto (tab Impianti) → immobile (tab Immobili) → utenza → impianto (6 livelli). Con `browser_evaluate`:

```js
[...document.querySelectorAll('.entity-sheet-panel')].map(p => {
  const r = p.getBoundingClientRect();
  return {top: Math.round(r.top), height: Math.round(r.height)};
})
```

Expected: top crescente di ~2vh per livello fino al 6° (5° offset), poi costante; altezze decrescenti fino a 80vh. Chiudere a ritroso con Annulla: ogni livello torna visibile e intatto.

- [ ] **Step 4: Layout a larghezza ridotta** — `browser_resize` a 800×900: griglie su una/due colonne, nessuno scroll orizzontale della pagina, header leggibile ("Ultima modifica" nascosto sotto 700px).

- [ ] **Step 5: Pulizia DB** — eliminare `e2e_sheet` e `e2e_sheet_reader` come da CLAUDE.md: prima `DELETE FROM audit_logs WHERE user_id IN (...)`, riassegnare a `created_by_user_id=1`/`updated_by_user_id=1` eventuali righe create/modificate durante i test, poi `DELETE FROM system_users WHERE username IN ('e2e_sheet','e2e_sheet_reader')`. Query su una riga (memoria utente).

- [ ] **Step 6: Nessun commit** (solo verifica). Se una verifica fallisce: correggere nel task del dialog interessato con un commit `fix(frontend): ...`.

---

### Task 13: Documentazione e PR

**Files:**
- Modify: `CLAUDE.md` (sezione Frontend)

- [ ] **Step 1: Nota in `CLAUDE.md`** (sezione "### Frontend", in fondo all'elenco):

```markdown
- Schede entità (immobile, utenza, impianto, contratto fornitura, contratto immobiliare): shell condivisa in `core/components/entity-sheet/` (header fisso con badge stato da `core/helpers/entity-status.ts`, tab con `app-tab-label`, collegamenti con `app-linked-table`, anteprime `app-preview-card`). Aprirle sempre con `openSheet()`/`sheetDialogConfig()` (altezza fissa, top ancorato, offset per livello di pila) o con `EntityNavigatorService` (carica il record completo e persiste alla chiusura) — mai `dialog.open` con width/position a mano. Tab nuovi: `aria-label` = testo dell'etichetta (serve a `selectTab`). Righe/opzioni passate a `app-linked-table` devono essere campi cache, non getter. Tab per tipo d'impianto in `PLANT_TYPE_TABS` (`plant.model.ts`).
```

- [ ] **Step 2: Commit** — `CLAUDE.md` contiene anche le note della sessione v1.7.0 non ancora committate (route `?selectedId`, curl sandbox, migration rinominate, impianti termici): includerle nello stesso commit.

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md, schede entità e note v1.7.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/schede-entita
gh pr create --title "feat(frontend): schede entità con riepilogo e tab per categoria" --body "<riassunto: spec, componenti condivisi, 5 schede, verifiche E2E eseguite>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: CI** — `gh pr checks <N> --watch`. Expected: `backend` e `frontend` verdi.

---

## Seguiti aperti (dopo v1.7.1)

Emersi dalla revisione finale del branch, non bloccanti. Da fare in un giro dedicato.

- [ ] **Immobile → tab Impianti:** ripristinare la colonna "Posizione" (badge qualità posizione) che aveva il vecchio `AssetPlantsTabComponent`.
- [ ] **Immobile → Riepilogo:** l'anteprima Utenze elenca le singole utenze; la spec chiede il conteggio per tipo con icona (es. ⚡ Luce 4, 💧 Acqua 1).
- [ ] **Liste del padre non aggiornate dopo il salvataggio di una scheda figlia:**
  - contratto immobiliare: `openAsset`/`openGrant` non ricaricano `assetRows`, `childRows`, `parentOptions`;
  - tabella utenze: `navigateToAsset` non ricarica la tabella;
  - immobile: la colonna "Utenze" del tab Impianti non si aggiorna dopo il salvataggio di un'utenza.
- [ ] **Errori di salvataggio via `EntityNavigatorService`:** oggi `fail()` scrive solo in console e la scheda si chiude perdendo le modifiche. Mostrare un toast (`ToastService`) come fa il percorso da tabella.
- [ ] **Contratto di fornitura con decorrenza futura:** il badge dice "In corso" (stessa regola di `Contract.isCurrent`), la barra di validità "Non ancora iniziato". Valutare un badge info "Non ancora iniziato".
- [ ] **Titolo scheda impianto:** usa `this.plant` invece del form, non segue le modifiche a codice/nome (immobile e utenza invece le seguono).
- [ ] **Permesso di modifica:** la scheda impianto lo ricava da `readOnly` del navigatore (tutti tranne Lettore), le altre da `isEditorRole` (Admin/Operatore). Oggi coincidono, ma vanno unificate.
- [ ] **Layering:** `core/components/entity-sheet/sheet-utils.ts` e `core/helpers/entity-status.ts` importano `todayIso`/`toIsoDate` da `pages/`. Spostarli in un helper di `core/`.
- [ ] **Riallineamento oltre il figlio diretto:** con catene di 2+ livelli (impianto → immobile → utenza), il Salva della scheda in fondo può ripristinare collegamenti cambiati più in alto. Oggi si riallinea solo il figlio diretto (`syncPlantLink`/`syncUtilityLink`).
- [ ] **Verifica E2E** delle correzioni dell'ultimo commit (gruppi dati per tipo dell'impianto, rinnovo del contratto immobiliare, mappa in sola lettura per Lettore): verificate solo con compilazione e CI.
