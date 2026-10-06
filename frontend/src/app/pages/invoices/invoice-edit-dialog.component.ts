import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {catchError, debounceTime, of, Subject, switchMap} from 'rxjs';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Invoice} from './entity/invoice.entity';
import {InvoiceLine} from './entity/invoice-line.model';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService, nameFrom} from '../../core/services/entity-navigator.service';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {ContractsService} from '../contracts/contract.service';
import {Contract} from '../contracts/entity/contract.entity';
import {TOption} from '../../core/types/option.interface';
import {partyName} from '../../core/helpers/party-name.helper';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {UtilityService} from '../utilities/utility.service';
import {CommitmentService} from '../contracts/commitments/commitment.service';
import {chapterLabel} from '../contracts/commitments/commitment.model';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {hasInvalid, isEditorRole, lastModifiedLabel} from '../../core/components/entity-sheet/sheet-utils';
import {ToastService} from '../../core/services/toast.service';
import {InvoiceLinesTabComponent} from './invoice-lines-tab.component';
import {ChapterBudgetService} from '../budget-chapters/chapter-budget.service';
import {BudgetWarning} from '../budget-chapters/chapter-budget.model';
import {toIsoDate} from '../../core/helpers/date.helper';

// Data 'AAAA-MM-GG' letta come giorno locale (new Date(v) = mezzanotte UTC).
const toLocalDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

const toNumberOrNull = (v: unknown): number | null => (v === null || v === undefined || `${v}` === '' ? null : Number(v));

