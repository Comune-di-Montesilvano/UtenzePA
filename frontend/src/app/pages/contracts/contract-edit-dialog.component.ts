import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule, MatSelectChange} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {FormsModule} from '@angular/forms';
import {Utility} from '../utilities/entity/utility.entity';
import {AbstractControl, ValidationErrors} from '@angular/forms';
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

// CIG obbligatorio salvo contratto escluso (stessa regola del backend).
function cigRequiredUnlessExempt(group: AbstractControl): ValidationErrors | null {
  const cig = (group.get('cig_contract')?.value ?? '').toString().trim();
  const exempt = !!group.get('cig_exempt')?.value;
  return !cig && !exempt ? {cigRequired: true} : null;
}

@Component({
  selector: 'app-contract-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, MatCheckboxModule, MatTabsModule, MatIconModule, MatTooltipModule,
    FormsModule, HasRoleDirective, ReadOnlyDirective, FilterableSelectComponent
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
  // Tutte le utenze (per la tab Utenze): quelle collegate sono
  // form.utility_ids, le altre sono candidate da aggiungere.
  private allUtilities: Utility[] = [];
  utilityFilter = '';
  utilityToAdd: number | null = null;
  // Calcolate solo al cambio dei collegamenti: una lista nuova a ogni change
  // detection azzererebbe il filtro del FilterableSelect mentre si digita.
  candidateOptions: TOption[] = [];

  private toDate(v: unknown): Date | null {
    return v ? new Date(v as string) : null;
  }

  form = this.fb.group({
    cig_contract: [this.data.item.cig_contract ?? ''],
    cig_exempt: [this.data.item.cig_exempt ?? false],
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
  }, {validators: cigRequiredUnlessExempt});

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
      next: data => {
        this.allUtilities = data.sort((a, b) => a.utility_id.localeCompare(b.utility_id));
        this.refreshCandidates();
      },
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

  private get linkedIds(): number[] {
    return this.form.controls.utility_ids.value ?? [];
  }

  get linkedCount(): number {
    return this.linkedIds.length;
  }

  linkedUtilities(): Utility[] {
    const ids = new Set(this.linkedIds);
    const term = this.utilityFilter.trim().toLowerCase();
    return this.allUtilities
      .filter(u => ids.has(u.id))
      .filter(u => !term || [u.utility_id, u.meter_number, u.utilityType?.name, this.assetNames(u)]
        .some(v => (v ?? '').toLowerCase().includes(term)));
  }

  // Opzioni per aggiungere: solo utenze non ancora collegate.
  private refreshCandidates(): void {
    const ids = new Set(this.linkedIds);
    this.candidateOptions = this.allUtilities
      .filter(u => !ids.has(u.id))
      .map(u => ({
        label: u.utility_id,
        value: u.id,
        sublabel: [u.utilityType?.name, u.meter_number ? `matr. ${u.meter_number}` : null, this.assetNames(u)]
          .filter(Boolean).join(' · '),
        searchText: `${u.utility_id} ${u.meter_number ?? ''} ${this.assetNames(u)}`,
      }));
  }

  assetNames(u: Utility): string {
    return (u.assets ?? []).map(a => a.asset_name).join(', ');
  }

  addUtility(): void {
    if (this.utilityToAdd === null) return;
    this.form.controls.utility_ids.setValue([...this.linkedIds, this.utilityToAdd]);
    this.form.markAsDirty();
    this.utilityToAdd = null;
    this.refreshCandidates();
  }

  removeUtility(id: number): void {
    this.form.controls.utility_ids.setValue(this.linkedIds.filter(x => x !== id));
    this.form.markAsDirty();
    this.refreshCandidates();
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
