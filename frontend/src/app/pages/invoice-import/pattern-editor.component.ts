import {ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {Subject, Subscription, debounceTime, switchMap, of, catchError} from 'rxjs';
import {AuthService} from '../../services/auth.service';
import {ToastService} from '../../core/services/toast.service';
import {isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {SdiDocumentDialogComponent} from '../invoices/sdi-document-dialog.component';
import {InvoicePatternsService} from './invoice-patterns.service';
import {HEADER_DEFAULTS, TARGET_LABELS} from './target-fields';
import {
  CatalogField,
  HEADER_TARGETS,
  isHeaderTarget,
  LINE_TARGETS,
  PatternCheck,
  PatternEditorData,
  PatternPreview,
  PatternRules,
  PDF_LABEL,
  PDF_PATH,
  Rule,
  ruleFieldKey,
  TargetField,
  WordKind,
  isWordRule,
} from './pattern-rules.model';

interface FieldOption {
  value: string;
  label: string;
  sample: string | null;
  committente: boolean;
  header: boolean;
}

const PREVIEW_DEBOUNCE_MS = 400;
// La P.IVA identifica il fornitore: non si mappa.
const EDITABLE_HEADER = HEADER_TARGETS.filter(t => t !== 'supplierVat');
// Regole «parola» (consumo e matricola dentro un testo: Causale, descrizione, PDF allegato).
// Consumo: numero dopo la parola (kWh 542) o prima (594 mc); matricola: parola dopo (Contatore 000283767);
// consumo stimato: «di cui stimati» maggiore di zero o la parola presente («Stimata»).
const WORD_MODES: Partial<Record<TargetField, {kind: WordKind; label: string}[]>> = {
  consumption: [
    {kind: 'numberAfter', label: 'Numero dopo la parola'},
    {kind: 'numberBefore', label: 'Numero prima della parola'},
  ],
  meter: [{kind: 'textAfter', label: 'Testo dopo la parola'}],
  estimated: [
    {kind: 'contains', label: 'Presente la parola'},
    {kind: 'numberAfter', label: 'Numero dopo la parola maggiore di zero'},
  ],
};
// Campi che si leggono solo cercando una parola.
const WORD_ONLY: TargetField[] = ['estimated'];
const PDF_KEY = `header|${PDF_PATH}|`;

// Campo del catalogo ricostruito da una regola salvata (chiave = scope|path|condizione).
function missingField(key: string, rule: Rule & {path: string}): CatalogField {
  const [scope] = key.split('|') as [CatalogField['scope']];
  const where = 'where' in rule ? rule.where : undefined;
  const label =
    rule.path === PDF_PATH
      ? PDF_LABEL
      : rule.path.split('/').join(' › ') + (where ? ` [${where.path.split('/').pop()}=${where.equals}]` : '');
  return {key, scope, label, path: rule.path, ...(where ? {where} : {}), sample: null};
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Editor dei pattern: per ogni campo di UtenzePA il campo XML da cui leggerlo,
// con anteprima (senza scritture) sulla fattura e su quelle della stessa struttura.
@Component({
  selector: 'app-pattern-editor',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pattern-editor.component.html',
  styles: [`
    :host { display: block; padding: 1rem; }
    .pe-bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .pe-bar h2 { margin: 0; font-size: 1.15rem; }
    .pe-bar .spacer { flex: 1; }
    .pe-holds { color: var(--app-muted); }
    .pe-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 1100px) { .pe-grid { grid-template-columns: minmax(0, 1fr); } }
    .pe-form h3 { margin: 1rem 0 0.5rem; font-size: 1rem; }
    .pe-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 14rem); gap: 0.5rem; align-items: start;
      padding: 0.25rem 0.5rem; border-radius: 6px; }
    .pe-row.focused { background: var(--tone-info-bg); }
    .pe-row mat-form-field { width: 100%; }
    .pe-word { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: -0.75rem; margin-bottom: 0.5rem; }
    .pe-word mat-form-field { width: 10rem; }
    .pe-checks { display: flex; flex-direction: column; gap: 4px; padding-top: 0.75rem; }
    .pe-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; line-height: 1.4; }
    .tone-ok { background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
    .tone-warn { background: var(--tone-warn-bg); color: var(--tone-warn-fg); }
    .tone-danger { background: var(--tone-danger-bg); color: var(--tone-danger-fg); }
    .tone-off { background: var(--tone-off-bg); color: var(--tone-off-fg); }
    .pe-opt-sample { color: var(--app-muted); font-size: 0.8rem; }
    .pe-xml { position: sticky; top: 0.5rem; }
    .pe-xml pre { max-height: 75vh; overflow: auto; white-space: pre-wrap; word-break: break-all; font-size: 0.75rem;
      margin: 0; padding: 0.75rem; border: 1px solid var(--app-border); border-radius: 6px; background: var(--app-surface); }
    .pe-xml-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;
      margin-bottom: 0.5rem; }
    /* Contenuto in innerHTML: fuori dall'incapsulamento degli stili. */
    .pe-xml pre ::ng-deep mark.pe-anchor { background: var(--tone-info-bg); color: inherit; }
    .pe-lines { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.5rem; }
    .pe-lines th, .pe-lines td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--app-border); }
    .pe-lines td.num { text-align: right; }
    .pe-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 1rem; }
    .pe-actions mat-form-field { width: 22rem; max-width: 100%; }
    .center { display: flex; justify-content: center; padding: 2rem; }
    .pe-error { color: var(--app-error); }
  `],
})
export class PatternEditorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(InvoicePatternsService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);

  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  readonly headerTargets = EDITABLE_HEADER;
  readonly lineTargets = LINE_TARGETS;
  readonly labels: Record<string, string> = TARGET_LABELS;

  data: PatternEditorData | null = null;
  loading = true;
  loadError: string | null = null;
  saving = false;

  // Regole in forma di form: scelta per campo ('' = predefinito/non mappato,
  // 'none', 'gross', 'f:<chiave del catalogo>'), più lettura «parola» (tipo,
  // parola cercata, ancora da cui parte la ricerca).
  choice: Record<string, string> = {};
  wordMode: Record<string, WordKind | ''> = {};
  words: Record<string, string> = {};
  anchors: Record<string, string> = {};
  // Pannello di destra: XML o testo del PDF allegato.
  view: 'xml' | 'pdf' = 'xml';
  pdfHtml = '';
  consumptionFilter = '';
  name = '';
  patternId: number | null = null;

  options: Record<string, FieldOption[]> = {};
  checks: Record<string, PatternCheck[]> = {};
  preview: PatternPreview | null = null;
  previewing = false;
  xmlHtml = '';
  focused: TargetField | null = null;
  similar: number[] = [];
  index = 0;
  holds = 0;
  seen = 0;

  // Campi dei messaggi visti: le regole restano valide passando da una fattura all'altra.
  private fields = new Map<string, CatalogField>();
  private previews = new Map<number, PatternPreview>();
  private previewRequests = new Subject<void>();
  private subs = new Subscription();
  private firstLoad = true;

  ngOnInit(): void {
    this.subs.add(
      this.previewRequests
        .pipe(
          debounceTime(PREVIEW_DEBOUNCE_MS),
          switchMap(() => {
            if (!this.data) return of(null);
            const id = this.data.message.id;
            this.previewing = true;
            return this.service.preview(id, this.rules()).pipe(
              catchError(() => of(null)),
              switchMap(p => of({id, p})),
            );
          }),
        )
        .subscribe(r => {
          this.previewing = false;
          if (!r?.p) return;
          this.previews.set(r.id, r.p);
          if (r.id === this.data?.message.id) this.applyPreview(r.p);
          this.updateHolds();
        }),
    );
    this.subs.add(this.route.paramMap.subscribe(params => this.load(Number(params.get('messageId')))));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private load(messageId: number): void {
    this.loading = true;
    this.loadError = null;
    this.service.editor(messageId).subscribe({
      next: data => {
        this.data = data;
        data.catalog.forEach(f => this.fields.set(f.key, f));
        this.similar = data.similar;
        this.index = Math.max(0, data.similar.indexOf(data.message.id));
        this.buildOptions(data);
        this.loading = false;
        if (this.firstLoad) {
          this.firstLoad = false;
          this.initRules(data);
        } else {
          this.refreshXml();
          this.requestPreview(false);
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Fattura non disponibile.';
      },
    });
  }

  // Pattern esistente (da query param o dal messaggio già estratto), altrimenti nome proposto.
  private initRules(data: PatternEditorData): void {
    const fromQuery = Number(this.route.snapshot.queryParamMap.get('pattern')) || null;
    const id = fromQuery ?? data.message.pattern_id;
    if (id) {
      this.service.get(id).subscribe({
        next: pattern => {
          this.patternId = pattern.id;
          this.name = pattern.name;
          if (pattern.rules) this.loadRules(pattern.rules);
          this.refreshXml();
          this.requestPreview(true);
        },
        error: () => this.toast.add({severity: 'error', summary: 'Pattern non trovato', detail: ''}),
      });
      return;
    }
    this.service.list().subscribe(rows => {
      const n = rows.filter(r => r.supplier_id === data.message.supplier_id).length + 1;
      if (!this.name) this.name = `${data.message.supplier} struttura ${n}`;
    });
    this.refreshXml();
  }

  private buildOptions(data: PatternEditorData): void {
    const byKey = new Map(data.catalog.map(f => [f.key, f]));
    for (const t of [...EDITABLE_HEADER, ...LINE_TARGETS]) {
      this.options[t] = (data.ranked[t] ?? [])
        .map(key => byKey.get(key))
        .filter((f): f is CatalogField => !!f)
        .map(f => ({
          value: `f:${f.key}`,
          label: f.label,
          sample: f.sample,
          committente: f.path.includes('CessionarioCommittente'),
          header: f.scope === 'header' && !isHeaderTarget(t) && f.path !== PDF_PATH,
        }));
      // Regola su un campo che questa fattura non ha: resta selezionata, non si perde al salvataggio.
      const chosen = this.choice[t] ?? '';
      const missing = chosen.startsWith('f:') ? this.fields.get(chosen.slice(2)) : undefined;
      if (missing && !this.options[t].some(o => o.value === chosen)) {
        this.options[t].push({
          value: chosen,
          label: `${missing.label} (non presente in questa fattura)`,
          sample: null,
          committente: false,
          header: missing.scope === 'header' && !isHeaderTarget(t) && missing.path !== PDF_PATH,
        });
      }
    }
  }

  private loadRules(rules: PatternRules): void {
    const all: [TargetField, Rule | undefined][] = [
      ...EDITABLE_HEADER.map(t => [t, rules.header[t as keyof PatternRules['header']]] as [TargetField, Rule | undefined]),
      ...LINE_TARGETS.map(t => [t, rules.line[t]] as [TargetField, Rule | undefined]),
    ];
    for (const [t, rule] of all) {
      if (!rule) continue;
      if (rule.kind === 'none') this.choice[t] = 'none';
      else if (rule.kind === 'grossAmount') this.choice[t] = 'gross';
      else {
        const key = ruleFieldKey(t, rule)!;
        this.choice[t] = `f:${key}`;
        if (!this.fields.has(key)) this.fields.set(key, missingField(key, rule));
        if (isWordRule(rule)) {
          this.wordMode[t] = rule.kind;
          this.words[t] = rule.word;
          this.anchors[t] = rule.anchor ?? '';
        }
      }
    }
    this.consumptionFilter = rules.consumptionLineFilter ?? '';
    if (this.data) this.buildOptions(this.data);
  }

  rules(): PatternRules {
    const rules: PatternRules = {header: {}, line: {}};
    for (const t of [...EDITABLE_HEADER, ...LINE_TARGETS]) {
      const rule = this.ruleFor(t);
      if (!rule) continue;
      if (isHeaderTarget(t)) rules.header[t as keyof PatternRules['header']] = rule;
      else rules.line[t] = rule;
    }
    if (this.consumptionFilter.trim()) rules.consumptionLineFilter = this.consumptionFilter.trim();
    return rules;
  }

  private ruleFor(t: TargetField): Rule | null {
    const c = this.choice[t] ?? '';
    if (!c) return null;
    if (c === 'none') return {kind: 'none'};
    if (c === 'gross') return {kind: 'grossAmount'};
    const field = this.fields.get(c.slice(2));
    if (!field) return null;
    const fromHeader = !isHeaderTarget(t) && field.scope === 'header';
    const kind = this.wordMode[t];
    if (kind && this.words[t]?.trim()) {
      const anchor = this.anchors[t]?.trim();
      return {
        kind,
        path: field.path,
        word: this.words[t].trim(),
        ...(fromHeader ? {fromHeader: true} : {}),
        ...(anchor ? {anchor} : {}),
      };
    }
    // Dal PDF (e la stima) solo con la parola: senza, il campo resta non mappato.
    if (field.path === PDF_PATH || WORD_ONLY.includes(t)) return null;
    const where = field.where ? {where: field.where} : {};
    return fromHeader ? {kind: 'fromHeader', path: field.path, ...where} : {kind: 'field', path: field.path, ...where};
  }

  defaultLabel(t: TargetField): string {
    if (t === 'amount') return 'Predefinito: imponibile × IVA';
    return HEADER_DEFAULTS.includes(t) ? 'Tracciato standard' : 'Non mappato';
  }

  wordModes(t: TargetField): {kind: WordKind; label: string}[] {
    return WORD_MODES[t] ?? [];
  }

  canWord(t: TargetField): boolean {
    return !!WORD_MODES[t] && (this.choice[t] ?? '').startsWith('f:');
  }

  fromPdf(t: TargetField): boolean {
    return this.choice[t] === `f:${PDF_KEY}`;
  }

  // Il testo del PDF e il consumo stimato si leggono solo cercando una parola.
  wordOnly(t: TargetField): boolean {
    return this.fromPdf(t) || WORD_ONLY.includes(t);
  }

  focus(t: TargetField): void {
    this.focused = t;
    if (this.fromPdf(t) && this.data?.pdf_text) this.view = 'pdf';
    this.refreshXml();
  }

  changed(t: TargetField): void {
    if (!this.canWord(t)) this.wordMode[t] = '';
    else if (this.wordOnly(t) && !this.wordMode[t]) this.wordMode[t] = this.wordModes(t)[0].kind;
    this.focus(t);
    this.requestPreview(true);
  }

  // Cambio di regola: le anteprime delle altre fatture non valgono più.
  requestPreview(rulesChanged: boolean): void {
    if (rulesChanged) {
      this.previews.clear();
      this.updateHolds();
    }
    const cached = this.data ? this.previews.get(this.data.message.id) : undefined;
    if (cached) {
      this.applyPreview(cached);
      return;
    }
    this.previewRequests.next();
  }

  private applyPreview(p: PatternPreview): void {
    this.preview = p;
    this.checks = {};
    for (const c of p.checks) (this.checks[c.field] ??= []).push(c);
  }

  private updateHolds(): void {
    const all = [...this.previews.values()];
    this.seen = all.length;
    this.holds = all.filter(p => p.matches && !p.match?.issues.some(i => i.type === 'UNKNOWN_UTILITY')).length;
  }

  // XML senza il PDF allegato (base64), col valore del campo in focus evidenziato;
  // nel testo del PDF parola e ancora del campo in focus.
  private refreshXml(): void {
    if (!this.data) return;
    this.refreshPdf();
    let html = escapeHtml(this.data.xml.replace(/(<(?:\w+:)?Attachment>)[\s\S]*?(<\/(?:\w+:)?Attachment>)/g, '$1[PDF allegato]$2'));
    const c = this.focused ? (this.choice[this.focused] ?? '') : '';
    const sample = c.startsWith('f:') ? this.data.catalog.find(f => f.key === c.slice(2))?.sample : null;
    if (sample) {
      const text = `&gt;${escapeHtml(sample)}&lt;`;
      html = html.split(text).join(`&gt;<mark>${escapeHtml(sample)}</mark>&lt;`);
      setTimeout(() => document.querySelector('.pe-xml pre mark')?.scrollIntoView({block: 'center', behavior: 'smooth'}));
    }
    this.xmlHtml = html;
  }

  private refreshPdf(): void {
    const text = this.data?.pdf_text;
    if (!text) {
      this.pdfHtml = '';
      if (this.view === 'pdf') this.view = 'xml';
      return;
    }
    const t = this.focused;
    const marks = [
      {word: t && this.fromPdf(t) ? this.anchors[t]?.trim() : '', cls: 'pe-anchor'},
      {word: t && this.fromPdf(t) ? this.words[t]?.trim() : '', cls: ''},
    ].filter(m => m.word);
    let html = escapeHtml(text);
    for (const m of marks) {
      const re = new RegExp(escapeRegExp(escapeHtml(m.word)), 'gi');
      html = html.replace(re, s => `<mark${m.cls ? ` class="${m.cls}"` : ''}>${s}</mark>`);
    }
    this.pdfHtml = html;
    if (marks.length && this.view === 'pdf') {
      setTimeout(() => document.querySelector('.pe-xml pre mark')?.scrollIntoView({block: 'center', behavior: 'smooth'}));
    }
  }

  setView(view: 'xml' | 'pdf'): void {
    this.view = view;
  }

  go(step: number): void {
    const next = this.similar[this.index + step];
    if (next === undefined) return;
    this.router.navigate(['/invoice-import/editor', next], {queryParamsHandling: 'preserve'});
  }

  openPdf(): void {
    if (!this.data) return;
    this.dialog.open(SdiDocumentDialogComponent, {
      data: {type: 'pdf', title: `PDF · ${this.data.message.file_name}`, source: this.service.pdf(this.data.message.id)},
      width: '900px',
      maxWidth: '95vw',
    });
  }

  save(): void {
    if (!this.data) return;
    const missing = (['utility', 'amount'] as TargetField[]).filter(t => !this.ruleFor(t) || this.choice[t] === 'none');
    if (missing.length) {
      this.toast.add({severity: 'warn', summary: 'Pattern incompleto', detail: 'Indica almeno utenza e importo della riga.'});
      return;
    }
    if (!this.name.trim()) {
      this.toast.add({severity: 'warn', summary: 'Pattern incompleto', detail: 'Indica il nome del pattern.'});
      return;
    }
    const id = this.data.message.id;
    const request = this.patternId
      ? this.service.update(this.patternId, id, this.name.trim(), this.rules())
      : this.service.create(id, this.name.trim(), this.rules());
    this.saving = true;
    request.subscribe({
      next: r => {
        this.saving = false;
        this.toast.add({
          severity: 'success',
          summary: 'Pattern salvato',
          detail: r.reprocessing ? `${r.reprocessing} fatture in rielaborazione.` : '',
        });
        this.back();
      },
      error: err => {
        this.saving = false;
        this.toast.add({severity: 'error', summary: 'Pattern non salvato', detail: err?.error?.message ?? ''});
      },
    });
  }

  ignore(): void {
    if (!this.data) return;
    const id = this.data.message.id;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Ignorare questa struttura?',
          message: `Le fatture di ${this.data.message.supplier} con questa struttura non verranno importate. Si può annullare eliminando la struttura ignorata dall'elenco dei pattern.`,
          confirmLabel: 'Ignora',
        },
      })
      .afterClosed()
      .subscribe(ok => {
        if (!ok) return;
        this.service.ignore(id, this.name.trim() || `${this.data!.message.supplier} ignorata`).subscribe({
          next: () => {
            this.toast.add({severity: 'success', summary: 'Struttura ignorata', detail: ''});
            this.back();
          },
          error: err => this.toast.add({severity: 'error', summary: 'Operazione non riuscita', detail: err?.error?.message ?? ''}),
        });
      });
  }

  back(): void {
    this.router.navigate(['/invoice-import'], {queryParams: {tab: 'pattern'}});
  }

  eur(n: number | null): string {
    return n === null ? '—' : n.toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
}
