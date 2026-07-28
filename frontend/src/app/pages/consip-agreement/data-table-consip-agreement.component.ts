import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {TableModule} from 'primeng/table';
import {DialogModule} from 'primeng/dialog';
import {ButtonModule} from 'primeng/button';
import {ReactiveFormsModule, Validators} from '@angular/forms';
import {SelectModule} from 'primeng/select';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {SuppliersService} from '../suppliers/suppliers.service';
import {TooltipModule} from 'primeng/tooltip';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {ScreenSizeService} from '../../services/screen-size.service';
import {DatePicker} from 'primeng/datepicker';
import {InputText} from 'primeng/inputtext';
import {ConsipAgreement} from './entity/consip-agreement.entity';
import {BooleanYesNoPipe} from '../../core/pipes/boolean-yes-no-pipe';
import {AbstractDataTableComponent} from '../../core/components/abstract-data-table.component';
import {Supplier} from '../suppliers/entity/supplier.entity';
import {DateHelper} from '../../core/helpers/date.helper';
import {SkeletonModule} from 'primeng/skeleton';

@Component({
             selector: 'app-data-table-consip-agreement',
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
               DatePicker,
               InputText,
               BooleanYesNoPipe,
               SkeletonModule
             ],
             templateUrl: './data-table-consip-agreement.component.html'
           })
export class DataTableConsipAgreementComponent extends AbstractDataTableComponent<ConsipAgreement> {

  readonly skeletonRows = Array(10).fill({});
  readonly skeletonCols = Array.from({length: 7}, (_, i) => i);

  supplierOptions: Supplier[] = [];

  safeguardOptions = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];

  override ngOnInit() {
    super.ngOnInit();
    this.loadSuppliers();
  }

  constructor(screen: ScreenSizeService, private readonly supplierService: SuppliersService) {
    super(screen);
  }

  loadSuppliers() {
    this.supplierService.search({deleted: false}).subscribe({
      next: (data) => { this.supplierOptions = data; },
      error: (err) => { console.error('Errore nel caricamento dei fornitori:', err); }
    });
  }

  override itemInstance(): ConsipAgreement {
    return ConsipAgreement.create();
  }

  protected override buildForm(data?: Partial<ConsipAgreement>): void {
    this.form = this.fb.group({
      name:            [data?.name            ?? '', Validators.required],
      cig_master:      [data?.cig_master      ?? '', Validators.required],
      expiration_date: [data?.expiration_date ? DateHelper.isoToLocalDate(data.expiration_date as any) : null, Validators.required],
      safeguard:       [data?.safeguard       ?? null],
      description:     [data?.description     ?? ''],
      supplier_id:     [data?.supplier_id     ?? null, Validators.required],
    });
  }

  protected override prepareFormValue(): Record<string, any> {
    const values = { ...this.form.value };
    values.expiration_date = DateHelper.toLocalIsoString(values.expiration_date);
    return values;
  }

  override isFormValid(): boolean {
    return this.form?.valid ?? false;
  }

}
