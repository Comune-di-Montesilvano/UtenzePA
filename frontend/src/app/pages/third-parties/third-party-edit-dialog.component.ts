import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {hasInvalid, isEditorRole, lastModifiedLabel} from '../../core/components/entity-sheet/sheet-utils';
import {grantStatus, partyRoleBadges, StatusInfo, supplyContractStatus} from '../../core/helpers/entity-status';
import {partyName} from '../../core/helpers/party-name.helper';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ThirdParty} from './entity/third-party.entity';
import {ThirdPartyType, TYPE_LABEL} from './third-party.model';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {ContractsService} from '../contracts/contract.service';
import {Contract} from '../contracts/entity/contract.entity';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';

// Stesse regole del backend (validateThirdParty), che resta la garanzia.
const VAT = /^\d{11}$/;
const CF_PERSON = /^[A-Za-z0-9]{16}$/;

// Gli spazi si tolgono in salvataggio (normalizzazione del backend): il
// formato si controlla sul valore senza spazi, "012 3456 7890" è valido.
function formatIgnoringSpaces(re: RegExp): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().replace(/\s+/g, '');
    return !v || re.test(v) ? null : {pattern: true};
  };
}

@Component({
  selector: 'app-third-party-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatButtonToggleModule,
    MatTabsModule, MatIconModule, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, LinkedTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './third-party-edit-dialog.component.html',
})
export class ThirdPartyEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ThirdPartyEditDialogComponent, ThirdParty | undefined>);
  private authService = inject(AuthService);
  private grantService = inject(UtilizerGrantService);
  private contractsService = inject(ContractsService);
  private consipService = inject(ConsipAgreementService);
  private navigator = inject(EntityNavigatorService);
  protected data = inject<EditDialogData<ThirdParty>>(MAT_DIALOG_DATA);

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);
  readonly types = Object.values(ThirdPartyType);
  readonly typeLabel = TYPE_LABEL;
  readonly roleBadges: StatusInfo[] = partyRoleBadges(this.data.item.roles);

  // Campi cache per app-linked-table (mai getter).
  grants: UtilizerGrant[] = [];
  contracts: Contract[] = [];
  agreements: ConsipAgreement[] = [];

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Tipo', value: g => [g.kind ? KIND_LABEL[g.kind] : '', g.direction ? DIRECTION_LABEL[g.direction] : ''].filter(Boolean).join(' · ')},
    {label: 'Oggetto', value: g => g.subject ?? ''},
    {label: 'Immobili', value: g => (g.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status ?? g.status);
  readonly contractColumns: LinkedColumn<Contract>[] = [
    {label: 'CIG', value: c => c.cig_contract || 'CIG non specificato'},
    {label: 'Ordine', value: c => c.consip_order ?? ''},
  ];
  readonly contractStatusOf = (c: Contract): StatusInfo => supplyContractStatus(c);
  readonly agreementColumns: LinkedColumn<ConsipAgreement>[] = [
    {label: 'Convenzione', value: a => a.name ?? ''},
  ];

  form = this.fb.group({
    type: [this.data.item.type ?? ThirdPartyType.LEGAL, Validators.required],
    company_name: [this.data.item.company_name ?? null as string | null],
    last_name: [this.data.item.last_name ?? null as string | null],
    first_name: [this.data.item.first_name ?? null as string | null],
    vat_number: [this.data.item.vat_number ?? null as string | null],
    tax_code: [this.data.item.tax_code ?? null as string | null],
    address: [this.data.item.address ?? null as string | null],
    city: [this.data.item.city ?? null as string | null],
    postal_code: [this.data.item.postal_code ?? null as string | null],
    email: [this.data.item.email ?? null as string | null, Validators.email],
    pec: [this.data.item.pec ?? null as string | null, Validators.email],
    phone: [this.data.item.phone ?? null as string | null],
    contacts: [this.data.item.contacts ?? null as string | null],
    notes: [this.data.item.notes ?? null as string | null],
  });

  constructor() {
    this.applyTypeRules(this.form.controls.type.value as ThirdPartyType);
    this.form.controls.type.valueChanges.subscribe(t => this.applyTypeRules(t as ThirdPartyType));
    if (!this.canEdit) this.form.disable({emitEvent: false});
  }

  ngOnInit(): void {
    if (this.isNew) return;
    this.loadGrants();
    const id = this.data.item.id;
    this.contractsService.search({deleted: false, supplier_id_fk: id} as never).subscribe(c => this.contracts = c);
    this.consipService.search({deleted: false, supplier_id: id} as never).subscribe(a => this.agreements = a);
  }

  private loadGrants(): void {
    this.grantService.search({party_id: this.data.item.id} as never).subscribe(g => this.grants = g);
  }

  private applyTypeRules(type: ThirdPartyType): void {
    const c = this.form.controls;
    const legal = type === ThirdPartyType.LEGAL;
    c.company_name.setValidators(legal ? [Validators.required] : []);
    c.last_name.setValidators(legal ? [] : [Validators.required]);
    c.first_name.setValidators(legal ? [] : [Validators.required]);
    c.vat_number.setValidators(legal ? [Validators.required, formatIgnoringSpaces(VAT)] : [formatIgnoringSpaces(VAT)]);
    c.tax_code.setValidators(legal ? [] : [Validators.required, formatIgnoringSpaces(CF_PERSON)]);
    for (const name of ['company_name', 'last_name', 'first_name', 'vat_number', 'tax_code'] as const) {
      c[name].updateValueAndValidity({emitEvent: false});
    }
  }

  isLegal(): boolean {
    return this.form.controls.type.value === ThirdPartyType.LEGAL;
  }

  titleText(): string {
    const name = partyName(this.form.getRawValue());
    return name || (this.isNew ? 'Nuovo soggetto terzo' : `Soggetto #${this.data.item.id}`);
  }

  subtitle(): string {
    return TYPE_LABEL[this.form.controls.type.value as ThirdPartyType] ?? '';
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'type', 'company_name', 'last_name', 'first_name', 'vat_number', 'tax_code', 'email', 'pec');
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved) this.loadGrants();
    });
  }

  openContract(id: number): void {
    this.navigator.openSupplyContract(id).subscribe();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Campi vuoti a null: il backend rifiuta '' su email/PEC (IsEmail).
    const raw = Object.fromEntries(
      Object.entries(this.form.getRawValue()).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
    );
    this.dialogRef.close(plainToInstance(ThirdParty, {id: this.data.item.id, ...raw}));
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
