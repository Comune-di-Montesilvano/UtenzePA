import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InvoicesService } from './invoices.service';
import { DataTableInvoicesComponent } from './data-table-invoices.component';
import { SearchInvoicesComponent } from './search-invoices.component';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AbstractComponent } from '../../core/components/abstract.component';
import { Invoice } from './entity/invoice.entity';

@Component({
  selector: 'app-invoices',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    DataTableInvoicesComponent,
    ToastModule,
    SearchInvoicesComponent
  ],
  templateUrl: './invoices.component.html'
})
export class InvoicesComponent extends AbstractComponent<Invoice> {

  creationResult?: { success: boolean; message?: string };

  constructor(protected override service: InvoicesService) {
    super();
  }

  protected override getEntityIdentifier(entity: Invoice): string {
    return entity.invoice_id;
  }

  private normalizeDecimalString(value: any): any {
    if (typeof value !== 'string') return value;
    return value.replace(',', '.');
  }

  private cleanAndConvertNumericFields(invoice: any): void {
    ['net_amount_excl_vat', 'last_invoice_arrears'].forEach(field => {
      const value = invoice[field];
      if (value === null || value === undefined || value === '') {
        invoice[field] = null;
        return;
      }
      if (typeof value === 'string') {
        const cleaned = parseFloat(value.replace(/\./g, '').replace(/,/g, '.'));
        invoice[field] = isNaN(cleaned) ? null : cleaned;
      }
    });
  }

  override onSearch(filters: any): void {
    // quick search: delegate to parent
    if (
      Object.keys(filters).length === 1 &&
      (filters.hasOwnProperty('qsearch') || filters.hasOwnProperty('text'))
    ) {
      super.onSearch({qsearch: filters.qsearch ?? filters.text});
      return;
    }

    // full filter search: preprocess then delegate
    const f: any = {...filters};

    if (f.invoice_date_from instanceof Date) {
      f.invoice_date_from = f.invoice_date_from.toLocaleDateString('en-CA');
    }
    if (f.invoice_date_to instanceof Date) {
      f.invoice_date_to = f.invoice_date_to.toLocaleDateString('en-CA');
    }

    f.net_amount_excl_vat = this.normalizeDecimalString(f.net_amount_excl_vat);
    f.last_invoice_arrears = this.normalizeDecimalString(f.last_invoice_arrears);

    // remove empty values twice (after normalization)
    Object.keys(f).forEach(k => {
      if (f[k] === '' || f[k] === null || f[k] === undefined) delete f[k];
    });

    super.onSearch(f);
  }

  override onSave(invoice: Invoice): void {
    this.cleanAndConvertNumericFields(invoice);
    super.onSave(invoice);
  }

  override onCreate(invoice: Invoice): void {
    this.cleanAndConvertNumericFields(invoice);
    this.service.create(invoice).subscribe({
      next: (item: Invoice) => {
        this.list.push(item);
        this.messageService.add({
          severity: 'success',
          summary: 'Fattura creata',
          detail: this.getEntityIdentifier(item),
          key: 'global'
        });
        this.creationResult = {success: true, message: 'Fattura creata con successo'};
        this.loadAll();
      },
      error: (err: any) => {
        this.handleError(err, 'Errore generico nella creazione Fattura');
        this.creationResult = {success: false};
      }
    });
  }
}
