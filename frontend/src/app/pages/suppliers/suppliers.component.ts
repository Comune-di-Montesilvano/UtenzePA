import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {ButtonModule} from 'primeng/button';
import {TableModule} from 'primeng/table';
import {DataTableSuppliersComponent} from './data-table-suppliers.component';
import {SearchSuppliersComponent} from './search-suppliers.component';
import {MessageService} from 'primeng/api';
import {ToastModule} from 'primeng/toast';
import {SuppliersService} from './suppliers.service';
import {AbstractComponent} from '../../core/components/abstract.component';
import {Supplier} from './entity/supplier.entity';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  providers: [MessageService],
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    TableModule,
    DataTableSuppliersComponent,
    SearchSuppliersComponent,
    ToastModule
  ],
  templateUrl: './suppliers.component.html'
})
export class SuppliersComponent extends AbstractComponent<Supplier> {

  creationResult?: { success: boolean; message?: string };

  get suppliers(): Supplier[] {
    return this.list;
  }

  constructor(protected override service: SuppliersService) {
    super();
  }

  protected override getEntityIdentifier(entity: Supplier): string {
    return entity.supplier_id;
  }

  protected override entityToPayload(entity: Supplier): Partial<Supplier> {
    return {
      supplier_id: entity.supplier_id,
      company_name: entity.company_name,
      vat_number: entity.vat_number,
      tax_code: entity.tax_code,
      address: entity.address,
      city: entity.city,
      postal_code: entity.postal_code,
      email: entity.email,
      pec: entity.pec,
      created_by_user_id: this.userId,
      updated_by_user_id: this.userId
    };
  }

  override onCreate(entity: Supplier) {
    const payload = this.entityToPayload(entity);
    this.service.create(payload).subscribe({
      next: (item: Supplier) => {
        this.list.push(item);
        this.messageService.add({severity: 'success', summary: 'Anagrafica Fornitore creata', detail: this.getEntityIdentifier(item), key: 'global'});
        this.creationResult = {success: true, message: 'Anagrafica Fornitore creata con successo'};
        this.loadAll();
      },
      error: (err: any) => {
        this.creationResult = {success: false};
        this.handleError(err, 'Errore generico nella creazione anagrafica');
      }
    });
  }
}
