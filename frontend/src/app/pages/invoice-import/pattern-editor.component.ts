import {ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit} from '@angular/core';
import {NgTemplateOutlet} from '@angular/common';
import {ActivatedRoute, Router} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {MatMenuModule} from '@angular/material/menu';
import {Subject, Subscription, debounceTime, switchMap, of, catchError, from, concatMap, finalize, map} from 'rxjs';
import {AuthService} from '../../services/auth.service';
import {ToastService} from '../../core/services/toast.service';
import {isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {ConfirmDialogComponent} from '../../core/components/confirm-dialog.component';
import {SdiDocumentDialogComponent} from '../invoices/sdi-document-dialog.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {TOption} from '../../core/types/option.interface';
import {InvoicePatternsService} from './invoice-patterns.service';
import {HEADER_DEFAULTS, TARGET_LABELS} from './target-fields';
import {
  BAND_TARGETS,
  CatalogField,
  ExtractedLine,
  HEADER_TARGETS,
  isHeaderTarget,
  LINE_TARGETS,
  PatternCheck,
  PatternEditorData,
  PatternAnalysis,
  PatternPreview,
  WordOccurrence,
  PatternRules,
  PDF_LABEL,
  PDF_PATH,
  Rule,
  ruleFieldKey,
  TargetField,
  WordKind,
  isWordRule,
  documentTypeLabel,
  type ReadingTable,
} from './pattern-rules.model';

interface FieldOption {
  value: string;
  label: string;
  sample: string | null;
  committente: boolean;
  header: boolean;
}

const PREVIEW_DEBOUNCE_MS = 400;
// La P.IVA identifica il fornitore e il tipo documento sceglie fatture o note di
// credito: si leggono sempre dal tracciato, non si mappano.
const EDITABLE_HEADER = HEADER_TARGETS.filter(t => t !== 'supplierVat' && t !== 'documentType');
// Regole «parola»: un dato dentro un testo (Causale, descrizione, PDF allegato), tra
// «Dopo il testo» e «Prima del testo» (basta uno dei due). Numero o testo secondo il
// campo; date gg/mm/aaaa convertite. Con tutti e due: il primo testo fa da ancora,
// il valore è quello subito prima del secondo (es. dopo «CONSUMO», prima di «kWh»).
const WORD_TARGETS: TargetField[] = [
  'supplierName', 'total', 'amount', 'netAmount', 'consumption', ...BAND_TARGETS, 'number', 'date', 'cig', 'contractRef',
  'utility', 'periodStart', 'periodEnd', 'unit', 'meter', 'estimated',
];
const NUMBER_TARGETS: TargetField[] = ['total', 'netAmount', 'amount', 'consumption', ...BAND_TARGETS];
const tableKey = (t: ReadingTable) => `${t.layout}|${t.label.toLowerCase()}|${t.occurrence ?? 1}`;
// Consumo stimato: «di cui stimati» maggiore di zero o la parola presente («Stimata»).
const ESTIMATED_MODES: {kind: WordKind; label: string}[] = [
  {kind: 'contains', label: 'Presente la parola'},
  {kind: 'numberAfter', label: 'Numero dopo la parola maggiore di zero'},
];
// Campi che si leggono solo cercando una parola.
const WORD_ONLY: TargetField[] = ['estimated'];
const PDF_KEY = `header|${PDF_PATH}|`;
// Etichette delle fasce nei PDF, dalla più precisa: la prima presente fa da «Dopo il testo».
const BAND_LABELS = ['Fascia oraria F', 'Fascia F'];
// Fatture per chiamata di analisi (limite del backend).
const ANALYZE_CHUNK = 25;
// Fatture analizzate per variante di struttura (le più recenti).
const ANALYZE_PER_VARIANT = 50;

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
    FilterableSelectComponent,
    MatButtonModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './pattern-editor.component.html',
  styles: [`
    :host { display: block; padding: 1rem; }
    .pe-bar { display: flex; align-items: center; gap: 0.5rem; margin: -1rem -1rem 1rem; padding: 0.5rem 1rem; height: 3.5rem;
      box-sizing: border-box; position: sticky; top: 0; z-index: 5; background: var(--app-bg); border-bottom: 1px solid var(--app-border); }
    .pe-bar h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pe-bar > span, .pe-bar button { flex: 0 0 auto; white-space: nowrap; }
    .pe-bar h2 { margin: 0; font-size: 1.15rem; }
    .pe-bar .spacer { flex: 1; }
    .pe-bar .pe-invoice { flex: 0 0 11rem; --mat-form-field-container-height: 36px;
      --mat-form-field-container-vertical-padding: 6px; }
    .pe-bar h2 { flex: 1 1 auto; min-width: 8rem; }
    .pe-missing { font-size: 0.8em; min-height: 0; line-height: 1.6; padding: 0 8px; }
    .pe-reading-select { display: block; }
    .pe-reading-table { border-collapse: collapse; margin: 0.5rem 0; font-size: 0.85rem; }
    .pe-reading-table th, .pe-reading-table td { padding: 0.2rem 0.75rem 0.2rem 0; text-align: left; white-space: nowrap; }
    .pe-reading-table th { color: var(--app-muted); font-weight: 500; }
    .pe-reading-table .incomplete { opacity: 0.5; }
    .pe-dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; margin-right: 0.3rem; background: var(--tone-ok-fg); }
    .pe-dot.estimated { background: var(--tone-warn-fg); }
    .pe-section-hint { margin: -0.5rem 0 0.75rem; font-size: 0.85em; color: var(--app-muted); }
    .pe-bar .pe-variant { flex: 0 0 11rem; --mat-form-field-container-height: 36px;
      --mat-form-field-container-vertical-padding: 6px; }
    .pe-holds { color: var(--app-muted); }
    .pe-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    @media (max-width: 1100px) { .pe-grid { grid-template-columns: minmax(0, 1fr); } }
    .pe-form h3 { margin: 1rem 0 0.5rem; font-size: 1rem; }
    .pe-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 14rem); gap: 0.5rem; align-items: start;
      padding: 0.25rem 0.5rem; border-radius: 6px; }
    .pe-row.focused { background: var(--tone-info-bg); }
    .pe-row mat-form-field { width: 100%; }
    .pe-word { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin: 0.5rem 0; }
    .pe-word mat-form-field { flex: 1 1 10rem; min-width: 0; }
    .pe-select { display: flex; align-items: center; gap: 0.25rem; }
    .pe-select app-filterable-select { flex: 1 1 auto; min-width: 0; }
    /* Spazio della forbice su ogni riga: i campi restano tutti della stessa larghezza. */
    .pe-word-open { flex: none; width: 40px; height: 40px; padding: 8px; color: var(--app-muted); }
    .pe-word-hint { flex-basis: 100%; font-size: 0.75rem; color: var(--app-muted); }
    .pe-occ { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem; font-size: 0.8rem; max-height: 12rem;
      overflow: auto; }
    .pe-occ-title { color: var(--app-muted); }
    .pe-occ button { flex: 0 0 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; border: 1px solid var(--app-border); border-radius: 6px; padding: 0.25rem 0.5rem;
      background: transparent; color: inherit; cursor: pointer; font: inherit; }
    .pe-occ button.pe-occ-on { border-color: var(--tone-info-fg); background: var(--tone-info-bg); }
    .pe-occ button:disabled { cursor: default; }
    .pe-occ-value { font-weight: 600; white-space: nowrap; }
    .pe-occ-summary { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-bottom: 0.5rem; min-width: 0; }
    .pe-occ-summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .pe-checks { display: flex; flex-direction: column; gap: 4px; padding-top: 0.75rem; }
    .pe-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; line-height: 1.4; }
    .tone-ok { background: var(--tone-ok-bg); color: var(--tone-ok-fg); }
    .tone-warn { background: var(--tone-warn-bg); color: var(--tone-warn-fg); }
    .tone-danger { background: var(--tone-danger-bg); color: var(--tone-danger-fg); }
    .tone-off { background: var(--tone-off-bg); color: var(--tone-off-fg); }
    .pe-opt-sample { color: var(--app-muted); font-size: 0.8rem; }
    .pe-xml { position: sticky; top: 4rem; }
    .pe-xml pre { position: relative; max-height: 75vh; overflow: auto; white-space: pre-wrap; word-break: break-all; font-size: 0.75rem;
      margin: 0; padding: 0.75rem; border: 1px solid var(--app-border); border-radius: 6px; background: var(--app-surface); }
    .pe-xml-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;
      margin-bottom: 0.5rem; }
    /* Contenuto in innerHTML: fuori dall'incapsulamento degli stili. */
    .pe-xml pre ::ng-deep mark.pe-chosen { outline: 2px solid var(--tone-info-fg); }
    .pe-xml pre ::ng-deep mark.pe-anchor { background: var(--tone-info-bg); color: inherit; }
    .pe-lines { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.5rem; }
    .pe-lines th, .pe-lines td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--app-border); }
    .pe-lines .num { text-align: right; white-space: nowrap; }
    .pe-lines .nowrap { white-space: nowrap; }
    .pe-lines .pe-desc { overflow-wrap: anywhere; }
    .pe-bands { font-size: 0.8em; color: var(--app-muted); white-space: nowrap; }
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
  readonly typeLabel = documentTypeLabel;
  readonly lineTargets = LINE_TARGETS;
  // Sezione Consumi dell'editor: consumo, fasce, unità, matricola e stima; il resto in Righe.
  readonly consumptionTargets: TargetField[] = ['consumption', ...BAND_TARGETS, 'unit', 'meter', 'estimated'];
  readonly rowTargets: TargetField[] = LINE_TARGETS.filter(t => !this.consumptionTargets.includes(t));
  readonly bandTargets: TargetField[] = BAND_TARGETS;
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
  // Testo prima e dopo il valore cercato (regole «parola», tranne la stima).
  after: Record<string, string> = {};
  before: Record<string, string> = {};
  // Ancora di una regola «dopo la parola» salvata prima dei due campi: si conserva.
  private legacyAnchor: Record<string, string> = {};
  words: Record<string, string> = {};
  anchors: Record<string, string> = {};
  // Quale volta della parola usare quando compare più volte (null = la prima utile).
  occurrences: Record<string, number | null> = {};
  // Occorrenza scelta dall'elenco (anche «la prima utile»): l'elenco si chiude.
  occPicked: Record<string, boolean> = {};
  // Pannello di destra: XML o testo del PDF allegato.
  view: 'xml' | 'pdf' = 'xml';
  pdfHtml = '';
  consumptionFilter = '';
  // Nello storico: consumo del periodo (totale o per fasce F1, F2, F3) oppure letture a data.
  consumptionMode: 'total' | 'bands' | 'readings' = 'total';
  // Tabella delle letture scelta (modo «Letture del contatore») e voci del selettore:
  // le tabelle trovate nel PDF, più quella del pattern se in questa fattura manca.
  readingTable: ReadingTable | null = null;
  readingOptions: {key: string; label: string; table: ReadingTable}[] = [];
  name = '';
  patternId: number | null = null;

  options: Record<string, FieldOption[]> = {};
  // Voci della select con ricerca (campo cache: predefinito, «non presente» e campi del catalogo).
  selectOptions: Record<string, TOption[]> = {};
  checks: Record<string, PatternCheck[]> = {};
  preview: PatternPreview | null = null;
  previewing = false;
  xmlHtml = '';
  focused: TargetField | null = null;
  similar: number[] = [];
  index = 0;
  // Varianti di struttura delle simili: lo sfoglia resta dentro quella scelta.
  variants: {start: number; count: number}[] = [];
  variant = 0;
  analyzeIds: number[] = [];
  // Selettore della fattura da aprire: tutte le simili, cercabili per numero.
  invoiceOptions: TOption[] = [];
  private numberOf = new Map<number, string | null>();
  // Esito dell'analisi per variante (stesso indice di variants).
  variantStats: {analyzed: number; unavailable: number; matches: number}[] = [];
  holds = 0;
  seen = 0;
  // Analisi sulle fatture simili: parte col pulsante, poi si ripete a ogni cambio di regola.
  analysis: (PatternAnalysis & {total: number}) | null = null;
  analyzing = false;
  private analysisWanted = false;
  private analysisRuns = new Subject<void>();

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
    this.subs.add(
      this.analysisRuns
        .pipe(
          debounceTime(PREVIEW_DEBOUNCE_MS),
          switchMap(() => {
            if (!this.data) return of(null);
            const id = this.data.message.id;
            const rules = this.rules();
            // Gruppi dentro una sola variante, prima quella aperta: esito anche per variante.
            const chunks: {k: number; ids: number[]}[] = [];
            const order = [this.variant, ...this.variants.map((_, k) => k).filter(k => k !== this.variant)];
            for (const k of order) {
              const ids = this.variantIds(k);
              for (let i = 0; i < ids.length; i += ANALYZE_CHUNK) chunks.push({k, ids: ids.slice(i, i + ANALYZE_CHUNK)});
            }
            this.analyzing = true;
            this.analysis = {
              analyzed: 0, unavailable: 0, matches: 0, found: {}, notFound: {}, unmatched: [], total: this.analyzeIds.length,
            };
            this.variantStats = this.variants.map(() => ({analyzed: 0, unavailable: 0, matches: 0}));
            return from(chunks).pipe(
              concatMap(({k, ids}) => this.service.analyze(id, ids, rules).pipe(
                catchError(() => of({
                  analyzed: ids.length, unavailable: ids.length, matches: 0, found: {}, notFound: {}, unmatched: [],
                } as PatternAnalysis)),
                map(part => ({k, part})),
              )),
              finalize(() => this.analyzing = false),
            );
          }),
        )
        .subscribe(r => {
          if (!r || !this.analysis) return;
          const {k, part} = r;
          const s = this.variantStats[k];
          if (s) {
            s.analyzed += part.analyzed;
            s.unavailable += part.unavailable;
            s.matches += part.matches;
          }
          const a = this.analysis;
          a.analyzed += part.analyzed;
          a.unavailable += part.unavailable;
          a.matches += part.matches;
          for (const [t, n] of Object.entries(part.found)) a.found[t] = (a.found[t] ?? 0) + (n ?? 0);
          for (const [t, ids] of Object.entries(part.notFound ?? {})) a.notFound[t] = [...(a.notFound[t] ?? []), ...(ids ?? [])];
          a.unmatched.push(...(part.unmatched ?? []));
        }),
    );
    this.subs.add(this.route.paramMap.subscribe(params => this.load(Number(params.get('messageId')))));
  }

  analyze(): void {
    this.analysisWanted = true;
    this.analysisRuns.next();
  }

  // Badge «trovato su X di N»: solo per i campi mappati, a analisi avviata.
  analysisBadge(t: TargetField): {tone: string; text: string} | null {
    const a = this.analysis;
    if (!a || !a.analyzed) return null;
    const rule = this.ruleFor(t);
    if (!rule || rule.kind === 'none') return null;
    const readable = a.analyzed - a.unavailable;
    const found = a.found[t] ?? 0;
    return {
      tone: found === readable ? 'ok' : found === 0 ? 'danger' : 'warn',
      text: `Trovato su ${found} di ${readable} simili${a.analyzed < a.total ? '…' : ''}`,
    };
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
        this.variants = data.variants?.length ? data.variants : [{start: 0, count: data.similar.length}];
        this.variant = Math.max(0, this.variants.findIndex(v => this.index >= v.start && this.index < v.start + v.count));
        this.analyzeIds = this.variants.flatMap((_, k) => this.variantIds(k));
        this.numberOf = new Map(data.similar.map((id, i) => [id, data.numbers?.[i] ?? null]));
        this.invoiceOptions = data.similar.map((id, i) => {
          const k = this.variants.findIndex(v => i >= v.start && i < v.start + v.count);
          const label = this.invoiceLabel(id);
          return {
            label,
            value: id,
            sublabel: this.variants.length > 1 ? `Variante ${k + 1}` : undefined,
            searchText: `${label} ${id}`,
          };
        });
        this.buildOptions(data);
        this.buildReadingOptions();
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
    this.buildSelectOptions();
  }

  private buildSelectOptions(): void {
    for (const t of [...EDITABLE_HEADER, ...LINE_TARGETS]) {
      const fixed: TOption[] = [
        {label: this.defaultLabel(t), value: ''},
        ...(t === 'amount' ? [{label: 'Calcolato: imponibile × IVA', value: 'gross'}] : []),
        {label: 'Non presente', value: 'none'},
      ];
      const fields = (this.options[t] ?? []).map(o => {
        const label = `${o.label}${o.header ? ' (dalla testata)' : ''}`;
        const sample = o.sample ?? '—';
        return {
          label,
          value: o.value,
          sublabel: `${sample}${o.committente ? ' · dati del Comune' : ''}`,
          searchText: `${label} ${sample}`,
        };
      });
      this.selectOptions[t] = [...fixed, ...fields];
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
          this.occurrences[t] = rule.occurrence ?? null;
          this.occPicked[t] = !!rule.occurrence;
          if (t === 'estimated') {
            this.wordMode[t] = rule.kind;
            this.words[t] = rule.word;
            this.anchors[t] = rule.anchor ?? '';
          } else if (rule.kind === 'numberBefore' || rule.kind === 'textBefore') {
            this.before[t] = rule.word;
            this.after[t] = rule.anchor ?? '';
          } else {
            this.after[t] = rule.word;
            this.legacyAnchor[t] = rule.anchor ?? '';
          }
        }
      }
    }
    this.consumptionFilter = rules.consumptionLineFilter ?? '';
    this.readingTable = rules.readingTable ?? null;
    this.buildReadingOptions();
    this.consumptionMode = this.readingTable ? 'readings' : BAND_TARGETS.some(t => rules.line[t]) ? 'bands' : 'total';
    if (this.data) this.buildOptions(this.data);
  }

  rules(): PatternRules {
    const rules: PatternRules = {header: {}, line: {}};
    for (const t of [...EDITABLE_HEADER, ...LINE_TARGETS]) {
      if (!this.showTarget(t)) continue;
      const rule = this.ruleFor(t);
      if (!rule) continue;
      if (isHeaderTarget(t)) rules.header[t as keyof PatternRules['header']] = rule;
      else rules.line[t] = rule;
    }
    const credit = !!this.data?.message.credit_note;
    if (!credit && this.consumptionMode !== 'readings' && this.consumptionFilter.trim()) rules.consumptionLineFilter = this.consumptionFilter.trim();
    if (!credit && this.consumptionMode === 'readings' && this.readingTable) {
      const {layout, label, occurrence} = this.readingTable;
      rules.readingTable = {layout, label, ...(occurrence && occurrence > 1 ? {occurrence} : {})};
    }
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
    const word = this.wordParts(t);
    if (word) {
      const occurrence = word.kind === 'contains' ? null : this.occurrences[t];
      return {
        kind: word.kind,
        path: field.path,
        word: word.word,
        ...(fromHeader ? {fromHeader: true} : {}),
        ...(word.anchor ? {anchor: word.anchor} : {}),
        ...(occurrence ? {occurrence} : {}),
      };
    }
    // Dal PDF (e la stima) solo cercando un testo: senza, il campo resta non mappato.
    if (field.path === PDF_PATH || WORD_ONLY.includes(t)) return null;
    const where = field.where ? {where: field.where} : {};
    return fromHeader ? {kind: 'fromHeader', path: field.path, ...where} : {kind: 'field', path: field.path, ...where};
  }

  // Righe delle fasce solo con «Per fasce».
  showTarget(t: TargetField): boolean {
    // Note di credito senza consumi: le regole della sezione non si salvano.
    if (this.data?.message.credit_note && this.consumptionTargets.includes(t)) return false;
    // Letture del contatore al posto del consumo del periodo (e della sua stima).
    if (this.consumptionMode === 'readings' && ['consumption', 'estimated', ...BAND_TARGETS].includes(t)) return false;
    return this.consumptionMode === 'bands' || !(BAND_TARGETS as TargetField[]).includes(t);
  }

  // Per fasce: ogni fascia parte dal campo del consumo, dopo la sua etichetta
  // («Fascia oraria F1» se il PDF la scrive, altrimenti «F1») e prima dell'unità del
  // consumo (o «kWh»). Tornando al totale le fasce si svuotano.
  consumptionModeChanged(mode: 'total' | 'bands' | 'readings'): void {
    this.consumptionMode = mode;
    if (mode === 'readings') {
      // Proposta: la prima tabella trovata nel PDF.
      this.readingTable ??= this.readingOptions[0]?.table ?? null;
      this.buildReadingOptions();
      this.focus('readings');
      this.requestPreview(true);
      return;
    }
    const pdf = (this.data?.pdf_text ?? '').replace(/\s+/g, ' ').toLowerCase();
    for (const [i, t] of BAND_TARGETS.entries()) {
      const label = BAND_LABELS.map(l => `${l}${i + 1}`).find(l => pdf.includes(l.toLowerCase())) ?? `F${i + 1}`;
      this.choice[t] = mode === 'bands' ? (this.choice['consumption'] ?? '') : '';
      this.after[t] = mode === 'bands' ? label : '';
      this.before[t] = mode === 'bands' ? (this.before['consumption']?.trim() || 'kWh') : '';
      this.legacyAnchor[t] = '';
      this.occurrences[t] = null;
      this.occPicked[t] = false;
    }
    this.requestPreview(true);
  }

  get readingKey(): string {
    return this.readingTable ? tableKey(this.readingTable) : '';
  }

  readingTableChanged(key: string): void {
    this.readingTable = this.readingOptions.find(o => o.key === key)?.table ?? null;
    this.refreshPdf();
    this.requestPreview(true);
  }

  // Voci del selettore: tabelle trovate in questa fattura (con le letture) e, se manca,
  // quella del pattern salvato.
  private buildReadingOptions(): void {
    const day = (iso: string) => iso.split('-').reverse().join('/');
    const options = (this.data?.reading_tables ?? []).map(t => {
      const n = Math.min(t.cells.dates.length, t.cells.values.length);
      const where = t.layout === 'columns' ? `In colonna, riga «${t.label}»` : `In righe, sotto «${t.label}»`;
      const occurrence = t.occurrence > 1 ? ` (${t.occurrence}ª)` : '';
      const first = t.cells.dates[0] ? `, dal ${day(t.cells.dates[0])}` : '';
      const table: ReadingTable = {layout: t.layout, label: t.label, occurrence: t.occurrence};
      return {key: tableKey(table), label: `${where}${occurrence}: ${n === 1 ? '1 lettura' : `${n} letture`}${first}`, table};
    });
    if (this.readingTable && !options.some(o => o.key === tableKey(this.readingTable!))) {
      const t = this.readingTable;
      options.push({
        key: tableKey(t),
        label: `${t.layout === 'columns' ? 'In colonna, riga' : 'In righe, sotto'} «${t.label}»: non trovata in questa fattura`,
        table: t,
      });
    }
    this.readingOptions = options;
  }

  // Colonne della tabella delle letture letta nell'anteprima (anche incomplete).
  readingColumns(): {date: string; value: string; type: string; estimated: boolean; complete: boolean}[] {
    const cells = this.preview?.extracted?.lines.find(l => l.readingCells)?.readingCells;
    if (!cells) return [];
    const complete = Math.min(cells.dates.length, cells.values.length);
    const count = Math.max(cells.dates.length, cells.values.length, cells.types.length);
    return Array.from({length: count}, (_, i) => {
      const type = cells.types[i] || 'rilevata';
      return {
        date: cells.dates[i] ? cells.dates[i].split('-').reverse().join('/') : '—',
        value: cells.values[i] !== undefined ? this.qty(cells.values[i]) : '—',
        type: type || '—',
        estimated: /stim|presun/i.test(type),
        complete: i < complete,
      };
    });
  }

  // Letture lette nella riga dell'anteprima.
  readingsText(l: ExtractedLine): string {
    return (l.readings ?? [])
      .map(r => `${r.date.split('-').reverse().join('/')} ${this.qty(r.value)} ${r.estimated ? 'stimata' : 'rilevata'}`)
      .join(' · ');
  }

  defaultLabel(t: TargetField): string {
    if (t === 'amount') return 'Predefinito: imponibile × IVA';
    if (t === 'description') return 'Predefinito: Descrizione della riga';
    return HEADER_DEFAULTS.includes(t) ? 'Tracciato standard' : 'Non mappato';
  }

  estimatedModes = ESTIMATED_MODES;

  // Regola «parola» dai campi dell'editor (null = valore intero del campo).
  private wordParts(t: TargetField): {kind: WordKind; word: string; anchor?: string} | null {
    if (!this.canWord(t)) return null;
    if (t === 'estimated') {
      const kind = this.wordMode[t];
      const word = this.words[t]?.trim();
      return kind && word ? {kind, word, anchor: this.anchors[t]?.trim() || undefined} : null;
    }
    const after = this.after[t]?.trim();
    const before = this.before[t]?.trim();
    const number = NUMBER_TARGETS.includes(t);
    if (before) return {kind: number ? 'numberBefore' : 'textBefore', word: before, anchor: after || undefined};
    if (after) return {kind: number ? 'numberAfter' : 'textAfter', word: after, anchor: this.legacyAnchor[t] || undefined};
    return null;
  }

  // Testo cercato dalla regola (quello di cui si contano le occorrenze).
  searchedWord(t: TargetField): string {
    const word = this.wordParts(t);
    return word && word.kind !== 'contains' ? word.word : '';
  }

  // Ricerca dentro il testo solo dove ha senso: PDF, campi con frasi (Causale,
  // Descrizione) o regola «parola» già impostata; non su valori secchi (date, importi).
  // Campo XML di testo lungo: «Dopo/Prima del testo» nascosti finché non servono.
  wordOpen: Record<string, boolean> = {};

  wordFolded(t: TargetField): boolean {
    return t !== 'estimated' && !this.fromPdf(t) && !this.wordOpen[t]
      && !this.after[t]?.trim() && !this.before[t]?.trim();
  }

  canWord(t: TargetField): boolean {
    const c = this.choice[t] ?? '';
    if (!WORD_TARGETS.includes(t) || !c.startsWith('f:')) return false;
    if (t === 'estimated' || this.fromPdf(t) || this.after[t]?.trim() || this.before[t]?.trim()) return true;
    const sample = this.fields.get(c.slice(2))?.sample ?? '';
    return /\s/.test(sample.trim()) && sample.length > 15;
  }

  // Elenco delle occorrenze aperto: finché non se ne sceglie una, o con «Cambia».
  occOpen(t: TargetField): boolean {
    return !this.occPicked[t];
  }

  // Cambia il campo: i testi cercati erano per quello precedente.
  choiceChanged(t: TargetField): void {
    this.after[t] = '';
    this.before[t] = '';
    this.legacyAnchor[t] = '';
    this.textChanged(t);
  }

  // Cambia il testo cercato: l'occorrenza scelta non vale più.
  textChanged(t: TargetField): void {
    this.occurrences[t] = null;
    this.occPicked[t] = false;
    this.changed(t);
  }

  chosenOccurrence(t: TargetField): WordOccurrence | null {
    const n = this.occurrences[t];
    return n ? (this.wordOccurrences(t).find(o => o.n === n) ?? null) : null;
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
    if ((t === 'readings' || this.fromPdf(t)) && this.data?.pdf_text) this.view = 'pdf';
    this.refreshXml();
  }

  changed(t: TargetField): void {
    if (!this.canWord(t)) {
      this.wordMode[t] = '';
      this.after[t] = '';
      this.before[t] = '';
    } else if (t === 'estimated' && !this.wordMode[t]) {
      this.wordMode[t] = ESTIMATED_MODES[0].kind;
    }
    this.focus(t);
    this.requestPreview(true);
  }

  // Cambio di regola: le anteprime delle altre fatture non valgono più.
  requestPreview(rulesChanged: boolean): void {
    if (rulesChanged) {
      this.previews.clear();
      this.updateHolds();
      if (this.analysisWanted) this.analysisRuns.next();
    }
    const cached = this.data ? this.previews.get(this.data.message.id) : undefined;
    if (cached) {
      this.applyPreview(cached);
      return;
    }
    this.previewRequests.next();
  }

  // Occorrenze della parola nella fattura in anteprima: utili solo se più di una.
  wordOccurrences(t: TargetField): WordOccurrence[] {
    const list = this.preview?.occurrences?.[t] ?? [];
    return list.length > 1 ? list : [];
  }

  setOccurrence(t: TargetField, n: number | null): void {
    this.occurrences[t] = n;
    this.occPicked[t] = true;
    this.changed(t);
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
      if (this.view === 'xml') this.scrollToMark();
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
    const word = t && t !== 'readings' && this.fromPdf(t) ? this.wordParts(t) : null;
    // Tabella delle letture: la sua intestazione, a inizio riga.
    const marks: {word: string; cls: string; start?: boolean}[] = (t === 'readings'
      ? [{word: (this.readingTable?.label ?? '').replace(/[*|]/g, ' '), cls: '', start: true}]
      : [
          {word: word?.anchor ?? '', cls: 'pe-anchor'},
          {word: word?.word ?? '', cls: ''},
        ]).filter(m => m.word.trim());
    let html = escapeHtml(text);
    for (const m of marks) {
      // Gli spazi della parola valgono anche l'a capo, «*» qualsiasi carattere e «|» separa
      // le alternative, come lato server (wordPattern).
      const pattern = m.word.trim().split(/\s+/).filter(Boolean).map(w => {
        const alts = w.split('|').filter(Boolean)
          .map(a => escapeRegExp(escapeHtml(a)).replace(/\\\*/g, '[^\\s<]*'));
        return alts.length > 1 ? `(?:${alts.join('|')})` : (alts[0] ?? '');
      }).filter(Boolean).join('\\s+');
      if (!pattern) continue;
      const open = `<mark${m.cls ? ` class="${m.cls}"` : ''}>`;
      html = m.start
        ? html.replace(new RegExp(`^([ \\t]*)(${pattern})`, 'gim'), (_, lead, s) => `${lead}${open}${s}</mark>`)
        : html.replace(new RegExp(pattern, 'gi'), s => `${open}${s}</mark>`);
    }
    this.pdfHtml = html;
    if (marks.length && this.view === 'pdf') this.scrollToMark(t ? this.occurrences[t] : null);
  }

  // Porta in vista il segno (l'occorrenza scelta, se c'è) scorrendo solo il riquadro
  // di destra: scrollIntoView muoverebbe anche la pagina.
  private scrollToMark(occurrence?: number | null): void {
    setTimeout(() => {
      const pre = document.querySelector<HTMLElement>('.pe-xml pre');
      if (!pre) return;
      const marks = [...pre.querySelectorAll<HTMLElement>('mark')];
      const anchor = marks.findIndex(m => m.classList.contains('pe-anchor'));
      const words = marks.slice(anchor + 1).filter(m => !m.classList.contains('pe-anchor'));
      const target = (occurrence ? words[occurrence - 1] : words[0]) ?? marks[0];
      if (!target) return;
      if (occurrence) target.classList.add('pe-chosen');
      pre.scrollTo({top: Math.max(0, target.offsetTop - pre.clientHeight / 2), behavior: 'smooth'});
    });
  }

  setView(view: 'xml' | 'pdf'): void {
    this.view = view;
  }

  // Etichetta di una fattura: numero documento, altrimenti l'id del messaggio.
  invoiceLabel(id: number): string {
    return this.numberOf.get(id) ?? `Messaggio ${id}`;
  }

  // Fatture analizzate dove il campo non è stato trovato (vuoto = nessuna o analisi non fatta).
  notFoundIds(t: TargetField): number[] {
    return this.ruleFor(t) ? (this.analysis?.notFound[t] ?? []) : [];
  }

  // Apre la fattura scelta dal selettore o da un elenco di non trovate: le regole restano.
  openInvoice(id: number | null | undefined): void {
    if (id && id !== this.data?.message.id) this.open(Number(id));
  }

  // Fatture analizzate della variante k: le più recenti, al massimo ANALYZE_PER_VARIANT.
  private variantIds(k: number): number[] {
    const v = this.variants[k];
    return v ? this.similar.slice(v.start, v.start + Math.min(v.count, ANALYZE_PER_VARIANT)) : [];
  }

  // Esito dell'analisi sulla variante k («struttura 9/9»), vuoto se non ancora analizzata.
  variantResult(k: number): string {
    const s = this.variantStats[k];
    if (!s?.analyzed) return '';
    const readable = s.analyzed - s.unavailable;
    return ` · struttura ${s.matches}/${readable}`;
  }

  // Varianti analizzate su cui le regole reggono su tutte le fatture leggibili.
  get variantsOk(): number {
    return this.variantStats.filter(s => s.analyzed && s.matches === s.analyzed - s.unavailable).length;
  }

  // Posizione della fattura aperta dentro la sua variante (da 0).
  get variantPosition(): number {
    return this.index - (this.variants[this.variant]?.start ?? 0);
  }

  get variantCount(): number {
    return this.variants[this.variant]?.count ?? this.similar.length;
  }

  go(step: number): void {
    const position = this.variantPosition + step;
    if (position < 0 || position >= this.variantCount) return;
    this.open(this.similar[this.index + step]);
  }

  // Prima fattura (la più recente) della variante scelta.
  pickVariant(k: number): void {
    const v = this.variants[k];
    if (v) this.open(this.similar[v.start]);
  }

  private open(id: number | undefined): void {
    if (id === undefined) return;
    this.router.navigate(['/invoice-import/editor', id], {queryParamsHandling: 'preserve'});
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

  qty(n: number): string {
    return n.toLocaleString('it-IT', {maximumFractionDigits: 6});
  }

  // Fasce lette sulla riga, per l'anteprima («F1 60 · F2 25 · F3 38»).
  bands(l: ExtractedLine): string {
    return BAND_TARGETS.map((t, i) => {
      const value = l[t];
      return value === null || value === undefined ? '' : `F${i + 1} ${this.qty(value)}`;
    })
      .filter(Boolean)
      .join(' · ');
  }
}
