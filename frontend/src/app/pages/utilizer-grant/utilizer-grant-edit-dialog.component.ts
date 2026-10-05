import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {UtilizerGrant} from './entity/utilizer-grant.entity';
import {AuthService} from '../../services/auth.service';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Asset} from '../assets/entity/asset.entity';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {ValidityBarComponent} from '../../core/components/entity-sheet/validity-bar.component';
import {assetStatus, costStatus, grantFlags, grantStatus, StatusInfo} from '../../core/helpers/entity-status';
import {UtilityService} from '../utilities/utility.service';
import {Utility} from '../utilities/entity/utility.entity';
import {hasAnyValue, hasInvalid, isEditorRole, lastModifiedLabel} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {AssetService} from '../assets/asset.service';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {ThirdPartyType, TYPE_LABEL} from '../third-parties/third-party.model';
import {partyName, partyNames} from '../../core/helpers/party-name.helper';
import {MultiSelectComponent} from '../../core/components/multi-select.component';
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

// Almeno una parte: Validators.required considera valido un array vuoto.
const atLeastOne = (c: AbstractControl): ValidationErrors | null =>
  Array.isArray(c.value) && c.value.length > 0 ? null : {required: true};

@Component({
  selector: 'app-utilizer-grant-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MultiSelectComponent,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatTabsModule,
    MatIconModule,
    MatTooltipModule,
    FilterableSelectComponent,
    EntitySheetComponent,
    StatusBadgeComponent,
    TabLabelComponent,
    LinkedTableComponent,
    ValidityBarComponent,
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
  private thirdPartiesService = inject(ThirdPartiesService);
  private grantService = inject(UtilizerGrantService);
  protected data = inject<EditDialogData<UtilizerGrant>>(MAT_DIALOG_DATA);

  readonly item = this.data.item;
  private navigator = inject(EntityNavigatorService);
  private utilityService = inject(UtilityService);

  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.item.update_date, this.item.updated_by);

  private allAssets: Asset[] = [];
  assetRows: Asset[] = [];
  childRows: UtilizerGrant[] = (this.item.children ?? []).filter(c => !c.deleted);

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  // Utenze degli immobili del contratto con lo stato "a carico di": la
  // voltura si segna dalla scheda dell'utenza.
  utilityRows: Utility[] = [];
  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? ''},
    {label: 'Tipo', value: u => u.utilityType?.name ?? ''},
    {label: 'Volturata a', value: u => u.cost_info?.transferred_to?.name ?? ''},
  ];
  readonly utilityStatusOf = (u: Utility): StatusInfo => costStatus(u.cost_info);

  readonly childColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: '#', value: c => String(c.id)},
    {label: 'Parti', value: c => partyNames(c.parties)},
    {label: 'Tipo', value: c => this.kindText(c)},
  ];
  readonly childStatusOf = (c: UtilizerGrant): StatusInfo => grantStatus(c.computed_status ?? c.status);
  isNew = this.data.mode === 'create';
  assetOptions: TOption[] = [];
  partyOptions: TOption[] = [];
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
    party_ids: [
      this.item.party_ids?.length ? this.item.party_ids : (this.item.parties ?? []).map(p => p.id),
      atLeastOne,
    ],
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
    maintenance_by_counterparty: [this.item.maintenance_by_counterparty ?? false],
    registration_ref: [this.item.registration_ref ?? ''],
    cadastral_ref: [this.item.cadastral_ref ?? ''],
    area_sqm: [this.item.area_sqm ?? null as number | null, Validators.min(0)],
    notes: [this.item.notes ?? ''],
    asset_ids: [this.item.asset_ids ?? (this.item.assets ?? []).map(a => a.id)],
    parent_contract_id: [this.item.parent_contract_id ?? null as number | null],
  });

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    } else {
      // Durata rinnovo e preavviso contano solo col rinnovo tacito: nascosti
      // ma validi (es. 0 da dati vecchi) bloccherebbero il Salva senza nulla
      // di visibile. Il payload li azzera comunque senza rinnovo tacito.
      this.syncRenewalFields();
      this.form.controls.tacit_renewal.valueChanges.subscribe(() => this.syncRenewalFields());
    }
  }

  ngOnInit(): void {
    this.refreshAssets();
    this.loadUtilities();
    this.loadAssets();
    this.loadParties();

    // Candidati padre: non sé stesso, non un contratto che ha già un padre.
    this.grantService.search({} as never).subscribe({
      next: (data) => {
        this.parentOptions = data
          .filter(g => g.id !== this.item.id && !g.parent_contract_id)
          .map(g => ({
            label: `#${g.id} ${partyNames(g.parties)}${g.subject ? ' — ' + g.subject : ''}`,
            value: g.id,
            sublabel: g.kind ? KIND_LABEL[g.kind] : undefined,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei contratti:', err),
    });
  }

  // Immobili salvati del contratto: una nuova utenza dal tab Utenze nasce su questi.
  readonly savedAssetIds: number[] = this.item.asset_ids ?? (this.item.assets ?? []).map(a => a.id);

  private loadAssets(): void {
    this.assetService.search({deleted: false}).subscribe({
      next: (data) => {
        this.allAssets = data;
        this.assetOptions = data
          .map(a => ({label: a.asset_name, value: a.id}))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshAssets();
      },
      error: (err) => console.error('Errore nel caricamento degli immobili:', err),
    });
  }

  private loadParties(): void {
    this.thirdPartiesService.search({deleted: false}).subscribe({
      next: (data) => {
        this.partyOptions = data
          .map(p => ({
            label: StringHelper.truncateAt(partyName(p), 100),
            value: p.id,
            sublabel: TYPE_LABEL[p.type as ThirdPartyType],
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      },
      error: (err) => console.error('Errore nel caricamento dei soggetti:', err),
    });
  }

  newParty(): void {
    this.navigator.createThirdParty().subscribe(p => {
      if (!p) return;
      const c = this.form.controls.party_ids;
      c.setValue([...(c.value ?? []), p.id]);
      c.markAsDirty();
      this.loadParties();
    });
  }

  newAsset(): void {
    this.navigator.createAsset().subscribe(a => {
      if (!a) return;
      this.loadAssets();
      this.addAsset(a.id);
    });
  }

  newUtility(): void {
    this.navigator.createUtility(Utility.create({asset_ids: this.savedAssetIds})).subscribe(u => {
      if (u) this.loadUtilities();
    });
  }

  annualPreview(): string {
    const v = this.form.getRawValue();
    if (v.rent_amount === null || v.rent_amount === undefined || `${v.rent_amount}` === '' || !v.rent_period) return '';
    return `Canone annuo: ${formatEuro(Number(v.rent_amount) * PERIOD_FACTOR[v.rent_period])}`;
  }

  private syncRenewalFields(): void {
    const on = !!this.form.controls.tacit_renewal.value;
    for (const c of [this.form.controls.renewal_months, this.form.controls.notice_months]) {
      if (on) c.enable({emitEvent: false});
      else c.disable({emitEvent: false});
    }
  }

    refreshAssets(): void {
    const ids = (this.form.controls.asset_ids.value ?? []) as number[];
    this.assetRows = ids
      .map(id => this.allAssets.find(a => a.id === id) ?? this.item.assets?.find(a => a.id === id))
      .filter((a): a is Asset => !!a);
  }

  private setAssetIds(ids: number[]): void {
    const c = this.form.controls.asset_ids;
    c.setValue(ids);
    c.markAsDirty();
    c.markAsTouched();
    this.refreshAssets();
  }

  addAsset(id: number): void {
    const ids = (this.form.controls.asset_ids.value ?? []) as number[];
    if (!ids.includes(id)) this.setAssetIds([...ids, id]);
  }

  unlinkAsset(id: number): void {
    this.setAssetIds(((this.form.controls.asset_ids.value ?? []) as number[]).filter(x => x !== id));
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe();
  }

  private loadUtilities(): void {
    if (this.isNew) return;
    this.utilityService.search({grant_id: this.item.id, deleted: false} as never).subscribe({
      next: rows => this.utilityRows = rows,
      error: err => console.error('Errore nel caricamento delle utenze del contratto:', err),
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.loadUtilities();
    });
  }

  openGrant(id: number | null | undefined): void {
    if (id) this.navigator.openGrant(id).subscribe();
  }

  partyLabel(id: number): string {
    return this.partyOptions.find(o => o.value === id)?.label ?? `#${id}`;
  }

  openParty(id: number): void {
    this.navigator.openThirdParty(id).subscribe();
  }

  // Header
  titleText(): string {
    if (this.isNew) return 'Nuovo contratto immobiliare';
    const ids = this.form.controls.party_ids.value ?? [];
    const names = ids.map(id => this.partyOptions.find(o => o.value === id)?.label).filter(Boolean).join(', ')
      || partyNames(this.item.parties);
    const kind = this.form.controls.kind.value ? KIND_LABEL[this.form.controls.kind.value as ContractKind] : '';
    return [names, kind].filter(Boolean).join(' — ') || `Contratto immobiliare #${this.item.id}`;
  }

  headerIcon(): string {
    return this.form.controls.direction.value === 'PASSIVE' ? 'call_made' : 'call_received';
  }

  // Badge: stato calcolato dal server, salvo nuovo contratto o stato appena
  // cambiato nel form (allora si mostra quello dichiarato).
  statusInfo(): StatusInfo {
    const declared = this.form.controls.status.value as ContractStatus;
    if (this.isNew || this.form.controls.status.dirty || !this.item.computed_status) return grantStatus(declared);
    return grantStatus(this.item.computed_status);
  }

  flags(): StatusInfo[] {
    return this.isNew ? [] : grantFlags(this.form.controls.status.value as ContractStatus, this.item.computed_status);
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  filled(...names: string[]): boolean {
    return hasAnyValue(this.form, ...names);
  }

  linkedCount(): number {
    return this.childRows.length + (this.form.controls.parent_contract_id.value ? 1 : 0);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
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
