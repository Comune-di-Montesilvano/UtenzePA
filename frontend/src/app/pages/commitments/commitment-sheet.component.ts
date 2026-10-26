import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {dateIt, hasInvalid, isEditorRole} from '../../core/components/entity-sheet/sheet-utils';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {BarSegment, StackedBarComponent} from '../../core/components/stacked-bar.component';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {ACCOUNTING_BADGE, type StatusInfo} from '../../core/helpers/entity-status';
import {ACCOUNTING_SOURCE, AccountingStateService} from '../../core/services/accounting-state.service';
import {partyName} from '../../core/helpers/party-name.helper';
import {EntityNavigatorService, nameFrom} from '../../core/services/entity-navigator.service';
import type {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {AttachmentsComponent} from '../attachments/attachments.component';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {formatEuro} from '../budget-chapters/spending/budget-chapter-spending.service';
import {ContractsService} from '../contracts/contract.service';
import type {Contract} from '../contracts/entity/contract.entity';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {chapterLabel, Commitment, CommitmentInvoice, CommitmentYear, competenceLabel} from './commitment.model';
import {SHARE_SOURCE_LABELS} from '../invoices/entity/invoice-commitment-share.model';
import {commitmentLabel} from './commitment-label';
import {CommitmentService} from './commitment.service';

type ContractRow = {id: number; cig: string; order: string; period: string; closed: boolean};
type YearBar = {fiscal_year: number; amount: number | null; segments: BarSegment[]};

const toNumber = (v: unknown): number | null => (v === null || v === undefined || `${v}` === '' ? null : Number(v));

// Scheda dell'impegno: numero della ragioneria, capitolo, annualità
// (esercizio + importo; pluriennale = più annualità), contratti collegati
// (N-N) e quote di fattura che lo consumano.
@Component({
  selector: 'app-commitment-sheet',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatTabsModule,
    MatIconModule, MatTooltipModule, StackedBarComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent,
    LinkedTableComponent, EntityHistoryComponent, FilterableSelectComponent, OnlyNumbersDirective, AttachmentsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './commitment-sheet.component.html',
  styles: [`
    app-stacked-bar strong { color: var(--app-text); font-weight: 500; }
    .line-row { cursor: pointer; }
    .years { display: flex; flex-direction: column; }
    .year-row { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .year-row mat-form-field { flex: 1 1 180px; }
    .year-row button { margin-top: 4px; }
    .year-bar-title { font-size: 0.8125rem; font-weight: 500; margin: 4px 0; }
  `],
})
export class CommitmentSheetComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<CommitmentSheetComponent, Commitment | undefined>);
  private service = inject(CommitmentService);
  private chapters = inject(BudgetChaptersService);
  private parties = inject(ThirdPartiesService);
  private contracts = inject(ContractsService);
  private navigator = inject(EntityNavigatorService);
  yearBars: YearBar[] = [];
  protected data = inject<EditDialogData<Commitment>>(MAT_DIALOG_DATA);

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  // L'elenco impegni non porta l'autore dell'ultima modifica: si vede nello Storico.
  readonly lastModified: string | null = null;
  readonly eur = formatEuro;
  readonly dateIt = dateIt;

  // Campi cache (mai getter) per app-linked-table e le select.
  chapterOptions: TOption[] = [];
  supplierOptions: TOption[] = [];
  contractRows: ContractRow[] = [];
  contractOptions: TOption[] = [];
  invoices: CommitmentInvoice[] = [];
  readonly sourceLabels = SHARE_SOURCE_LABELS;
  status: StatusInfo | null = null;
  readonly accountingBadge = ACCOUNTING_BADGE;
  readonly fromAccounting = this.data.item.source === ACCOUNTING_SOURCE;
  // Import della contabilità acceso: numero, capitolo, fornitore e annualità in sola lettura.
  locked = false;
  private accounting = inject(AccountingStateService);
  private allContracts: Contract[] = [];

  readonly contractColumns: LinkedColumn<ContractRow>[] = [
    {label: 'CIG', value: r => r.cig},
    {label: 'Ordine', value: r => r.order},
    {label: 'Periodo', value: r => r.period},
    {label: 'Stato', value: r => (r.closed ? 'Chiuso' : 'Aperto')},
  ];

  form = this.fb.group({
    commitment_year: [this.data.item.commitment_year as number | null],
    commitment_num: [this.data.item.commitment_num as number | null],
    commitment_sub: [this.data.item.commitment_sub as number | null],
    budget_chapter_id_fk: [this.data.item.budget_chapter_id_fk as number | null, Validators.required],
    years: this.fb.array(
      (this.data.item.years?.length ? this.data.item.years : [{fiscal_year: new Date().getFullYear(), amount: null}])
        .map(y => this.yearGroup(y)),
    ),
    supplier_id_fk: [this.data.item.supplier_id_fk as number | null],
    contract_ids: [[...(this.data.item.contract_ids ?? [])] as number[]],
    notes: [this.data.item.notes ?? ''],
  });

  // Righe del FormArray (riferimento stabile: push/removeAt lo modificano).
  readonly yearGroups = this.form.controls.years.controls;

  constructor() {
    if (!this.canEdit) this.form.disable();
    this.status = this.statusOf(this.data.item);
    this.yearBars = (this.data.item.years ?? []).map(y => ({
      fiscal_year: y.fiscal_year,
      amount: y.amount,
      segments: this.barOf(y),
    }));
  }

  private yearGroup(y: CommitmentYear) {
    return this.fb.group({
      fiscal_year: [y.fiscal_year as number | null, [Validators.required, Validators.min(2000), Validators.max(2100)]],
      amount: [y.amount as number | null, Validators.min(0)],
    });
  }

  // Nuova annualità: l'esercizio dopo l'ultimo indicato.
  addYear(): void {
    const years = this.form.getRawValue().years.map(y => Number(y.fiscal_year) || 0);
    const last = Math.max(...years, new Date().getFullYear() - 1);
    this.form.controls.years.push(this.yearGroup({fiscal_year: last + 1, amount: null}));
    this.form.controls.years.markAsDirty();
  }

  removeYear(i: number): void {
    this.form.controls.years.removeAt(i);
    this.form.controls.years.markAsDirty();
  }

  duplicateYears(): boolean {
    const years = this.form.getRawValue().years.map(y => toNumber(y.fiscal_year)).filter(y => y !== null);
    return new Set(years).size !== years.length;
  }

  // Speso → rimanenza; oltre l'importo in rosso. Senza importo: solo speso.
  private barOf(c: CommitmentYear): BarSegment[] {
    const spent = Math.max(Number(c.spent ?? 0), 0);
    if (c.amount === null) {
      return [{key: 'spent', label: 'Fatturato', value: spent, tone: 'spent', hint: 'quote di fattura che consumano l’impegno', keepEmpty: true}];
    }
    const amount = Math.max(Number(c.amount), 0);
    return [
      {key: 'spent', label: 'Fatturato', value: Math.min(spent, amount), tone: 'spent', hint: 'quote di fattura che consumano l’impegno', keepEmpty: true},
      {key: 'left', label: 'Rimanenza', value: Math.max(amount - spent, 0), tone: 'left', hint: 'importo non ancora fatturato', keepEmpty: true},
      {key: 'over', label: 'Oltre l’importo', value: Math.max(spent - amount, 0), tone: 'over', hint: 'fatturato oltre l’importo dell’impegno'},
    ];
  }

  ngOnInit(): void {
    this.loadChapters();
    this.loadSuppliers();
    this.loadContracts();
    if (!this.isNew) this.loadInvoices();
    if (this.fromAccounting && this.canEdit) {
      this.accounting.active$.subscribe(active => {
        if (!active) return;
        this.locked = true;
        for (const c of ['commitment_year', 'commitment_num', 'commitment_sub', 'budget_chapter_id_fk', 'supplier_id_fk', 'years'] as const) {
          this.form.controls[c].disable();
        }
      });
    }
    this.form.controls.supplier_id_fk.valueChanges.subscribe(() => this.buildContracts());
  }

  private statusOf(c: Commitment): StatusInfo | null {
    if (this.isNew) return null;
    if (c.remaining !== null && c.remaining !== undefined && c.remaining < 0) {
      return {tone: 'danger', label: 'Sforato', icon: 'report', tooltip: `Rimanenza ${formatEuro(c.remaining)}`};
    }
    if (c.amount === null) return {tone: 'warn', label: 'Senza importo', icon: 'warning'};
    if (!c.contract_ids?.length) return {tone: 'warn', label: 'Senza contratto', icon: 'link_off'};
    return {tone: 'ok', label: `Rimanenza ${formatEuro(c.remaining)}`, icon: 'check_circle'};
  }

  private loadChapters(after?: () => void): void {
    this.chapters.search({deleted: false}).subscribe({
      next: list => {
        this.chapterOptions = list
          .map(c => ({label: chapterLabel(c), value: c.id, searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`}))
          .sort((a, b) => a.label.localeCompare(b.label, 'it'));
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei capitoli:', err),
    });
  }

  // "Solo fornitori": includere sempre il fornitore già scelto.
  private loadSuppliers(after?: () => void): void {
    this.parties.search({deleted: false}).subscribe({
      next: list => {
        this.supplierOptions = list
          .filter(p => p.type === 'LEGAL' || p.roles?.includes(PartyRole.SUPPLIER) || p.id === this.form.controls.supplier_id_fk.value)
          .map(p => ({label: partyName(p), value: p.id, sublabel: p.vat_number ?? undefined}))
          .sort((a, b) => a.label.localeCompare(b.label, 'it'));
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  private loadContracts(after?: () => void): void {
    this.contracts.search({deleted: false}).subscribe({
      next: list => {
        this.allContracts = list;
        this.buildContracts();
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei contratti:', err),
    });
  }

  // Collegati = contract_ids; collegabili = contratti del fornitore (tutti senza fornitore).
  private buildContracts(): void {
    const linked = new Set(this.form.controls.contract_ids.value ?? []);
    const supplier = this.form.controls.supplier_id_fk.value;
    const label = (c: Contract) => c.cig_contract || `Contratto senza CIG (id ${c.id})`;
    this.contractRows = this.allContracts.filter(c => linked.has(c.id)).map(c => ({
      id: c.id,
      cig: label(c),
      order: c.consip_order ?? '',
      period: [c.supply_start_date, c.supply_expiry_date].map(d => (d ? dateIt(d) : '…')).join(' – '),
      closed: !!c.closed,
    }));
    this.contractOptions = this.allContracts
      .filter(c => !linked.has(c.id) && (!supplier || c.supplier_id_fk === supplier))
      .map(c => ({label: label(c), value: c.id, sublabel: c.consip_order ? `ordine ${c.consip_order}` : undefined}))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }

  private loadInvoices(): void {
    this.service.invoices(this.data.item.id).subscribe({
      next: rows => this.invoices = rows,
      error: err => console.error("Errore nel caricamento delle fatture dell'impegno:", err),
    });
  }

  linkContract(id: number): void {
    this.setContracts([...(this.form.controls.contract_ids.value ?? []), id]);
  }

  unlinkContract(id: number): void {
    this.setContracts((this.form.controls.contract_ids.value ?? []).filter(c => c !== id));
  }

  private setContracts(ids: number[]): void {
    this.form.controls.contract_ids.setValue([...new Set(ids)]);
    this.form.controls.contract_ids.markAsDirty();
    this.buildContracts();
  }

  newContract(): void {
    const supplier = this.form.controls.supplier_id_fk.value;
    this.navigator.createSupplyContract([], supplier ? {supplier_id_fk: supplier} : {}).subscribe(c => {
      if (!c) return;
      this.loadContracts(() => this.linkContract(c.id));
    });
  }

  openContract(row: ContractRow): void {
    this.navigator.openSupplyContract(row.id).subscribe(saved => {
      if (saved) this.loadContracts();
    });
  }

  openInvoice(row: CommitmentInvoice): void {
    this.navigator.openInvoice(row.invoice_id).subscribe(saved => {
      if (saved) this.loadInvoices();
    });
  }

  openChapter(): void {
    const id = this.form.controls.budget_chapter_id_fk.value;
    if (!id) return;
    this.navigator.openBudgetChapter(id).subscribe(() => this.loadChapters());
  }

  newChapter(): void {
    this.navigator.createBudgetChapter().subscribe(c => {
      if (!c) return;
      this.loadChapters(() => {
        this.form.controls.budget_chapter_id_fk.setValue(c.id);
        this.form.controls.budget_chapter_id_fk.markAsDirty();
      });
    });
  }

  newSupplier(text: string): void {
    this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
      if (!p) return;
      this.loadSuppliers(() => {
        this.form.controls.supplier_id_fk.setValue(p.id);
        this.form.controls.supplier_id_fk.markAsDirty();
      });
    });
  }

  titleText(): string {
    const v = this.form.getRawValue();
    const label = commitmentLabel(toNumber(v.commitment_year), toNumber(v.commitment_num), toNumber(v.commitment_sub));
    if (label !== '—') return `Impegno ${label}`;
    return this.isNew ? 'Nuovo impegno' : 'Impegno senza numero';
  }

  subtitleText(): string {
    const v = this.form.getRawValue();
    const chapter = this.chapterOptions.find(o => o.value === v.budget_chapter_id_fk)?.label;
    const years = v.years.map(y => toNumber(y.fiscal_year)).filter((y): y is number => y !== null);
    const competence = years.length ? `Competenza ${competenceLabel({years: years.map(fiscal_year => ({fiscal_year}))})}` : null;
    return [competence, chapter].filter(Boolean).join(' · ');
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'budget_chapter_id_fk', 'years', 'commitment_year', 'commitment_num')
      || this.numberIncomplete() || this.duplicateYears();
  }

  // Anno e numero vanno insieme (il sub senza numero non ha senso).
  numberIncomplete(): boolean {
    const v = this.form.getRawValue();
    return (toNumber(v.commitment_year) === null) !== (toNumber(v.commitment_num) === null);
  }

  save(): void {
    if (this.form.invalid || this.numberIncomplete() || this.duplicateYears()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = Commitment.toPayload({
      commitment_year: toNumber(v.commitment_year),
      commitment_num: toNumber(v.commitment_num),
      commitment_sub: toNumber(v.commitment_sub),
      budget_chapter_id_fk: v.budget_chapter_id_fk!,
      years: v.years.map(y => ({fiscal_year: Number(y.fiscal_year), amount: toNumber(y.amount)})),
      supplier_id_fk: v.supplier_id_fk ?? null,
      contract_ids: v.contract_ids ?? [],
      notes: v.notes,
    });
    this.dialogRef.close(plainToInstance(Commitment, {id: this.data.item.id, ...payload}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
