import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTabsModule} from '@angular/material/tabs';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {dateIt, hasInvalid, isEditorRole, SHEET_REFRESH} from '../../core/components/entity-sheet/sheet-utils';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import type {StatusInfo} from '../../core/helpers/entity-status';
import {partyName} from '../../core/helpers/party-name.helper';
import {EntityNavigatorService, nameFrom} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import type {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {AttachmentsComponent} from '../attachments/attachments.component';
import {formatEuro} from '../budget-chapters/spending/budget-chapter-spending.service';
import {Commitment} from '../commitments/commitment.model';
import {ContractsService} from '../contracts/contract.service';
import type {Contract} from '../contracts/entity/contract.entity';
import {ThirdPartiesService} from '../third-parties/third-parties.service';
import {PartyRole} from '../third-parties/third-party.model';
import {AgreementCommitments, ConsipAgreementService} from './consip-agreement.service';
import {AgreementContract, ConsipAgreement} from './entity/consip-agreement.entity';

type ContractRow = {id: number; order: string; cig: string; period: string; closed: boolean};

// Scheda della convenzione CONSIP: dati, contratti di fornitura collegati
// (consip_agreement_id del contratto), impegni dei suoi contratti, documenti.
@Component({
  selector: 'app-consip-agreement-sheet',
  standalone: true,
  imports: [
    ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatDatepickerModule, MatTabsModule, MatIconModule, EntitySheetComponent, StatusBadgeComponent, TabLabelComponent,
    LinkedTableComponent, FilterableSelectComponent, AttachmentsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './consip-agreement-sheet.component.html',
  styles: [`
    .agreement-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .agreement-totals > div { display: flex; flex-direction: column; gap: 2px; }
  `],
})
export class ConsipAgreementSheetComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ConsipAgreementSheetComponent, ConsipAgreement | typeof SHEET_REFRESH | undefined>);
  private service = inject(ConsipAgreementService);
  private parties = inject(ThirdPartiesService);
  private contractsService = inject(ContractsService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);
  protected data = inject<EditDialogData<ConsipAgreement>>(MAT_DIALOG_DATA);

  readonly isNew = this.data.mode === 'create';
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);
  readonly eur = formatEuro;

  // Campi cache (mai getter) per app-linked-table e le select.
  supplierOptions: TOption[] = [];
  contractRows: ContractRow[] = [];
  contractOptions: TOption[] = [];
  commitments: Commitment[] = [];
  totals: AgreementCommitments['totals'] | null = null;
  status: StatusInfo | null = null;
  // Contratti collegati/scollegati da questa scheda: l'elenco va ricaricato.
  private touched = false;

  readonly safeguardOptions = [{label: 'Sì', value: true}, {label: 'No', value: false}];

  readonly contractColumns: LinkedColumn<ContractRow>[] = [
    {label: 'Ordine', value: r => r.order},
    {label: 'CIG', value: r => r.cig},
    {label: 'Periodo', value: r => r.period},
    {label: 'Stato', value: r => (r.closed ? 'Chiuso' : 'Aperto')},
  ];

  readonly commitmentColumns: LinkedColumn<Commitment>[] = [
    {label: 'Numero', value: c => c.label},
    {label: 'Competenza', value: c => String(c.fiscal_year)},
    {label: 'Capitolo', value: c => c.chapter_label},
    {label: 'Importo', value: c => (c.amount === null ? 'senza importo' : formatEuro(c.amount))},
    {label: 'Speso', value: c => formatEuro(c.spent)},
    {label: 'Rimanenza', value: c => (c.remaining === null ? '—' : formatEuro(c.remaining))},
  ];

  readonly commitmentStatus = (c: Commitment): StatusInfo | null =>
    c.remaining !== null && c.remaining < 0 ? {tone: 'danger', label: 'Sforato', icon: 'report'} : null;

  form = this.fb.group({
    name: [this.data.item.name ?? '', Validators.required],
    cig_master: [this.data.item.cig_master ?? '', [Validators.required, Validators.maxLength(10)]],
    expiration_date: [this.data.item.expiration_date ?? null, Validators.required],
    safeguard: [this.normalizeSafeguard(this.data.item.safeguard)],
    description: [this.data.item.description ?? ''],
    supplier_id: [this.data.item.supplier_id ?? null, Validators.required],
  });

  constructor() {
    if (!this.canEdit) this.form.disable();
    this.status = this.statusOf(this.data.item.expiration_date);
  }

  ngOnInit(): void {
    this.loadSuppliers();
    if (!this.isNew) {
      this.loadContracts();
      this.loadCommitments();
    }
  }

  private statusOf(expiry: Date | string | null | undefined): StatusInfo | null {
    if (this.isNew || !expiry) return null;
    const d = new Date(expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today
      ? {tone: 'off', label: 'Scaduta', icon: 'event_busy', tooltip: `Scaduta il ${dateIt(expiry)}`}
      : {tone: 'ok', label: 'In corso', icon: 'event_available', tooltip: `Scade il ${dateIt(expiry)}`};
  }

  // Il fornitore corrente resta tra le opzioni anche se non risulta fornitore.
  private loadSuppliers(after?: () => void): void {
    this.parties.search({deleted: false}).subscribe({
      next: data => {
        this.supplierOptions = data
          .filter(p => p.type === 'LEGAL' || p.roles?.includes(PartyRole.SUPPLIER) || p.id === this.form.controls.supplier_id.value)
          .map(p => ({label: partyName(p), value: p.id, sublabel: p.vat_number ?? undefined}))
          .sort((a, b) => a.label.localeCompare(b.label, 'it'));
        after?.();
      },
      error: err => console.error('Errore nel caricamento dei fornitori:', err),
    });
  }

  // Collegati da GET /:id; collegabili = contratti del fornitore senza convenzione.
  private loadContracts(): void {
    this.service.getById(this.data.item.id).subscribe({
      next: a => this.contractRows = (a.contracts ?? []).map(c => this.toRow(c)),
      error: err => console.error('Errore nel caricamento dei contratti della convenzione:', err),
    });
    this.contractsService.search({deleted: false}).subscribe({
      next: list => this.contractOptions = list
        .filter((c: Contract) => !c.consip_agreement_id && c.supplier_id_fk === this.data.item.supplier_id)
        .map(c => ({label: c.consip_order || c.cig_contract || `Contratto id ${c.id}`, value: c.id, sublabel: c.cig_contract ?? undefined}))
        .sort((a, b) => a.label.localeCompare(b.label, 'it')),
      error: err => console.error('Errore nel caricamento dei contratti:', err),
    });
  }

  private toRow(c: AgreementContract): ContractRow {
    return {
      id: c.id,
      order: c.consip_order ?? '',
      cig: c.cig_contract || 'CIG non specificato',
      period: [c.supply_start_date, c.supply_expiry_date].map(d => (d ? dateIt(d) : '…')).join(' – '),
      closed: !!c.closed,
    };
  }

  private loadCommitments(): void {
    this.service.commitments(this.data.item.id).subscribe({
      next: r => {
        this.commitments = r.items;
        this.totals = r.totals;
      },
      error: err => console.error('Errore nel caricamento degli impegni della convenzione:', err),
    });
  }

  private afterLinkChange(): void {
    this.touched = true;
    this.loadContracts();
    this.loadCommitments();
  }

  linkContract(contractId: number): void {
    this.service.linkContract(this.data.item.id, contractId).subscribe({
      next: () => this.afterLinkChange(),
      error: err => this.toast.add({severity: 'error', summary: 'Contratto non collegato', detail: err?.error?.message}),
    });
  }

  unlinkContract(contractId: number): void {
    this.service.unlinkContract(this.data.item.id, contractId).subscribe({
      next: () => this.afterLinkChange(),
      error: err => this.toast.add({severity: 'error', summary: 'Contratto non scollegato', detail: err?.error?.message}),
    });
  }

  newContract(): void {
    this.navigator.createSupplyContract([], {
      supplier_id_fk: this.data.item.supplier_id,
      consip_agreement_id: this.data.item.id,
    } as Partial<Contract>).subscribe(c => {
      if (c) this.afterLinkChange();
    });
  }

  openContract(row: ContractRow): void {
    this.navigator.openSupplyContract(row.id).subscribe(saved => {
      if (saved) this.afterLinkChange();
    });
  }

  openCommitment(c: Commitment): void {
    this.navigator.openCommitment(c.id).subscribe(saved => {
      if (saved) this.loadCommitments();
    });
  }

  newSupplier(text: string): void {
    this.navigator.createThirdParty({company_name: nameFrom(text)}).subscribe(p => {
      if (!p) return;
      this.loadSuppliers(() => {
        this.form.controls.supplier_id.setValue(p.id);
        this.form.controls.supplier_id.markAsDirty();
      });
    });
  }

  titleText(): string {
    return this.form.controls.name.value || (this.isNew ? 'Nuova convenzione CONSIP' : 'Convenzione CONSIP');
  }

  subtitleText(): string {
    const supplier = this.supplierOptions.find(o => o.value === this.form.controls.supplier_id.value)?.label;
    return [this.form.controls.cig_master.value ? `CIG master ${this.form.controls.cig_master.value}` : null, supplier]
      .filter(Boolean).join(' · ');
  }

  dataInvalid(): boolean {
    return hasInvalid(this.form, 'name', 'cig_master', 'expiration_date', 'supplier_id');
  }

  // safeguard è tinyint (0/1) nel backend: create() lo inizializza a 0 (= «No»).
  private normalizeSafeguard(value: unknown): boolean | null {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    return null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.dialogRef.close(plainToInstance(ConsipAgreement, {
      id: this.data.item.id,
      ...raw,
      // Il DTO backend valida safeguard con @IsIn([0, 1]).
      safeguard: raw.safeguard === true ? 1 : raw.safeguard === false ? 0 : null,
    }));
  }

  cancel(): void {
    this.dialogRef.close(this.touched ? SHEET_REFRESH : undefined);
  }
}
