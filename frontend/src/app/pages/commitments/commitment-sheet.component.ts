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
import type {StatusInfo} from '../../core/helpers/entity-status';
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
import {chapterLabel, Commitment, CommitmentLine} from './commitment.model';
import {commitmentLabel} from './commitment-label';
import {CommitmentService} from './commitment.service';

type ContractRow = {id: number; cig: string; order: string; period: string; closed: boolean};

const toNumber = (v: unknown): number | null => (v === null || v === undefined || `${v}` === '' ? null : Number(v));

// Scheda dell'impegno: numero della ragioneria, capitolo e competenza,
// importo, contratti collegati (N-N) e righe di fattura che lo consumano.
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
  barSegments: BarSegment[] = [];
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
  lines: CommitmentLine[] = [];
  status: StatusInfo | null = null;
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
    fiscal_year: [this.data.item.fiscal_year as number | null, [Validators.required, Validators.min(2000), Validators.max(2100)]],
    amount: [this.data.item.amount as number | null, Validators.min(0)],
    supplier_id_fk: [this.data.item.supplier_id_fk as number | null],
    contract_ids: [[...(this.data.item.contract_ids ?? [])] as number[]],
    notes: [this.data.item.notes ?? ''],
  });

  constructor() {
    if (!this.canEdit) this.form.disable();
    this.status = this.statusOf(this.data.item);
    this.barSegments = this.barOf(this.data.item);
  }

  // Speso → rimanenza; oltre l'importo in rosso. Senza importo: solo speso.
  private barOf(c: Commitment): BarSegment[] {
    const spent = Math.max(Number(c.spent ?? 0), 0);
    if (c.amount === null) {
      return [{key: 'spent', label: 'Fatturato', value: spent, tone: 'spent', hint: 'righe di fattura che consumano l’impegno', keepEmpty: true}];
    }
    const amount = Math.max(Number(c.amount), 0);
    return [
      {key: 'spent', label: 'Fatturato', value: Math.min(spent, amount), tone: 'spent', hint: 'righe di fattura che consumano l’impegno', keepEmpty: true},
      {key: 'left', label: 'Rimanenza', value: Math.max(amount - spent, 0), tone: 'left', hint: 'importo non ancora fatturato', keepEmpty: true},
      {key: 'over', label: 'Oltre l’importo', value: Math.max(spent - amount, 0), tone: 'over', hint: 'fatturato oltre l’importo dell’impegno'},
    ];
  }

  ngOnInit(): void {
    this.loadChapters();
    this.loadSuppliers();
    this.loadContracts();
    if (!this.isNew) this.loadLines();
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

  private loadLines(): void {
    this.service.lines(this.data.item.id).subscribe({
      next: rows => this.lines = rows,
      error: err => console.error("Errore nel caricamento delle righe dell'impegno:", err),
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

  openInvoice(line: CommitmentLine): void {
    this.navigator.openInvoice(line.invoice_id).subscribe(saved => {
      if (saved) this.loadLines();
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
    return [v.fiscal_year ? `Competenza ${v.fiscal_year}` : null, chapter].filter(Boolean).join(' · ');
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'budget_chapter_id_fk', 'fiscal_year', 'amount', 'commitment_year', 'commitment_num')
      || this.numberIncomplete();
  }

  // Anno e numero vanno insieme (il sub senza numero non ha senso).
  numberIncomplete(): boolean {
    const v = this.form.getRawValue();
    return (toNumber(v.commitment_year) === null) !== (toNumber(v.commitment_num) === null);
  }

  save(): void {
    if (this.form.invalid || this.numberIncomplete()) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = Commitment.toPayload({
      commitment_year: toNumber(v.commitment_year),
      commitment_num: toNumber(v.commitment_num),
      commitment_sub: toNumber(v.commitment_sub),
      budget_chapter_id_fk: v.budget_chapter_id_fk!,
      fiscal_year: Number(v.fiscal_year),
      amount: toNumber(v.amount),
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
