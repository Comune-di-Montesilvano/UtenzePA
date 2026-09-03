import {Component, inject, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatIconModule} from '@angular/material/icon';
import {plainToInstance} from 'class-transformer';
import {EditDialogData, EDIT_DIALOG_POSITION} from '../../core/components/abstract-data-table.component';
import {Asset} from './entity/asset.entity';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';
import {OnlyNumbersDirective} from '../../core/directives/only-numbers.directive';
import {LatitudeInputDirective} from '../../core/directives/latitude-input.directive';
import {LongitudeInputDirective} from '../../core/directives/longitude-input.directive';
import {AssetAggregatorsService} from '../asset-aggregator/asset-aggregator.service';
import {AssetAggregator} from '../asset-aggregator/entity/asset-aggregator.entity';
import {AssetService} from './asset.service';
import {TOption} from '../../core/types/option.interface';
import {HardType} from '../utility-types/enum/hard-type.enum';
import {Utility} from '../utilities/entity/utility.entity';
import {TruncatePipe} from '../../core/pipes/truncate.pipe';
import {FormatAmountPipe} from '../../core/pipes/format-amount.pipe';
import {DatePipe} from '@angular/common';
import {LocationMapComponent} from '../../core/components/location-map.component';
import {PhotoGalleryComponent} from '../../core/components/photo-gallery.component';
import {PhotosService} from '../../services/photos.service';
import {UtilityEditDialogComponent} from '../utilities/utility-edit-dialog.component';
import {ASSET_AGGREGATOR_ICON_FALLBACK} from '../asset-aggregator/enum/asset-aggregator-icon.enum';
import {UtilityTypesService} from '../utility-types/utility-types.service';
import {UtilityType} from '../utility-types/entity/utility-type.entity';
import {UtilityService} from '../utilities/utility.service';

// Stessa larghezza usata per il dialog immobile (vedi UtilityEditDialogComponent
// ASSET_DIALOG_WIDTH) — tab + gruppi affiancati richiedono spazio simile.
const UTILITY_DIALOG_WIDTH = '1150px';

