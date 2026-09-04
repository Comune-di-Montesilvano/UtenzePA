import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Contract} from './entity/contract.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {TOption} from '../../core/types/option.interface';
import {SuppliersService} from '../suppliers/suppliers.service';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityService} from '../utilities/utility.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';

/** Precompila l'associazione utenze quando aperto dal dettaglio Utenza (Task 13, "+ Nuovo contratto"). */
export interface ContractDialogExtra {
  preselectedUtilityIds?: number[];
}

@Component({
  selector: 'app-contract-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contract-edit-dialog.component.html'
})
export class ContractEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractEditDialogComponent, Contract | undefined>);
  private authService = inject(AuthService);
  private suppliersService = inject(SuppliersService);
  private consipService = inject(ConsipAgreementService);
  private utilityService = inject(UtilityService);
  protected data = inject<EditDialogData<Contract> & ContractDialogExtra>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';

  supplierOptions: TOption[] = [];
  consipAgreementOptions: ConsipAgreement[] = [];
  utilityOptions: TOption[] = [];

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    cig_contract: [this.data.item.cig_contract ?? ''],
    order_number: [this.data.item.order_number ?? ''],
    consip_order: [this.data.item.consip_order ?? ''],
    consip_agreement_id: [this.data.item.consip_agreement_id ?? null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    security_deposit: [this.data.item.security_deposit ?? 0],
    utility_ids: [
      this.data.item.utilities?.map(u => u.id) ?? this.data.preselectedUtilityIds ?? []
    ],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.suppliersService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .map(s => ({label: s.supplier_id, value: s.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
    this.consipService.search({deleted: false}).subscribe({
      next: data => this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
    this.utilityService.search({deleted: false}).subscribe({
      next: data => this.utilityOptions = data
        .map(u => ({label: u.utility_id, value: u.id}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento delle utenze:', err)
    });
  }

  onConsipAgreementChange(event: MatSelectChange): void {
    const selectedAgreementId: number | null = event.value;
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    }
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Contract, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
