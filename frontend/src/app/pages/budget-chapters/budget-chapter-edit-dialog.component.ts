import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {ChapterBudgetBarComponent} from './chapter-budget-bar.component';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {groupByYear, keepOpen, SheetGroup, SheetGroupsComponent} from '../../core/components/entity-sheet/sheet-groups.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {dateIt, hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {ACCOUNTING_BADGE, chapterBudgetStatus, StatusInfo} from '../../core/helpers/entity-status';
import {ACCOUNTING_SOURCE, AccountingStateService} from '../../core/services/accounting-state.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import type {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {BudgetChapter} from './entity/budget-chapter.entity';
import {BudgetChapterUtilitiesTabComponent} from './budget-chapter-utilities-tab.component';
import {BudgetChapterYearsTabComponent} from './spending/budget-chapter-years-tab.component';
import {formatEuro} from './spending/budget-chapter-spending.service';
import {ChapterBudgetService} from './chapter-budget.service';
import {ChapterCommitment, ChapterInvoiceLine, ChapterYear} from './chapter-budget.model';
import {yearsLabel} from '../commitments/commitment.model';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {UtilityConsumptionService} from '../utilities/consumptions/utility-consumption.service';
import {HardTypeDescription} from '../utility-types/enum/hard-type.enum';

// Scheda del capitolo di spesa: dati, esercizi (bilancio + impegnato +
// fatturato) e collegamenti a utenze, contratti (impegni) e fatture.
@Component({
  selector: 'app-budget-chapter-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatTabsModule,
    MatIconModule, MatTooltipModule, ChapterBudgetBarComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, LinkedTableComponent,
    PreviewCardComponent, EntityHistoryComponent, MultiSelectComponent, OnlyNumbersDirective,
    BudgetChapterUtilitiesTabComponent, BudgetChapterYearsTabComponent, SheetGroupsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './budget-chapter-edit-dialog.component.html',
  styles: [`
  `],
})
export class BudgetChapterEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<BudgetChapterEditDialogComponent, BudgetChapter | undefined>);
  private budget = inject(ChapterBudgetService);
  private consumption = inject(UtilityConsumptionService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<BudgetChapter>>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly year = new Date().getFullYear();
  readonly eur = formatEuro;

  utilityTypeOptions: TOption[] = [];
  readonly accountingBadge = ACCOUNTING_BADGE;
  readonly fromAccounting = this.data.item.source === ACCOUNTING_SOURCE;
  // Import della contabilità acceso: esercizi solo dalla contabilità.
  accountingActive = false;
  private accounting = inject(AccountingStateService);
  // Esercizi salvati dal tab (subito, non col Salva della scheda): "Annulla"
  // diventa "Chiudi" se il resto della scheda non è stato toccato.
  yearsChanged = false;
  // Campi cache (mai getter) per app-linked-table e le anteprime.
  years: ChapterYear[] = [];
  current: ChapterYear | null = null;
  status: StatusInfo = chapterBudgetStatus(null);
  commitments: ChapterCommitment[] = [];
  lines: ChapterInvoiceLine[] = [];
  // Righe per esercizio (come gli esercizi del capitolo), aperto quello in corso.
  lineGroups: SheetGroup<ChapterInvoiceLine>[] = [];
  utilityPreview: PreviewItem[] = [];
  utilitiesCount: number | null = null;
  commitmentPreview: PreviewItem[] = [];
  linePreview: PreviewItem[] = [];

  readonly commitmentColumns: LinkedColumn<ChapterCommitment>[] = [
    {label: 'Numero', value: c => c.label},
    {label: 'Competenza', value: c => yearsLabel(c.fiscal_years?.length ? c.fiscal_years : [c.fiscal_year])},
    {label: 'Fornitore', value: c => c.supplier ?? ''},
    {label: 'Importo', value: c => (c.amount === null ? 'senza importo' : formatEuro(c.amount))},
    {label: 'Speso', value: c => formatEuro(c.spent)},
    {label: 'Rimanenza', value: c => (c.remaining === null ? '—' : formatEuro(c.remaining))},
  ];
  readonly lineColumns: LinkedColumn<ChapterInvoiceLine>[] = [
    {label: 'Fattura', value: l => `${l.number} del ${dateIt(l.invoice_date)}`},
    {label: 'Fornitore', value: l => l.supplier ?? ''},
    {label: 'Da', value: l => (l.kind === 'share' ? "Quota d'impegno" : 'Capitolo utenza')},
    {label: 'Utenza', value: l => (l.kind === 'share' ? '' : (l.utility_code ?? ''))},
    {label: 'Esercizio', value: l => String(l.year)},
    {label: 'Importo', value: l => formatEuro(l.amount)},
  ];

  form = this.fb.group({
    chapter_code: [{value: this.data.item.chapter_code ?? '', disabled: !this.isNew}, Validators.required],
    article: [this.data.item.article ?? '', Validators.required],
    pdc: [this.data.item.pdc ?? ''],
    notes: [this.data.item.notes ?? ''],
    utility_type_ids: [(this.data.item.utilityTypes ?? []).map(t => t.id)],
    description: [this.data.item.description ?? ''],
  });

  constructor() {
    if (!this.canEdit) this.form.disable();
    inject(UtilityTypesService).search({deleted: false}).subscribe({
      next: list => this.utilityTypeOptions = list.map(t => ({label: t.name, value: t.id})),
      error: err => console.error('Errore nel caricamento dei tipi utenza:', err),
    });
  }

  ngOnInit(): void {
    this.accounting.active$.subscribe(active => {
      this.accountingActive = active;
      if (active && this.fromAccounting && this.canEdit) {
        for (const c of ['chapter_code', 'article', 'description'] as const) this.form.controls[c].disable();
      }
    });
    if (this.isNew) return;
    this.loadYears();
    this.loadLinks();
  }

  loadYears(): void {
    this.budget.years(this.data.item.id).subscribe({
      next: rows => {
        this.years = rows;
        this.current = rows.find(r => r.year === this.year) ?? null;
        this.status = chapterBudgetStatus(this.current);
      },
      error: err => console.error('Errore caricamento esercizi del capitolo:', err),
    });
  }

  private loadLinks(): void {
    const id = this.data.item.id;
    this.budget.commitments(id).subscribe({
      next: rows => {
        this.commitments = rows;
        this.commitmentPreview = rows.map(c => ({
          id: c.id,
          label: `${c.label} · ${yearsLabel(c.fiscal_years?.length ? c.fiscal_years : [c.fiscal_year])}`,
          sublabel: c.remaining === null ? 'senza importo' : `rimanenza ${formatEuro(c.remaining)}`,
        }));
      },
      error: err => console.error('Errore caricamento impegni del capitolo:', err),
    });
    this.budget.invoiceLines(id).subscribe({
      next: rows => {
        // Id di quote e righe da tabelle diverse: chiave unica per il track.
        this.lines = rows.map(l => ({...l, id: l.kind === 'share' ? -l.id : l.id}));
        this.lineGroups = keepOpen(groupByYear(this.lines, l => l.year,
          group => formatEuro(Math.round(group.reduce((sum, l) => sum + Number(l.amount), 0) * 100) / 100)), this.lineGroups);
        this.linePreview = this.lines.map(l => ({id: l.id, label: `${l.number} del ${dateIt(l.invoice_date)}`, sublabel: formatEuro(l.amount)}));
      },
      error: err => console.error('Errore caricamento fatture del capitolo:', err),
    });
    this.consumption.chapterSummary(id).subscribe({
      next: rows => {
        this.utilityPreview = rows.map((r, i) => ({
          id: i + 1,
          label: `${HardTypeDescription[r.hard_type]}: ${r.utilities_count}`,
        }));
        this.utilitiesCount = rows.reduce((sum, r) => sum + Number(r.utilities_count), 0);
      },
      error: err => console.error('Errore caricamento utenze del capitolo:', err),
    });
  }

  onYearsChanged(): void {
    this.yearsChanged = true;
    this.loadYears();
  }

  cancelLabel(): string {
    if (!this.canEdit) return 'Chiudi';
    return this.yearsChanged && this.form.pristine ? 'Chiudi' : 'Annulla';
  }

  // Descrizione e tipi utenza (nessuno = tutti i tipi).
  subtitleText(): string {
    const ids = this.form.getRawValue().utility_type_ids ?? [];
    const names = ids.map(id => this.utilityTypeOptions.find(o => o.value === id)?.label).filter(Boolean);
    const types = ids.length ? names.join(', ') : 'Tutti i tipi utenza';
    return [this.data.item.description, types].filter(Boolean).join(' · ');
  }

  titleText(): string {
    const v = this.form.getRawValue();
    return v.chapter_code ? `Capitolo ${v.chapter_code}/${v.article || 0}` : 'Nuovo capitolo di spesa';
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'chapter_code', 'article');
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  // Un contratto o una fattura salvati possono cambiare impegnato e fatturato.
  openCommitment(c: ChapterCommitment): void {
    this.navigator.openCommitment(c.id).subscribe(saved => {
      if (!saved) return;
      this.loadYears();
      this.loadLinks();
    });
  }

  newCommitment(): void {
    this.navigator.createCommitment({budget_chapter_id_fk: this.data.item.id}).subscribe(c => {
      if (!c) return;
      this.loadYears();
      this.loadLinks();
    });
  }

  openInvoice(l: ChapterInvoiceLine): void {
    this.navigator.openInvoice(l.invoice_id).subscribe(saved => {
      if (!saved) return;
      this.loadYears();
      this.loadLinks();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(plainToInstance(BudgetChapter, {id: this.data.item.id, ...this.form.getRawValue()}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
