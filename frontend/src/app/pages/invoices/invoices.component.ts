import {Component} from '@angular/core';
import {InvoicesService} from './invoices.service';
import {DataTableInvoicesComponent} from './data-table-invoices.component';
import {SearchInvoicesComponent} from './search-invoices.component';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Invoice} from './entity/invoice.entity';

@Component({
  selector: 'app-invoices',
  standalone: true,
  imports: [DataTableInvoicesComponent, SearchInvoicesComponent],
  templateUrl: './invoices.component.html'
})
export class InvoicesComponent extends AbstractComponent<Invoice> {

  constructor(protected override service: InvoicesService) {
    super();
  }

  protected override getEntityIdentifier(entity: Invoice): string {
    return entity.invoice_id;
  }

  protected override entityLabel(): string {
    return 'Fattura';
  }
}
