import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {FilterDialogData} from '../../core/components/abstract-search.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';
import {ContractsService} from '../contracts/contract.service';
import {TOption} from '../../core/types/option.interface';

export interface InvoiceFilterValues {
  invoice_id: string | null;
  protocol_number: string | null;
  net_amount_excl_vat: number | null;
  last_invoice_arrears: number | null;
  contratto_id_fk: number | null;
  budget_chapter_ids: number[] | null;
  // In input (data.values) puo' arrivare un Date (prima apertura, dal form)
  // o una stringa locale YYYY-MM-DD (riapertura dopo una ricerca gia' applicata,
  // vedi apply()). In output (dialogRef.close()) e' sempre una stringa locale,
  // per evitare lo shift di un giorno dato dalla conversione UTC di Date.toISOString().
  invoice_date_from: Date | string | null;
  invoice_date_to: Date | string | null;
  notes_on_invoices: string | null;
}

@Component({
  selector: 'app-invoice-filter-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './invoice-filter-dialog.component.html'
})
export class InvoiceFilterDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<InvoiceFilterDialogComponent, InvoiceFilterValues | 'clear'>);
  private contractsService = inject(ContractsService);
  private budgetChapterService = inject(BudgetChaptersService);
  protected data = inject<FilterDialogData<InvoiceFilterValues>>(MAT_DIALOG_DATA);

  contractOptions: TOption[] = [];
  budgetChapterOptions: TOption[] = [];

  form = this.fb.group({
    invoice_id: [this.data.values.invoice_id ?? ''],
    protocol_number: [this.data.values.protocol_number ?? ''],
    net_amount_excl_vat: [this.data.values.net_amount_excl_vat ?? null],
    last_invoice_arrears: [this.data.values.last_invoice_arrears ?? null],
    contratto_id_fk: [this.data.values.contratto_id_fk ?? null],
    budget_chapter_ids: [this.data.values.budget_chapter_ids ?? null],
    invoice_date_from: [this.data.values.invoice_date_from ?? null],
    invoice_date_to: [this.data.values.invoice_date_to ?? null],
    notes_on_invoices: [this.data.values.notes_on_invoices ?? ''],
  });

  ngOnInit(): void {
    this.contractsService.search({deleted: false}).subscribe({
      next: data => this.contractOptions = data
        .map(c => ({label: c.cig_contract || `Contratto #${c.id}`, value: c.id}))
        .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? '')),
      error: err => console.error('Errore nel caricamento dei contratti:', err)
    });
    this.budgetChapterService.search({deleted: false}).subscribe({
      next: data => this.budgetChapterOptions = data
        .map(b => ({label: `${b.chapter_code} - ${b.description}`, value: b.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei Capitoli di Spesa:', err)
    });
  }

  private toLocalDateString(value: Date | string | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toLocaleDateString('en-CA') : value;
  }

  apply(): void {
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      ...raw,
      invoice_date_from: this.toLocalDateString(raw.invoice_date_from),
      invoice_date_to: this.toLocalDateString(raw.invoice_date_to),
    } as InvoiceFilterValues);
  }

  clear(): void {
    this.dialogRef.close('clear');
  }
}
