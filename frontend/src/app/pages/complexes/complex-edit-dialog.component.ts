import {ChangeDetectionStrategy, Component, inject, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTab, MatTabGroup, MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {EntityHistoryComponent} from '../../core/components/entity-history.component';
import {EntitySheetComponent} from '../../core/components/entity-sheet/entity-sheet.component';
import {StatusBadgeComponent} from '../../core/components/entity-sheet/status-badge.component';
import {TabLabelComponent} from '../../core/components/entity-sheet/tab-label.component';
import {PreviewCardComponent, PreviewItem} from '../../core/components/entity-sheet/preview-card.component';
import {LinkedColumn, LinkedTableComponent, RowIcon} from '../../core/components/entity-sheet/linked-table.component';
import {assetStatus, grantStatus, plantStatus, StatusInfo, utilityStatus} from '../../core/helpers/entity-status';
import {hasInvalid, isEditorRole, lastModifiedLabel, selectTab} from '../../core/components/entity-sheet/sheet-utils';
import {TOption} from '../../core/types/option.interface';
import {AuthService} from '../../services/auth.service';
import {EntityNavigatorService} from '../../core/services/entity-navigator.service';
import {AssetService} from '../assets/asset.service';
import {Asset} from '../assets/entity/asset.entity';
import {Utility} from '../utilities/entity/utility.entity';
import {HardTypeColor, HardTypeMatIcon} from '../utility-types/enum/hard-type.enum';
import {Plant, PLANT_TYPE_LABEL} from '../plants/plant.model';
import {UtilizerGrant} from '../utilizer-grant/entity/utilizer-grant.entity';
import {DIRECTION_LABEL, KIND_LABEL} from '../utilizer-grant/real-estate-contract.model';
import {partyName} from '../../core/helpers/party-name.helper';
import {ComplexService} from './complex.service';
import {
  Complex, COMPLEX_KIND_LABEL, COMPLEX_TYPE_LABEL, COMPLEX_TYPES, ComplexKind, ComplexPayload, ComplexType,
} from './complex.model';

export interface ComplexEditDialogData {
  // null = nuovo complesso.
  complexId: number | null;
  prefill?: Partial<ComplexPayload>;
}

// Scheda complesso: salva da sé, chiude con il complesso se qualcosa è stato
// salvato. Dopo la creazione resta aperta in modifica (immobili, foto).
@Component({
  selector: 'app-complex-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatTabsModule, MatTooltipModule, MatProgressBarModule, LocationMapComponent, PhotoGalleryComponent, EntityHistoryComponent,
    EntitySheetComponent, StatusBadgeComponent, TabLabelComponent, PreviewCardComponent, LinkedTableComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './complex-edit-dialog.component.html',
})
export class ComplexEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(ComplexService);
  private assetService = inject(AssetService);
  private navigator = inject(EntityNavigatorService);
  protected dialogRef = inject(MatDialogRef<ComplexEditDialogComponent, Complex | null>);
  protected data = inject<ComplexEditDialogData>(MAT_DIALOG_DATA);

  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  @ViewChildren(MatTab) tabList?: QueryList<MatTab>;

  readonly types = COMPLEX_TYPES;
  readonly typeLabel = COMPLEX_TYPE_LABEL;
  readonly kinds = Object.keys(COMPLEX_KIND_LABEL) as ComplexKind[];
  readonly kindLabel = COMPLEX_KIND_LABEL;
  readonly canEdit = isEditorRole(inject(AuthService).getCurrentUser()?.role);

  complex: Complex | null = null;
  loading = false;
  saving = false;
  saved = false;
  error: string | null = null;

  // Campi cache per app-linked-table e anteprime (mai getter).
  private allAssets: Asset[] = [];
  assetOptions: TOption[] = [];
  assetRows: Asset[] = [];
  utilityRows: Utility[] = [];
  plantRows: Plant[] = [];
  grantRows: UtilizerGrant[] = [];
  assetPreview: PreviewItem[] = [];

  readonly assetColumns: LinkedColumn<Asset>[] = [
    {label: 'Nome', value: a => a.asset_name ?? ''},
    {label: 'Indirizzo', value: a => [a.toponym, a.address, a.civic_number].filter(Boolean).join(' ')},
    {label: 'Funzione', value: a => a.assetFunction?.name ?? ''},
  ];
  readonly assetStatusOf = (a: Asset): StatusInfo => assetStatus(a.status);

  readonly utilityColumns: LinkedColumn<Utility>[] = [
    {label: 'POD/PDR', value: u => u.utility_id ?? `#${u.id}`},
    {label: 'Tipo uso', value: u => u.utilityType?.name ?? ''},
    {label: 'Immobile', value: u => (u.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly utilityIconOf = (u: Utility): RowIcon | null => {
    const t = u.utilityType?.hard_type;
    return t ? {icon: HardTypeMatIcon[t], color: HardTypeColor[t]} : null;
  };
  readonly utilityStatusOf = (u: Utility): StatusInfo => utilityStatus(u.supply_active);

  readonly plantColumns: LinkedColumn<Plant>[] = [
    {label: 'Codice', value: p => p.code},
    {label: 'Tipo', value: p => PLANT_TYPE_LABEL[p.type]},
    {label: 'Immobile', value: p => (p.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly plantStatusOf = (p: Plant): StatusInfo => plantStatus(p.status);

  readonly grantColumns: LinkedColumn<UtilizerGrant>[] = [
    {label: 'Tipo', value: g => [g.kind ? KIND_LABEL[g.kind] : '', g.direction ? DIRECTION_LABEL[g.direction] : ''].filter(Boolean).join(' · ')},
    {label: 'Parti', value: g => (g.parties ?? []).map(p => partyName(p)).join(', ')},
    {label: 'Immobile', value: g => (g.assets ?? []).map(a => a.asset_name).join(', ')},
  ];
  readonly grantStatusOf = (g: UtilizerGrant): StatusInfo => grantStatus(g.computed_status ?? (g.status as never));

  form = this.fb.group({
    name: [this.data.prefill?.name ?? '', [Validators.required, Validators.maxLength(255)]],
    complex_type: [(this.data.prefill?.complex_type ?? null) as ComplexType | null],
    kind: [(this.data.prefill?.kind ?? 'PHYSICAL') as ComplexKind],
    toponym: [''],
    address: [''],
    civic_number: [''],
    latitude: [null as string | null],
    longitude: [null as string | null],
    notes: [''],
    asset_ids: [(this.data.prefill?.asset_ids ?? []) as number[]],
  });

  ngOnInit(): void {
    if (!this.canEdit) this.form.disable();
    this.loadAssets();
    if (this.data.complexId) this.load(this.data.complexId);
  }

  private loadAssets(): void {
    this.assetService.search({deleted: false} as never).subscribe({
      next: assets => {
        this.allAssets = assets;
        this.assetOptions = assets
          .map(a => ({
            label: a.asset_name ?? '',
            value: a.id,
            sublabel: a.complex && a.complex.id !== this.complex?.id ? `nel complesso ${a.complex.name}` : (a.address ?? undefined),
            searchText: `${a.asset_name ?? ''} ${a.address ?? ''}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.refreshLinks();
      },
      error: err => console.error('Errore caricamento immobili:', err),
    });
  }

  private load(id: number): void {
    this.loading = true;
    this.service.get(id).subscribe({
      next: c => {
        this.loading = false;
        if (!c) {
          this.error = 'Complesso non trovato.';
          return;
        }
        this.complex = c;
        this.patch(c);
        this.loadLinked(c.id);
      },
      error: err => {
        this.loading = false;
        this.error = 'Complesso non trovato.';
        console.error('Errore caricamento complesso:', err);
      },
    });
  }

  private loadLinked(id: number): void {
    this.service.utilities(id).subscribe(rows => this.utilityRows = rows);
    this.service.plants(id).subscribe(rows => this.plantRows = rows);
    this.service.grants(id).subscribe(rows => this.grantRows = rows);
  }

  private patch(c: Complex): void {
    this.form.patchValue({
      name: c.name,
      complex_type: c.complex_type,
      kind: c.kind ?? 'PHYSICAL',
      toponym: c.toponym ?? '',
      address: c.address ?? '',
      civic_number: c.civic_number ?? '',
      latitude: c.latitude,
      longitude: c.longitude,
      notes: c.notes ?? '',
      asset_ids: (c.assets ?? []).map(a => a.id),
    });
    this.form.markAsPristine();
    this.refreshLinks();
  }

  refreshLinks(): void {
    const ids = this.form.controls.asset_ids.value ?? [];
    this.assetRows = ids
      .map(id => this.allAssets.find(a => a.id === id) ?? (this.complex?.assets?.find(a => a.id === id) as Asset | undefined))
      .filter((a): a is Asset => !!a);
    this.assetPreview = this.assetRows.map(a => ({
      id: a.id, label: a.asset_name ?? `#${a.id}`, sublabel: a.address ?? undefined,
      icon: a.assetFunction?.icon || 'apartment', color: 'var(--entity-asset)', status: assetStatus(a.status),
    }));
  }

  title(): string {
    const name = (this.form.controls.name.value ?? '').trim();
    return name || (this.complex ? `Complesso #${this.complex.id}` : 'Nuovo complesso');
  }

  subtitle(): string {
    const v = this.form.getRawValue();
    const street = [v.toponym, v.address, v.civic_number].filter(Boolean).join(' ');
    return [v.complex_type ? COMPLEX_TYPE_LABEL[v.complex_type] : '', street].filter(Boolean).join(' · ');
  }

  lastModified(): string | null {
    return this.complex ? lastModifiedLabel(this.complex.update_date, this.complex.updated_by) : null;
  }

  countBadge(): StatusInfo {
    const n = this.assetRows.length;
    return {tone: 'info', label: n === 1 ? '1 immobile' : `${n} immobili`, icon: 'apartment'};
  }

  invalid(...names: string[]): boolean {
    return hasInvalid(this.form, ...names);
  }

  goTo(label: string): void {
    selectTab(this.tabGroup, this.tabList, label);
  }

  onPositionSelected(pos: {lat: string; lng: string}): void {
    this.form.patchValue({latitude: pos.lat, longitude: pos.lng});
    this.form.markAsDirty();
  }

  onPositionCleared(): void {
    this.form.patchValue({latitude: null, longitude: null});
    this.form.markAsDirty();
  }

  private setAssetIds(ids: number[]): void {
    const c = this.form.controls.asset_ids;
    c.setValue(ids);
    c.markAsDirty();
    this.refreshLinks();
  }

  addAsset(id: number): void {
    const ids = this.form.controls.asset_ids.value ?? [];
    if (!ids.includes(id)) this.setAssetIds([...ids, id]);
  }

  unlinkAsset(id: number): void {
    this.setAssetIds((this.form.controls.asset_ids.value ?? []).filter(x => x !== id));
  }

  newAsset(): void {
    this.navigator.createAsset().subscribe(a => {
      if (!a) return;
      this.loadAssets();
      this.addAsset(a.id);
    });
  }

  openAsset(id: number): void {
    this.navigator.openAsset(id).subscribe(saved => {
      if (!saved) return;
      this.loadAssets();
      this.resyncAssets();
    });
  }

  // L'immobile può aver cambiato complesso dalla sua scheda: se qui i
  // collegamenti non sono stati toccati, si riallineano al server (altrimenti
  // il prossimo Salva li riporterebbe indietro).
  private resyncAssets(): void {
    if (!this.complex || this.form.controls.asset_ids.dirty) return;
    this.service.get(this.complex.id).subscribe(c => {
      if (!c || this.form.controls.asset_ids.dirty) return;
      this.complex = {...this.complex!, assets: c.assets, asset_count: c.asset_count};
      this.form.controls.asset_ids.setValue((c.assets ?? []).map(a => a.id));
      this.form.controls.asset_ids.markAsPristine();
      this.refreshLinks();
      this.loadLinked(c.id);
    });
  }

  openUtility(id: number): void {
    this.navigator.openUtility(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  openPlant(id: number): void {
    this.navigator.openPlant(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  openGrant(id: number): void {
    this.navigator.openGrant(id).subscribe(saved => {
      if (saved && this.complex) this.loadLinked(this.complex.id);
    });
  }

  close(): void {
    this.dialogRef.close(this.saved ? this.complex : null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Correggi i campi evidenziati (pallino rosso sul tab).';
      return;
    }
    const v = this.form.getRawValue();
    const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
    const payload: ComplexPayload = {
      name: (v.name ?? '').trim(),
      complex_type: v.complex_type ?? null,
      kind: v.kind ?? 'PHYSICAL',
      toponym: text(v.toponym),
      address: text(v.address),
      civic_number: text(v.civic_number),
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      notes: text(v.notes),
      // Solo se toccati: PATCH senza asset_ids lascia i collegamenti del server.
      ...(!this.complex || this.form.controls.asset_ids.dirty ? {asset_ids: v.asset_ids ?? []} : {}),
    };
    this.saving = true;
    this.error = null;
    const req = this.complex ? this.service.update(this.complex.id, payload) : this.service.create(payload);
    req.subscribe({
      next: c => {
        this.saving = false;
        this.saved = true;
        this.complex = c;
        this.patch(c);
        this.loadLinked(c.id);
      },
      error: (err: HttpErrorResponse) => {
        this.saving = false;
        this.error = err.error?.message ?? 'Salvataggio non riuscito.';
      },
    });
  }
}