// Scheda fattura: testata nel Riepilogo, righe per utenza nel tab Righe.
@Component({
  selector: 'app-invoice-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatButtonModule,
    MatTabsModule, MatIconModule, FilterableSelectComponent, EntitySheetComponent, TabLabelComponent, InvoiceLinesTabComponent,
  ],
  styles: [`
    .budget-warning { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 6px; margin-top: 12px; }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './invoice-edit-dialog.component.html'
})
export class InvoiceEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InvoiceEditDialogComponent, Invoice | undefined>);
  private authService = inject(AuthService);
  private navigator = inject(EntityNavigatorService);
  private contractsService = inject(ContractsService);
  private thirdPartiesService = inject(ThirdPartiesService);
  private utilityService = inject(UtilityService);
  private commitmentService = inject(CommitmentService);
  private toast = inject(ToastService);
  private budget = inject(ChapterBudgetService);
  protected data = inject<EditDialogData<Invoice>>(MAT_DIALOG_DATA);

  // Capitoli che con questa fattura superano l'assestato: solo avviso, mai blocco.
  budgetWarnings: BudgetWarning[] = [];
  private budgetCheck$ = new Subject<void>();

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);

  private contracts: Contract[] = [];
  contractOptions: TOption[] = [];
  supplierOptions: TOption[] = [];
  utilityOptions: TOption[] = [];
  commitmentOptions: TOption[] = [];
  supplierLabel: string | null = partyName(this.data.item.supplier ?? this.data.item.contratto?.supplier) || null;
  lines: InvoiceLine[] = [...(this.data.item.lines ?? [])];

  // Protocollo, imponibile, morosità e contratto facoltativi: le fatture
  // importate (es. ACA) hanno solo numero, data e totale documento.
  form = this.fb.group({
    invoice_id: [this.data.item.invoice_id ?? '', Validators.required],
    protocol_number: [this.data.item.protocol_number ?? ''],
    invoice_date: [toLocalDate(this.data.item.invoice_date), Validators.required],
    total_amount: [this.data.item.total_amount ?? null as number | null],
    net_amount_excl_vat: [this.data.item.net_amount_excl_vat ?? null as number | null],
    last_invoice_arrears: [this.data.item.last_invoice_arrears ?? 0 as number | null],
    contratto_id_fk: [this.data.item.contratto_id_fk ?? null as number | null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null as number | null],
    notes_on_invoices: [this.data.item.notes_on_invoices ?? ''],
  });

  constructor() {
    // Lettore: form disabilitato anche a livello programmatico, non solo
    // nascondendo il Salva.
    if (!this.canEdit) this.form.disable();
    this.budgetCheck$.pipe(
      debounceTime(400),
      switchMap(() => {
        const date = this.form.controls.invoice_date.value as Date | null;
        if (!date || !this.lines.length) return of([] as BudgetWarning[]);
        return this.budget.budgetCheck({
          invoice_id: this.isNew ? null : this.data.item.id,
          invoice_date: toIsoDate(date),
          lines: this.lines.map(l => ({
            utility_id_fk: l.utility_id_fk ?? null,
            commitment_id_fk: l.commitment_id_fk ?? null,
            amount: Number(l.amount) || 0,
          })),
        }).pipe(catchError(() => of([] as BudgetWarning[])));
      }),
    ).subscribe(w => this.budgetWarnings = w);
    this.form.controls.invoice_date.valueChanges.subscribe(() => this.checkBudget());
  }

  // Righe, importi, impegni o data cambiati: si ricontrolla l'assestato.
  checkBudget(): void {
    this.budgetCheck$.next();
  }

  eur(n: number): string {
    return n.toLocaleString('it-IT', {style: 'currency', currency: 'EUR'});
  }

  ngOnInit(): void {
    this.checkBudget();
    this.loadContracts();
    this.loadSuppliers();
    this.loadUtilities();
    this.loadCommitments(this.form.controls.contratto_id_fk.value);
    let previousContractId = this.form.controls.contratto_id_fk.value;
    this.form.controls.contratto_id_fk.valueChanges.subscribe(id => {
      const previous = this.contracts.find(c => c.id === previousContractId);
      const contract = this.contracts.find(c => c.id === id);
      previousContractId = id;
      // Il fornitore segue il contratto se era quello del vecchio o non c'era.
      const supplier = this.form.controls.supplier_id_fk;
      if (!supplier.value || supplier.value === previous?.supplier_id_fk) {
        supplier.setValue(contract?.supplier_id_fk ?? null);
        this.supplierLabel = partyName(contract?.supplier) || null;
      }
      this.loadCommitments(id, true);
    });
  }

  private loadContracts(after?: () => void): void {
    this.contractsService.search({deleted: false}).subscribe({
      next: data => {
        this.contracts = data;
        this.contractOptions = data
          .map(c => ({label: c.cig_contract || `Contratto senza CIG (id ${c.id})`, value: c.id, sublabel: partyName(c.supplier) || undefined}))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei contratti:', err)
    });
  }

  // Il fornitore corrente resta tra le opzioni anche se non risulta fornitore
  // (es. persona appena creata dal "+").
  private loadSuppliers(): void {
    this.thirdPartiesService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .filter(p => p.type === 'LEGAL' || p.roles?.includes(PartyRole.SUPPLIER) || p.id === this.form.controls.supplier_id_fk.value)
        .map(p => ({label: partyName(p), value: p.id, sublabel: p.vat_number ?? undefined}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
  }

  newContract(): void {
    const supplier = this.form.controls.supplier_id_fk.value;
    this.navigator.createSupplyContract([], supplier ? {supplier_id_fk: supplier} : {}).subscribe(c => {
      if (!c) return;
      // Il fornitore segue il contratto (valueChanges): serve il contratto tra quelli caricati.
      this.loadContracts(() => this.form.controls.contratto_id_fk.setValue(c.id));
      this.form.controls.contratto_id_fk.markAsDirty();
    });
  }

  newSupplier(text: string): void {
    this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
      if (!p) return;
      this.form.controls.supplier_id_fk.setValue(p.id);
      this.form.controls.supplier_id_fk.markAsDirty();
      this.loadSuppliers();
    });
  }

  onOptionsStale(kind: 'utilities' | 'commitments'): void {
    if (kind === 'utilities') this.loadUtilities();
    else this.loadCommitments(this.form.controls.contratto_id_fk.value);
  }

  private loadUtilities(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: data => this.utilityOptions = data
        .sort((a, b) => a.utility_id.localeCompare(b.utility_id))
        .map(u => ({
          label: u.utility_id,
          value: u.id,
          sublabel: [u.utilityType?.name, u.utility_code ? `cod. ${u.utility_code}` : null].filter(Boolean).join(' · '),
          searchText: `${u.utility_id} ${u.utility_code ?? ''} ${u.meter_number ?? ''}`,
        })),
      error: err => console.error('Errore nel caricamento delle utenze:', err)
    });
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  // Impegni selezionabili sulle righe: solo quelli del contratto della fattura.
  // contractChanged: le righe con impegni di un altro contratto li perdono
  // (altrimenti il select li mostrerebbe vuoti e il Salva darebbe 400).
  private loadCommitments(contractId: number | null, contractChanged = false): void {
    if (!contractId) {
      this.commitmentOptions = [];
      if (contractChanged) this.dropForeignCommitments(new Set());
      return;
    }
    this.commitmentService.list(contractId).subscribe({
      next: list => {
        this.commitmentOptions = list.map(c => ({
          label: `${c.fiscal_year} · ${chapterLabel(c.budgetChapter)}`,
          value: c.id,
          sublabel: c.commitment_number ? `impegno n. ${c.commitment_number}` : undefined,
        }));
        if (contractChanged) this.dropForeignCommitments(new Set(list.map(c => c.id)));
      },
      error: err => console.error('Errore nel caricamento degli impegni:', err)
    });
  }

  private dropForeignCommitments(allowed: Set<number>): void {
    const foreign = this.lines.filter(l => l.commitment_id_fk && !allowed.has(l.commitment_id_fk)).length;
    if (!foreign) return;
    this.lines = this.lines.map(l =>
      l.commitment_id_fk && !allowed.has(l.commitment_id_fk) ? {...l, commitment_id_fk: null, commitment: null} : l);
    this.checkBudget();
    this.toast.add({
      severity: 'warn',
      summary: 'Impegni rimossi dalle righe',
      detail: `${foreign} righe avevano un impegno del contratto precedente: sceglierne uno del nuovo contratto.`,
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const bad = this.lines.findIndex(l => toNumberOrNull(l.amount) === null || isNaN(Number(l.amount)));
    if (bad >= 0) {
      this.toast.add({severity: 'error', summary: `Riga ${bad + 1}: importo obbligatorio`});
      return;
    }
    const v = this.form.getRawValue();
    this.dialogRef.close(plainToInstance(Invoice, {
      id: this.data.item.id,
      ...v,
      protocol_number: v.protocol_number?.trim() || null,
      total_amount: toNumberOrNull(v.total_amount),
      net_amount_excl_vat: toNumberOrNull(v.net_amount_excl_vat),
      last_invoice_arrears: toNumberOrNull(v.last_invoice_arrears) ?? 0,
      lines: this.lines,
    }));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