@Component({
  selector: 'app-asset-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MatIconModule,
    HasRoleDirective,
    ReadOnlyDirective,
    OnlyNumbersDirective,
    LatitudeInputDirective,
    LongitudeInputDirective,
    TruncatePipe,
    FormatAmountPipe,
    DatePipe,
    LocationMapComponent,
    PhotoGalleryComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-edit-dialog.component.html'
})
export class AssetEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetEditDialogComponent, Asset | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private assetService = inject(AssetService);
  private photosService = inject(PhotosService);
  private utilityTypesService = inject(UtilityTypesService);
  private utilityService = inject(UtilityService);
  protected data = inject<EditDialogData<Asset>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  maxDescLength = 50;

  assetAggregatorOptions: AssetAggregator[] = [];
  categoryOptions: TOption[] = this.assetService.categoryOptions();
  toponomyOptions: TOption[] = this.assetService.toponymOptions();
  ownershipOptions: TOption[] = [
    {label: 'Sì', value: 1},
    {label: 'No', value: 0}
  ];
  tabs = HardType.items();

  form = this.fb.group({
    asset_name: [this.data.item.asset_name ?? '', Validators.required],
    asset_type_id: [
      this.data.item.assetAggregator != null ? (this.data.item.asset_type_id ?? null) : null,
      Validators.required
    ],
    category: [this.data.item.category ?? null],
    ownership: [this.data.item.ownership ?? 0],
    toponym: [this.data.item.toponym ?? null],
    address: [this.data.item.address ?? null],
    civic_number: [this.data.item.civic_number ?? null],
    municipality: [this.data.item.municipality ?? null],
    zip_code: [this.data.item.zip_code ?? null],
    services_and_artifacts: [this.data.item.services_and_artifacts ?? null],
    latitude: [this.data.item.latitude ?? null],
    longitude: [this.data.item.longitude ?? null],
    cadastral_value: [this.data.item.cadastral_value ?? null],
    sheet: [this.data.item.sheet ?? null],
    parcel: [this.data.item.parcel ?? null],
    subordinate: [this.data.item.subordinate ?? null],
    area_sqm: [this.data.item.area_sqm ?? null],
    associated_building: [this.data.item.associated_building ?? null],
    specific_details: [this.data.item.specific_details ?? null],
    memo: [this.data.item.memo ?? null],
  });

  constructor() {
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  photoCount: number | null = null;

  // Popolata in ngOnInit — serve ad "Aggiungi utenza" per pre-selezionare il
  // UtilityType giusto in base al tab (hard_type) da cui si apre il form,
  // dato che il form utenza lavora per id di UtilityType, non per hard_type.
  private utilityTypeIdByHardType = new Map<HardType, number>();

  ngOnInit(): void {
    this.assetAggregatorsService.search({deleted: false}).subscribe({
      next: data => this.assetAggregatorOptions = data,
      error: err => console.error('Errore nel caricamento degli Asset Aggregator:', err)
    });

    this.utilityTypesService.search({deleted: false}).subscribe({
      next: (data: UtilityType[]) => {
        this.utilityTypeIdByHardType.clear();
        for (const t of data) {
          if (!this.utilityTypeIdByHardType.has(t.hard_type)) this.utilityTypeIdByHardType.set(t.hard_type, t.id);
        }
      },
      error: err => console.error('Errore nel caricamento dei Tipi Utenza:', err)
    });

    // Solo per mostrare "Foto (N)" sull'etichetta del tab prima ancora di
    // aprirlo — il tab e' lazy (matTabContent), PhotoGalleryComponent non
    // esiste finche' non ci si clicca dentro, quindi il conteggio non puo'
    // venire da li'. Chiamata leggera (solo metadati, non i file), non
    // duplicata quando poi si apre davvero il tab (PhotoGalleryComponent
    // fa la sua load() indipendente).
    if (!this.isNew) {
      this.photosService.list('asset', this.data.item.id).subscribe({
        next: photos => this.photoCount = photos.length,
        error: () => {} // non critico: l'etichetta resta senza numero, la galleria stessa segnala eventuali errori
      });
    }
  }

  // Icona del tab "Dati" — segue l'aggregato selezionato nel form (non
  // data.item.assetAggregator, che resterebbe quella iniziale se l'utente
  // cambia "Tipo immobile" prima di salvare), stesso fallback usato sui
  // marker mappa quando l'aggregato non ha un'icona custom.
  currentAggregatorIcon(): string {
    const id = this.form.controls.asset_type_id.value;
    const aggregator = this.assetAggregatorOptions.find(a => a.id === id);
    return aggregator?.icon || ASSET_AGGREGATOR_ICON_FALLBACK;
  }

  getUtilitiesByHardType(hardType: HardType): Utility[] {
    return this.data.item.utilities?.filter(u => u.utilityType?.hard_type === hardType) ?? [];
  }

  getUtilityCountByType(hardType: HardType): number {
    return this.getUtilitiesByHardType(hardType).length;
  }

  // Apre il form utenza in creazione con immobile e tipologia già
  // pre-compilati (immobile = quello di questo dialog, tipologia = il tab
  // da cui si clicca) — a differenza di openUtilityDetail il form qui non
  // esiste ancora, va creato e persistito noi stessi: questo dialog non
  // passa dal flusso AbstractDataTableComponent.openCreateDialog()/onCreate
  // (che fa la stessa cosa per la tabella utenze), essendo aperto da dentro
  // un altro dialog, quindi va replicata a mano la POST + l'aggiornamento
  // locale di data.item.utilities (cosi' il conteggio/la tabella del tab
  // si aggiornano subito, senza dover chiudere e riaprire l'immobile).
  addUtility(hardType: HardType): void {
    const utilityTypeId = this.utilityTypeIdByHardType.get(hardType) ?? null;
    const newUtility = Utility.create({
      asset_id_fk: this.data.item.id,
      asset: this.data.item,
      utility_type_id_fk: utilityTypeId ?? undefined,
    });

    this.dialog.open<UtilityEditDialogComponent, {mode: 'create'; item: Utility}, Utility | undefined>(UtilityEditDialogComponent, {
      width: UTILITY_DIALOG_WIDTH,
      maxWidth: UTILITY_DIALOG_WIDTH,
      position: EDIT_DIALOG_POSITION,
      data: {mode: 'create', item: newUtility},
    }).afterClosed().subscribe(result => {
      if (!result) return;
      const userId = this.authService.getCurrentUser()?.id;
      this.utilityService.create({...result, created_by_user_id: userId, updated_by_user_id: userId}).subscribe({
        next: created => {
          // POST ritorna l'entita' salvata da TypeORM.save() SENZA relazioni
          // popolate (utilityType/asset restano undefined, solo gli _id_fk
          // sono valorizzati) — getUtilitiesByHardType filtra su
          // u.utilityType?.hard_type, quindi senza questo stub la nuova
          // utenza risulterebbe invisibile nel proprio tab finche' non si
          // riapre il dialog (bug reale, visto in verifica end-to-end).
          created.utilityType = {hard_type: hardType} as UtilityType;
          this.data.item.utilities = [...(this.data.item.utilities ?? []), created];
        },
        error: err => console.error("Errore nella creazione dell'utenza:", err)
      });
    });
  }

  openUtilityDetail(utility: Utility): void {
    // Sopra questo dialog (stessa finestra), non una tab nuova — stesso
    // pattern del verso opposto in UtilityEditDialogComponent.navigateToAsset.
    // L'oggetto e' gia' quello caricato con l'immobile (data.item.utilities),
    // nessuna chiamata di rete in piu' per riaprirlo.
    this.dialog.open(UtilityEditDialogComponent, {
      width: UTILITY_DIALOG_WIDTH,
      maxWidth: UTILITY_DIALOG_WIDTH,
      position: EDIT_DIALOG_POSITION,
      data: {mode: 'edit', item: utility},
    });
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(Asset, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  onPositionSelected(coords: { lat: string; lng: string }): void {
    this.form.patchValue({ latitude: coords.lat, longitude: coords.lng });
  }

  onPositionCleared(): void {
    this.form.patchValue({ latitude: null, longitude: null });
  }
}
