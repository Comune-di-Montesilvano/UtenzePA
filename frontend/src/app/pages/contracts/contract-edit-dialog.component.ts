import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {Utility} from '../utilities/entity/utility.entity';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {Contract} from './entity/contract.entity';
import {CONTRACT_KIND_OPTIONS, ContractKind, isCigRequired} from './contract-kind';
import {AuthService} from '../../services/auth.service';
import {TOption} from '../../core/types/option.interface';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {ConsipAgreementService} from '../consip-agreement/consip-agreement.service';
import {UtilityService} from '../utilities/utility.service';
import {ConsipAgreement} from '../consip-agreement/entity/consip-agreement.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {ValidityBarComponent} from '../../core/components/entity-sheet/validity-bar.component';
import {StatusInfo, supplyContractFlags, supplyContractStatus, utilityStatus} from '../../core/helpers/entity-status';
import {isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {EntityNavigatorService, nameFrom} from '../../core/services/entity-navigator.service';
import {ContractCommitmentsTabComponent} from './commitments/contract-commitments-tab.component';
import {chapterLabel} from './commitments/commitment.model';
import {BudgetChaptersService} from '../budget-chapters/budget-chapters.service';

/** Precompila l'associazione utenze quando aperto dal dettaglio Utenza ("Nuovo contratto"). */
export interface ContractDialogExtra {
  preselectedUtilityIds?: number[];
}

// CIG obbligatorio solo per i contratti ordinari (stessa regola del backend).
function cigRequiredUnlessExempt(group: AbstractControl): ValidationErrors | null {
  const cig = (group.get('cig_contract')?.value ?? '').toString().trim();
  const required = isCigRequired(group.get('contract_kind')?.value);
  const closed = !!group.get('closed')?.value;
  return !cig && required && !closed ? {cigRequired: true} : null;
}

@Component({
  selector: 'app-contract-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatButtonModule, MatCheckboxModule, MatTabsModule, MatIconModule, MatTooltipModule,
    FilterableSelectComponent, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent,
    LinkedTableComponent, ValidityBarComponent, ContractCommitmentsTabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './contract-edit-dialog.component.html'
})
export class ContractEditDialogComponent implements OnInit {
  readonly contractKindOptions = CONTRACT_KIND_OPTIONS;
  readonly isCigRequired = isCigRequired;
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ContractEditDialogComponent, Contract | undefined>);
  private authService = inject(AuthService);
  private thirdPartiesService = inject(ThirdPartiesService);
  private consipService = inject(ConsipAgreementService);
  private utilityService = inject(UtilityService);
  private navigator = inject(EntityNavigatorService);
  private budgetChaptersService = inject(BudgetChaptersService);
  protected data = inject<EditDialogData<Contract> & ContractDialogExtra>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(this.authService.getCurrentUser()?.role);
  readonly lastModified = lastModifiedLabel(this.data.item.update_date, this.data.item.updated_by);

  supplierOptions: TOption[] = [];
  // Tab "Impegni e capitoli": capitoli selezionabili e numero di impegni.
  chapterOptions: TOption[] = [];
  commitmentCount: number | null = null;
  consipAgreementOptions: ConsipAgreement[] = [];
  consipOptions: TOption[] = [];
  // Tutte le utenze: quelle collegate sono form.utility_ids.
  private allUtilities: Utility[] = [];
  utilityOptions: TOption[] = [];
  utilityFilter = '';
  // Campi cache (vedi LinkedTableComponent): aggiornati solo su evento.
  linkedRows: Utility[] = [];
  filteredRows: Utility[] = [];
  utilityPreview: PreviewItem[] = [];

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id},
    {label: 'Tipo', value: u => u.utilityType?.name ?? ''},
    {label: 'Matricola', value: u => u.meter_number ?? ''},
    {label: 'Immobili', value: u => this.assetNames(u)},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  // 'AAAA-MM-GG' letta come giorno locale: con new Date(v) (mezzanotte UTC)
  // NormalizeDate del backend (+1 giorno) farebbe avanzare la data a ogni Salva.
  private toDate(v: unknown): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  form = this.fb.group({
    cig_contract: [this.data.item.cig_contract ?? ''],
    contract_kind: [this.data.item.contract_kind ?? ContractKind.STANDARD],
    maintenance_included: [this.data.item.maintenance_included ?? false],
    closed: [this.data.item.closed ?? false],
    consip_order: [this.data.item.consip_order ?? ''],
    consip_agreement_id: [this.data.item.consip_agreement_id ?? null],
    supplier_id_fk: [this.data.item.supplier_id_fk ?? null],
    supply_start_date: [this.toDate(this.data.item.supply_start_date)],
    supply_expiry_date: [this.toDate(this.data.item.supply_expiry_date)],
    management_expiry_date: [this.toDate(this.data.item.management_expiry_date)],
    takeover_termination_date: [this.toDate(this.data.item.takeover_termination_date)],
    utility_ids: [
      this.data.item.utilities?.map(u => u.id) ?? this.data.preselectedUtilityIds ?? []
    ],
  }, {validators: cigRequiredUnlessExempt});

  constructor() {
    if (!this.canEdit) {
      this.form.disable();
    }
  }

  ngOnInit(): void {
    this.refreshLinks();
    this.loadSuppliers();
    this.loadConsip();
    if (this.canEdit) {
      this.form.controls.consip_agreement_id.valueChanges.subscribe(id => this.onConsipAgreementChange(id));
    }
    if (!this.isNew) {
      this.budgetChaptersService.search({deleted: false}).subscribe({
        next: data => this.chapterOptions = data
          .map(c => ({
            label: chapterLabel(c),
            value: c.id,
            searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        error: err => console.error('Errore nel caricamento dei capitoli:', err)
      });
    }
    this.loadUtilities();
  }

  // Il fornitore corrente resta tra le opzioni anche se non risulta fornitore
  // (es. persona appena creata dal "+").
  private loadSuppliers(): void {
    this.thirdPartiesService.search({deleted: false}).subscribe({
      next: data => this.supplierOptions = data
        .filter(p => p.type === 'LEGAL' || p.roles?.includes(PartyRole.SUPPLIER) || p.id === this.form.controls.supplier_id_fk.value)
        .map(p => ({label: partyName(p), value: p.id, sublabel: p.vat_number ?? undefined}))
        .sort((a, b) => a.label.localeCompare(b.label)),
      error: err => console.error('Errore nel caricamento dei fornitori:', err)
    });
  }

  private loadConsip(after?: () => void): void {
    this.consipService.search({deleted: false}).subscribe({
      next: data => {
        this.consipAgreementOptions = data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        this.consipOptions = this.consipAgreementOptions.map(a => ({
          label: a.name ?? `#${a.id}`, value: a.id, sublabel: a.cig_master ?? undefined,
        }));
        after?.();
      },
      error: err => console.error('Errore nel caricamento delle convenzioni CONSIP:', err)
    });
  }

  newSupplier(text: string): void {
    this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
      if (!p) return;
      this.form.controls.supplier_id_fk.setValue(p.id);
      this.form.controls.supplier_id_fk.markAsDirty();
      this.loadSuppliers();
    });
  }

  newConsip(text: string): void {
    const supplier = this.form.controls.supplier_id_fk.value;
    this.navigator.createConsipAgreement({name: nameFrom(text), ...(supplier ? {supplier_id: supplier} : {})}).subscribe(a => {
      if (!a) return;
      // Il fornitore segue la convenzione e può essere stato creato dentro di
      // essa: si ricaricano anche i fornitori, per mostrarne l'etichetta.
      this.loadConsip(() => {
        this.form.controls.consip_agreement_id.setValue(a.id);
        this.loadSuppliers();
      });
      this.form.controls.consip_agreement_id.markAsDirty();
    });
  }

  newUtility(): void {
    this.navigator.createUtility(Utility.create()).subscribe(u => {
      if (!u) return;
      this.loadUtilities();
      this.addUtility(u.id);
    });
  }

  private loadUtilities(): void {
    this.utilityService.search({deleted: false}).subscribe({
      next: data => {
        this.allUtilities = data.sort((a, b) => a.utility_id.localeCompare(b.utility_id));
        this.utilityOptions = this.allUtilities.map(u => ({
          label: u.utility_id,
          value: u.id,
          sublabel: [u.utilityType?.name, u.meter_number ? `matr. ${u.meter_number}` : null, this.assetNames(u)]
            .filter(Boolean).join(' · '),
          searchText: `${u.utility_id} ${u.meter_number ?? ''} ${this.assetNames(u)}`,
        }));
        this.refreshLinks();
      },
      error: err => console.error('Errore nel caricamento delle utenze:', err)
    });
  }

  private get linkedIds(): number[] {
    return this.form.controls.utility_ids.value ?? [];
  }

  // Finché l'elenco completo non arriva si usano le utenze già presenti sul
  // contratto, così conteggio e tabella non partono vuoti.
  refreshLinks(): void {
    this.linkedRows = this.linkedIds
      .map(id => this.allUtilities.find(u => u.id === id) ?? this.data.item.utilities?.find(u => u.id === id))
      .filter((u): u is Utility => !!u);
    this.utilityPreview = this.linkedRows.map(u => {
      const t = u.utilityType?.hard_type;
      return {
        id: u.id, label: u.utility_id, sublabel: [u.utilityType?.name, this.assetNames(u)].filter(Boolean).join(' · '),
        icon: t ? HardTypeMatIcon[t] : 'electric_meter', color: t ? HardTypeColor[t] : 'var(--entity-utility)',
        status: utilityStatus(u.supply_active),
      };
    });
    this.applyFilter();
  }

  applyFilter(): void {
    const term = this.utilityFilter.trim().toLowerCase();
    this.filteredRows = !term ? this.linkedRows : this.linkedRows
      .filter(u => [u.utility_id, u.meter_number, u.utilityType?.name, this.assetNames(u)]
        .some(v => (v ?? '').toLowerCase().includes(term)));
  }

  assetNames(u: Utility): string {
    return (u.assets ?? []).map(a => a.asset_name).join(', ');
  }

  // Header
  titleText(): string {
    if (this.isNew) return 'Nuovo contratto di fornitura';
    return this.form.controls.cig_contract.value || 'CIG non specificato';
  }

  supplierName(): string {
    const id = this.form.controls.supplier_id_fk.value;
    return this.supplierOptions.find(o => o.value === id)?.label ?? partyName(this.data.item.supplier);
  }

  statusInfo(): StatusInfo {
    return supplyContractStatus(this.form.getRawValue());
  }

  flags(): StatusInfo[] {
    return supplyContractFlags(this.form.getRawValue());
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  private onConsipAgreementChange(selectedAgreementId: number | null): void {
    if (selectedAgreementId) {
      const agreement = this.consipAgreementOptions.find(a => a.id === selectedAgreementId);
      if (agreement?.supplier_id) {
        this.form.patchValue({supplier_id_fk: agreement.supplier_id});
      }
    }
  }

  // Con il filtro attivo il picker esclude solo le righe visibili: un'utenza
  // già collegata ma nascosta dal filtro potrebbe essere riproposta.
  addUtility(id: number): void {
    if (this.linkedIds.includes(id)) return;
    this.form.controls.utility_ids.setValue([...this.linkedIds, id]);
    this.form.markAsDirty();
    this.refreshLinks();
  }

  removeUtility(id: number): void {
    this.form.controls.utility_ids.setValue(this.linkedIds.filter(x => x !== id));
    this.form.markAsDirty();
    this.refreshLinks();
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved) this.loadUtilities();
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
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
