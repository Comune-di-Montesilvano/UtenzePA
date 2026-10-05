import {Component, ChangeDetectionStrategy, inject} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import type {FilterValues} from '../../core/components/list/filter-def';
import {InvoicesService} from './invoices.service';
import {DataTableInvoicesComponent} from './data-table-invoices.component';
import {ListFiltersComponent} from '../../core/components/list/list-filters.component';
import {invoiceFilters} from './invoices-filters';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Invoice} from './entity/invoice.entity';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [DataTableInvoicesComponent, ListFiltersComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './invoices.component.html'
})
export class InvoicesComponent extends AbstractComponent<Invoice> {

  constructor(protected override service: InvoicesService) {
    super();
  }

  override filterDefs = invoiceFilters();
  private route = inject(ActivatedRoute);

  override ngOnInit(): void {
    this.initFromRoute(this.route);
  }

  // Con le date impostate l'anno non vale più: si toglie anche il suo chip.
  override onFiltersChange(values: FilterValues): void {
    const range = values['invoice_date_range'] as unknown[] | undefined;
    const next = range?.some(Boolean) && values['year'] ? {...values, year: null} : values;
    super.onFiltersChange(next);
  }

  // "Anno" e "Data fattura" sono filtri della UI: l'API vuole invoice_date_from/to.
  // Le date esplicite vincono sull'anno.
  protected override mapSearchParams(p: Record<string, unknown>): Record<string, unknown> {
    const {year, invoice_date_range, ...rest} = p as {year?: number; invoice_date_range?: string[]} & Record<string, unknown>;
    const [from, to] = invoice_date_range ?? [];
    if (from || to) {
      if (from) rest['invoice_date_from'] = from;
      if (to) rest['invoice_date_to'] = to;
    } else if (year) {
      rest['invoice_date_from'] = `${year}-01-01`;
      rest['invoice_date_to'] = `${year}-12-31`;
    }
    return rest;
  }

  protected override getEntityIdentifier(entity: Invoice): string {
    return entity.invoice_id;
  }

  protected override entityLabel(): string {
    return 'Fattura';
  }
}
