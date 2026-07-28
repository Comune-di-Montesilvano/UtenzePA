import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {InputTextModule} from 'primeng/inputtext';
import {Supplier} from './entity/supplier.entity';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {SkeletonModule} from 'primeng/skeleton';
import {
  italianPostalCodeValidator,
  italianTaxCodeValidator,
  italianVatNumberValidator,
  taxCodeMatchesVatNumberValidator
} from '../../core/validators/italian.validators';

@Component({
             selector: 'app-data-table-suppliers',
             standalone: true,
             imports: [
               ReactiveFormsModule,
               CommonModule,
               TableModule,
               DialogModule,
               ButtonModule,
               SelectModule,
               HasRoleDirective,
               TooltipModule,
               ReadOnlyDirective,
               InputTextModule,
               SkeletonModule
             ],
             templateUrl: './data-table-suppliers.component.html'
           })
export class DataTableSuppliersComponent extends AbstractDataTableComponent<Supplier> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 11}, (_, i) => i);

  constructor(screen: ScreenSizeService) {
    super(screen);
  }

  override itemInstance(): Supplier {
    return Supplier.create();
  }

  protected override buildForm(data?: Partial<Supplier>): void {
    this.form = this.fb.group({
                                supplier_id: [{
                                  value: data?.supplier_id ?? '',
                                  disabled: !this.isNew
                                }, Validators.required],
                                company_name: [data?.company_name ?? '', Validators.required],
                                vat_number: [data?.vat_number, [italianVatNumberValidator()]],
                                tax_code: [data?.tax_code, [italianTaxCodeValidator()]],
                                address: [data?.address],
                                city: [data?.city],
                                postal_code: [data?.postal_code, [italianPostalCodeValidator()]],
                                email: [data?.email],
                                pec: [data?.pec],
                              }, {validators: taxCodeMatchesVatNumberValidator()});
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }
}
