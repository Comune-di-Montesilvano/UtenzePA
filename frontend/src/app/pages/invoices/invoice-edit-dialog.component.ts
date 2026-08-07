import {Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {Invoice} from './entity/invoice.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {UtilityService} from '../utilities/utility.service';
import {SuppliersService} from '../suppliers/suppliers.service';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {BudgetChapter} from '../budget-chapters/entity/budget-chapter.entity';
import {TOption} from '../../core/types/option.interface';

@Component({
  selector: 'app-invoice-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent
  ],
  templateUrl: './invoice-edit-dialog.component.html'
})
export class InvoiceEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InvoiceEditDialogComponent, Invoice | undefined>);
  private authService = inject(AuthService);
  private utilityService = inject(UtilityService);
  private suppliersService = inject(SuppliersService);
  private budgetChapterService = inject(BudgetChaptersService);
  protected data = inject<EditDialogData<Invoice>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  utilityOptions: TOption[] = [];
  supplierOptions: TOption[] = [];
  budgetChapterOptions: BudgetChapter[] = [];

  form = this.fb.group({
    invoice_id: [this.data.item.invoice_id ?? '', Validators.required],
    protocol_number: [this.data.item.protocol_number ?? '', Validators.required],
    invoice_date: [this.data.item.invoice_date ? new Date(this.data.item.invoice_date) : null, Validators.required],
    net_amount_excl_vat: [this.data.item.net_amount_excl_vat ?? null, Validators.required],
    last_invoice_arrears: [this.data.item.last_invoice_arrears ?? 0, Validators.required],
    utility_id_fk: [this.data.item.utility_id_fk ?? null, Validators.required],
    supplier_id_fk: [this.data.item.supplier != null ? (this.data.item.supplier_id_fk ?? null) : null],
    notes_on_invoices: [this.data.item.notes_on_invoices ?? ''],
    budget_chapter_ids: [(this.data.item.budget_chapters ?? []).map(bc => bc.id)],
  });

  constructor() {
    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: data => {
        this.utilityOptions = data
          .map(u => ({label: u.utility_id, value: u.id}))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
      },
      error: err => console.error('Errore nel caricamento delle Utenze:', err)
    });
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => {
        this.supplierOptions = data
          .map(s => ({label: s.supplier_id, value: s.id}))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
      },
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data.sort((a, b) => (a.chapter_code ?? '').localeCompare(b.chapter_code ?? '')),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const {budget_chapter_ids, ...rest} = this.form.getRawValue();
    const budgetChapters = (budget_chapter_ids ?? [])
      .map((id: number) => this.budgetChapterOptions.find(bc => bc.id === id))
      .filter((bc: BudgetChapter | undefined): bc is BudgetChapter => bc != null);
    const result = plainToInstance(Invoice, {
      id: this.data.item.id,
      ...rest,
      budget_chapters: budgetChapters,
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
