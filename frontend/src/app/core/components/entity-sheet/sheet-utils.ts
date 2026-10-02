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
