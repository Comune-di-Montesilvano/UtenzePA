import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTabsModule} from '@angular/material/tabs';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {LinkedColumn, LinkedTableComponent} from '../../core/components/entity-sheet/linked-table.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {FilterableSelectComponent} from '../../core/components/filterable-select.component';
import {hasInvalid, isEditorRole, lastModifiedLabel} from '../../core/components/entity-sheet/sheet-utils';
import {StatusInfo} from '../../core/helpers/entity-status';
import {partyName} from '../../core/helpers/party-name.helper';
import {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {ToastService} from '../../core/services/toast.service';
import {AssetService} from '../assets/asset.service';
import {PlantService} from '../plants/plant.service';
import {UtilizerGrantService} from '../utilizer-grant/utilizer-grant.service';
import {ContractsService} from '../contracts/contract.service';
import {KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {toIsoDate} from '../utilities/consumptions/consumption.model';
import {AttachmentsComponent} from '../attachments/attachments.component';
import {ActService} from './act.service';
import {Act, ActLinkEntity, ActPayload, actTitle, ActType} from './act.model';

export interface ActEditDialogData {
  // null = nuovo atto.
  actId: number | null;
  prefill?: Partial<ActPayload>;
}

type LinkRow = {id: number; label: string; sublabel: string};
type LinkSection = {entity: ActLinkEntity; title: string; icon: string; color: string; rows: LinkRow[]; options: TOption[]};

const toDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Scheda atto: salva da sé, chiude con l'atto se qualcosa è stato salvato.
// Dopo la creazione resta aperta (allegati, collegamenti).
@Component({
  selector: 'app-act-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatTabsModule, MatDatepickerModule, MatProgressBarModule, EntitySheetComponent, StatusBadgeComponent,
    TabLabelComponent, LinkedTableComponent, EntityHistoryComponent, FilterableSelectComponent, AttachmentsComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './act-edit-dialog.component.html',
})
export class ActEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ActService);
  private navigator = inject(EntityNavigatorService);
  private toast = inject(ToastService);
  private assetService = inject(AssetService);
  private plantService = inject(PlantService);
  private grantService = inject(UtilizerGrantService);
  private contractService = inject(ContractsService);
  protected dialogRef = inject(MatDialogRef<ActEditDialogComponent, Act | null>);
  protected data = inject<ActEditDialogData>(MAT_DIALOG_DATA);

  private readonly role = inject(AuthService).getCurrentUser()?.role;
  readonly canEdit = isEditorRole(this.role);
  readonly isAdmin = this.role === 'Admin';

  act: Act | null = null;
  typeOptions: TOption[] = [];
  fileCount = 0;
  loading = false;
  saving = false;
  saved = false;
  error: string | null = null;

  readonly linkColumns: LinkedColumn<LinkRow>[] = [
    {label: 'Nome', value: r => r.label},
    {label: '', value: r => r.sublabel},
  ];

  // Campi cache per app-linked-table (mai getter).
  sections: LinkSection[] = [
    {entity: 'asset', title: 'Immobili', icon: 'apartment', color: 'var(--entity-asset)', rows: [], options: []},
    {entity: 'plant', title: 'Impianti', icon: 'settings_input_component', color: 'var(--entity-plant)', rows: [], options: []},
    {entity: 'utilizer_grant', title: 'Contratti immobiliari', icon: 'real_estate_agent', color: 'var(--entity-grant)', rows: [], options: []},
    {entity: 'contract', title: 'Contratti di fornitura', icon: 'description', color: 'var(--entity-supply-contract)', rows: [], options: []},
  ];

  form = this.fb.group({
    act_type_id: [(this.data.prefill?.act_type_id ?? null) as number | null, Validators.required],
    number: [''],
    act_date: [null as Date | null],
    subject: [this.data.prefill?.subject ?? '', [Validators.required, Validators.maxLength(500)]],
    issuer: [''],
    protocol_number: [''],
    protocol_date: [null as Date | null],
    notes: [''],
  });

  ngOnInit(): void {
    if (!this.canEdit) this.form.disable();
    this.loadTypes();
    if (this.data.actId) this.load(this.data.actId);
  }

  private loadTypes(select?: number): void {
    this.service.types().subscribe(types => {
      this.typeOptions = types.map((t: ActType) => ({label: t.name, value: t.id}));
      if (select) this.form.patchValue({act_type_id: select});
    });
  }

  newType(name: string): void {
    const text = name.trim();
    if (!text) return;
    this.service.createType({name: text}).subscribe({
      next: t => this.loadTypes(t.id),
      error: (err: HttpErrorResponse) => this.toast.add({
        severity: 'error', summary: 'Tipo non creato', detail: err.error?.message ?? 'Errore imprevisto.',
      }),
    });
  }

  private load(id: number): void {
    this.loading = true;
    this.service.get(id).subscribe({
      next: a => {
        this.loading = false;
        this.setAct(a);
        if (this.canEdit) this.loadOptions();
      },
      error: err => {
        this.loading = false;
        this.error = 'Atto non trovato.';
        console.error('Errore caricamento atto:', err);
      },
    });
  }

  private setAct(a: Act): void {
    this.act = a;
    this.fileCount = a.file_count;
    this.form.patchValue({
      act_type_id: a.act_type_id,
      number: a.number ?? '',
      act_date: toDate(a.act_date),
      subject: a.subject,
      issuer: a.issuer ?? '',
      protocol_number: a.protocol_number ?? '',
      protocol_date: toDate(a.protocol_date),
      notes: a.notes ?? '',
    });
    this.form.markAsPristine();
    this.refreshLinks();
  }

  private refreshLinks(): void {
    const a = this.act;
    const rows: Record<ActLinkEntity, LinkRow[]> = {
      asset: (a?.assets ?? []).map(x => ({id: x.id, label: x.asset_name ?? `#${x.id}`, sublabel: x.address ?? ''})),
      plant: (a?.plants ?? []).map(x => ({id: x.id, label: x.code, sublabel: x.name})),
      utilizer_grant: (a?.utilizerGrants ?? []).map(x => ({
        id: x.id, label: x.subject || `Contratto #${x.id}`, sublabel: x.kind ? KIND_LABEL[x.kind as keyof typeof KIND_LABEL] ?? '' : '',
      })),
      contract: (a?.contracts ?? []).map(x => ({
        id: x.id, label: x.supplier_name || `Contratto #${x.id}`, sublabel: x.cig_contract ? `CIG ${x.cig_contract}` : '',
      })),
    };
    for (const s of this.sections) {
      s.rows = rows[s.entity];
      const linked = new Set(s.rows.map(r => r.id));
      s.options = (this.allOptions[s.entity] ?? []).filter(o => !linked.has(o.value as number));
    }
  }

  private allOptions: Partial<Record<ActLinkEntity, TOption[]>> = {};

  private loadOptions(): void {
    const sort = (xs: TOption[]) => xs.sort((x, y) => x.label.localeCompare(y.label));
    this.assetService.search({deleted: false} as never).subscribe(xs => {
      this.allOptions.asset = sort(xs.map(x => ({label: x.asset_name ?? `#${x.id}`, value: x.id, sublabel: x.address ?? undefined})));
      this.refreshLinks();
    });
    this.plantService.list().subscribe(xs => {
      this.allOptions.plant = sort(xs.map(x => ({label: `${x.code} — ${x.name}`, value: x.id})));
      this.refreshLinks();
    });
    this.grantService.search({deleted: false} as never).subscribe(xs => {
      this.allOptions.utilizer_grant = sort(xs.map(x => ({
        label: x.subject || `Contratto #${x.id}`, value: x.id,
        sublabel: (x.parties ?? []).map(p => partyName(p)).join(', ') || undefined,
      })));
      this.refreshLinks();
    });
    this.contractService.search({deleted: false} as never).subscribe(xs => {
      this.allOptions.contract = sort(xs.map(x => ({
        label: partyName(x.supplier) || `Contratto #${x.id}`, value: x.id,
        sublabel: x.cig_contract ? `CIG ${x.cig_contract}` : undefined,
      })));
      this.refreshLinks();
    });
  }

  title(): string {
    if (!this.act && !this.form.controls.act_type_id.value) return 'Nuovo atto';
    const type = this.typeOptions.find(o => o.value === this.form.controls.act_type_id.value);
    const v = this.form.getRawValue();
    return actTitle({
      actType: type ? {id: Number(type.value), name: type.label, sort_order: 0} : undefined,
      number: v.number?.trim() || null,
      act_date: v.act_date ? toIsoDate(v.act_date) : null,
    });
  }

  subtitle(): string {
    return (this.form.controls.subject.value ?? '').trim();
  }

  lastModified(): string | null {
    return this.act ? lastModifiedLabel(this.act.update_date, this.act.updated_by) : null;
  }

  filesBadge(): StatusInfo {
    const n = this.fileCount;
    return {tone: n ? 'info' : 'off', label: n === 1 ? '1 file' : `${n} file`, icon: 'attach_file'};
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  link(entity: ActLinkEntity, id: number): void {
    if (!this.act) return;
    this.service.link(this.act.id, entity, id).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => this.error = err.error?.message ?? 'Collegamento non riuscito.',
    });
  }

  unlink(entity: ActLinkEntity, id: number): void {
    if (!this.act) return;
    this.service.unlink(this.act.id, entity, id).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => this.error = err.error?.message ?? 'Scollegamento non riuscito.',
    });
  }

  openLinked(entity: ActLinkEntity, id: number): void {
    const done = () => this.act && this.reload();
    if (entity === 'asset') this.navigator.openAsset(id).subscribe(done);
    else if (entity === 'plant') this.navigator.openPlant(id).subscribe(done);
    else if (entity === 'utilizer_grant') this.navigator.openGrant(id).subscribe(done);
    else this.navigator.openSupplyContract(id).subscribe(done);
  }

  private reload(): void {
    if (!this.act) return;
    this.saved = true;
    this.service.get(this.act.id).subscribe(a => {
      const dirty = this.form.dirty;
      const values = this.form.getRawValue();
      this.setAct(a);
      // Campi modificati e non ancora salvati: restano quelli del form.
      if (dirty) {
        this.form.patchValue(values);
        this.form.markAsDirty();
      }
    });
  }

  close(): void {
    this.dialogRef.close(this.saved ? this.act : null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Correggi i campi evidenziati (pallino rosso sul tab).';
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: ActPayload = {
      act_type_id: Number(v.act_type_id),
      number: text(v.number),
      act_date: v.act_date ? toIsoDate(v.act_date) : null,
      subject: (v.subject ?? '').trim(),
      issuer: text(v.issuer),
      protocol_number: text(v.protocol_number),
      protocol_date: v.protocol_date ? toIsoDate(v.protocol_date) : null,
      notes: text(v.notes),
    };
    // Collegamenti iniziali solo alla creazione (es. «Nuovo atto» da una scheda).
    const links: Partial<ActPayload> = {};
    if (!this.act) {
      for (const k of ['asset_ids', 'plant_ids', 'utilizer_grant_ids', 'contract_ids'] as const) {
        if (this.data.prefill?.[k]) links[k] = this.data.prefill[k];
      }
    }
    this.saving = true;
    this.error = null;
    const req = this.act ? this.service.update(this.act.id, payload) : this.service.create({...payload, ...links});
    req.subscribe({
      next: a => {
        this.saving = false;
        this.saved = true;
        const first = !this.act;
        this.setAct(a);
        if (first && this.canEdit) this.loadOptions();
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = err.error?.message ?? 'Salvataggio non riuscito.';
      },
    });
  }
}
