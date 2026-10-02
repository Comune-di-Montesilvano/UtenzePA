import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {AssetService} from '../assets/asset.service';
import {UtilizerService} from '../utilizer/utilizer.service';
import {UtilizerGrantService} from './utilizer-grant.service';
import {TOption} from '../../core/types/option.interface';
import {StringHelper} from '../../core/helpers/string.helper';
import {toIsoDate} from '../utilities/consumptions/consumption.model';
import {
  ContractDirection,
  ContractKind,
  ContractStatus,
  DIRECTION_LABEL,
  formatDateIt,
  formatEuro,
  KIND_LABEL,
  PERIOD_LABEL,
  RentPeriod,
  STATUS_LABEL,
} from './real-estate-contract.model';

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map(value => ({value, label: labels[value]}));

// Stessi moltiplicatori del backend (real-estate-contract.calc.ts).
const PERIOD_FACTOR: Record<RentPeriod, number> = {
  MONTHLY: 12, BIMONTHLY: 6, QUARTERLY: 4, SEMIANNUAL: 2, ANNUAL: 1, ONE_OFF: 0,
};

@Component({
  selector: 'app-utilizer-grant-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatTabsModule,
    MatIconModule,
    HasRoleDirective,
    ReadOnlyDirective,
    FilterableSelectComponent,
    MultiSelectComponent,
    EntityHistoryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './utilizer-grant-edit-dialog.component.html'
})
export class UtilizerGrantEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<UtilizerGrantEditDialogComponent, UtilizerGrant | undefined>);
  private authService = inject(AuthService);
  private assetService = inject(AssetService);
  private utilizerService = inject(UtilizerService);
  private grantService = inject(UtilizerGrantService);
  protected data = inject<EditDialogData<UtilizerGrant>>(MAT_DIALOG_DATA);

  readonly item = this.data.item;
  isNew = this.data.mode === 'create';
  assetOptions: TOption[] = [];
  utilizerOptions: TOption[] = [];
  parentOptions: TOption[] = [];

  readonly directionOptions = options(DIRECTION_LABEL);
  readonly kindOptions = options(KIND_LABEL);
  readonly periodOptions = options(PERIOD_LABEL);
  readonly statusOptions = options({
    ACTIVE: 'Attivo', RETURNED: 'Restituito', TERMINATED: 'Cessato', DISPUTED: 'In contenzioso',
  } as Record<ContractStatus, string>);
  readonly dateIt = formatDateIt;

  kindText(g: UtilizerGrant): string {
    return g.kind ? KIND_LABEL[g.kind] : '';
  }

  declaredStatusText(g: UtilizerGrant): string {
    return g.status ? STATUS_LABEL[g.status] : '';
  }

  computedStatusText(): string {
    return this.item.computed_status ? STATUS_LABEL[this.item.computed_status] : '';
  }

  private toDate(iso?: string | null): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  form = this.fb.group({
    direction: [(this.item.direction ?? 'ACTIVE') as ContractDirection, Validators.required],
    kind: [(this.item.kind ?? 'CONCESSION') as ContractKind, Validators.required],
    status: [(this.item.status ?? 'ACTIVE') as ContractStatus, Validators.required],
    utilizer_id_fk: [this.item.utilizer_id_fk ?? null, Validators.required],
    subject: [this.item.subject ?? ''],
    department: [this.item.department ?? ''],
    concession_act: [this.item.concession_act ?? ''],
    usage_type: [this.item.usage_type ?? ''],
    rent_amount: [this.item.rent_amount ?? null as number | null, Validators.min(0)],
    rent_period: [this.item.rent_period ?? null as RentPeriod | null],
    vat_applicable: [this.item.vat_applicable ?? false],
    start_date: [this.toDate(this.item.start_date)],
    end_date: [this.toDate(this.item.end_date)],
    tacit_renewal: [this.item.tacit_renewal ?? false],
    renewal_months: [this.item.renewal_months ?? null as number | null, Validators.min(1)],
    notice_months: [this.item.notice_months ?? null as number | null, Validators.min(0)],
    utilities_to_be_taken_over: [this.item.utilities_to_be_taken_over ?? false],
    registration_ref: [this.item.registration_ref ?? ''],
    cadastral_ref: [this.item.cadastral_ref ?? ''],
    area_sqm: [this.item.area_sqm ?? null as number | null, Validators.min(0)],
    notes: [this.item.notes ?? ''],
    asset_ids: [this.item.asset_ids ?? (this.item.assets ?? []).map(a => a.id)],
    parent_contract_id: [this.item.parent_contract_id ?? null as number | null],
  });

  constructor() {
    // Lettore: form disabilitato anche programmaticamente (ReadOnlyDirective
    // sul <form> imposta solo pointer-events:none).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento degli immobili:', err),
    });

    this.utilizerService.search({deleted: false}).subscribe({
      next: (data) => {
        this.utilizerOptions = data
          .map(u => ({label: StringHelper.truncateAt(u.name, 100), value: u.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento delle controparti:', err),
    });

    // Candidati padre: non sé stesso, non un contratto che ha già un padre.
    this.grantService.search({} as never).subscribe({
      next: (data) => {
        this.parentOptions = data
          .filter(g => g.id !== this.item.id && !g.parent_contract_id)
          .map(g => ({
            label: `#${g.id} ${g.utilizer?.name ?? ''}${g.subject ? ' — ' + g.subject : ''}`,
            value: g.id,
            sublabel: g.kind ? KIND_LABEL[g.kind] : undefined,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei contratti:', err),
    });
  }

  annualPreview(): string {
    const v = this.form.getRawValue();
    if (v.rent_amount === null || v.rent_amount === undefined || `${v.rent_amount}` === '' || !v.rent_period) return '';
    return `Canone annuo: ${formatEuro(Number(v.rent_amount) * PERIOD_FACTOR[v.rent_period])}`;
  }

  save(): void {
    if (!this.form.valid) return;
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const num = (n: number | null | undefined) => (n === null || n === undefined || `${n}` === '' ? null : Number(n));
    const result = plainToInstance(UtilizerGrant, {
      id: this.item.id,
      ...v,
      subject: text(v.subject),
      department: text(v.department),
      concession_act: text(v.concession_act) ?? undefined,
      usage_type: text(v.usage_type) ?? undefined,
      registration_ref: text(v.registration_ref),
      cadastral_ref: text(v.cadastral_ref),
      notes: text(v.notes),
      rent_amount: num(v.rent_amount),
      area_sqm: num(v.area_sqm),
      start_date: v.start_date ? toIsoDate(v.start_date) : null,
      end_date: v.end_date ? toIsoDate(v.end_date) : null,
      renewal_months: v.tacit_renewal ? num(v.renewal_months) : null,
      notice_months: v.tacit_renewal ? num(v.notice_months) : null,
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
