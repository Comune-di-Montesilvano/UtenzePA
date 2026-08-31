import { Component, OnInit, AfterViewInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import * as L from 'leaflet';
import { MapService } from './map.service';
import { MapPoint, UngeolocatedItem, UNGEOLOCATED_REASON_LABELS } from './map-point.entity';
import { FilterableSelectComponent } from '../../core/components/filterable-select.component';
import { AssetAggregatorsService } from '../asset-aggregator/asset-aggregator.service';
import { UtilityTypesService } from '../utility-types/utility-types.service';
import { AssetService } from '../assets/asset.service';
import { UtilityService } from '../utilities/utility.service';
import { AssetEditDialogComponent } from '../assets/asset-edit-dialog.component';
import { UtilityEditDialogComponent } from '../utilities/utility-edit-dialog.component';
import { TOption } from '../../core/types/option.interface';
import { HardType, HardTypeIcon, HardTypeColor } from '../utility-types/enum/hard-type.enum';

// Icona/colore fissi per gli immobili (edificio) — le utenze usano invece
// HardTypeIcon/HardTypeColor (stessa mappa acqua/luce/gas/internet già usata
// nelle altre pagine, coerenza visiva con il resto dell'app).
const ASSET_ICON = 'fa fa-building';
const ASSET_COLOR = '#37474f';
// Contatore senza tipologia associata (dato mancante) — icona neutra.
const UNKNOWN_UTILITY_ICON = 'fa fa-question';
const UNKNOWN_UTILITY_COLOR = '#757575';

// Width dialog edit: la mappa apre gli stessi AssetEditDialogComponent/
// UtilityEditDialogComponent usati dalle tabelle — stesso valore del default
// AbstractDataTableComponent.editDialogWidth() (MatDialog clampa a 560px se
// non passato esplicitamente, vedi CLAUDE.md).
const EDIT_DIALOG_WIDTH = '1150px';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCheckboxModule, FilterableSelectComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private mapService = inject(MapService);
  private dialog = inject(MatDialog);
  private assetAggregatorsService = inject(AssetAggregatorsService);
  private utilityTypesService = inject(UtilityTypesService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);

  private map: L.Map | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;

  showAssets = new FormControl(true, { nonNullable: true });
  showUtilities = new FormControl(true, { nonNullable: true });
  assetAggregatorId = new FormControl<number | null>(null);
  utilityTypeId = new FormControl<number | null>(null);

  assetAggregatorOptions: TOption[] = [];
  utilityTypeOptions: TOption[] = [];
  ungeolocated: UngeolocatedItem[] = [];
  reasonLabels = UNGEOLOCATED_REASON_LABELS;
  hardTypeLegend = HardType.items();

  ngOnInit(): void {
    this.assetAggregatorsService.search({ deleted: false }).subscribe({
      next: (data) => (this.assetAggregatorOptions = data.map((a) => ({ label: a.code ?? '', value: a.id }))),
    });
    this.utilityTypesService.search({ deleted: false }).subscribe({
      next: (data) => (this.utilityTypeOptions = data.map((t) => ({ label: t.name, value: t.id }))),
    });

    this.showAssets.valueChanges.subscribe(() => this.reload());
    this.showUtilities.valueChanges.subscribe(() => this.reload());
    this.assetAggregatorId.valueChanges.subscribe(() => this.reload());
    this.utilityTypeId.valueChanges.subscribe(() => this.reload());
  }

  async ngAfterViewInit(): Promise<void> {
    // leaflet.markercluster è UMD e cerca `L` su `window` per estendersi con
    // `markerClusterGroup` — un import statico ("import 'leaflet.markercluster'")
    // viene hoistato dal motore JS prima di qualunque altra istruzione del
    // modulo (comportamento standard ESM, non un bug del bundler), quindi
    // gira PRIMA che si possa assegnare `window.L = L`, e l'estensione fallisce
    // silenziosamente ("L.markerClusterGroup is not a function"). L'import
    // dinamico qui sotto è una chiamata a runtime, non hoistata: l'ordine è
    // garantito.
    (window as unknown as { L: typeof L }).L = L;
    await import('leaflet.markercluster');

    this.map = L.map('map-canvas').setView([42.5083, 14.15], 13); // Montesilvano

    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    // Esri World Imagery: satellite gratuito senza API key (stesso pattern OSM,
    // nessun secret da configurare). maxZoom 19 come lo strato stradale.
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      },
    );
    L.control.layers({ Stradale: streetLayer, Satellite: satelliteLayer }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup();
    this.map.addLayer(this.clusterGroup);
    this.reload();

    // .map-canvas è flex:1 dentro .map-page — al momento di L.map() il layout
    // flex non ha ancora assegnato la posizione/dimensione finale al
    // container (qui: sidebar filtri + FilterableSelect che si popolano via
    // HTTP e possono ancora spostare il layout dopo il primo paint). Un
    // singolo invalidateSize() differito con setTimeout(0) NON basta — gira
    // comunque prima che il layout sia assestato, lasciando l'origine interna
    // dei tile disallineata rispetto alla vera posizione del container (tile
    // caricati correttamente ma "scomposti": verificato via
    // getBoundingClientRect() nel browser, offset dei tile pari al vecchio
    // rect). ResizeObserver ricalcola ad ogni cambio reale di dimensione (e
    // quindi anche ai resize finestra successivi), niente timeout indovinato.
    const canvasEl = document.getElementById('map-canvas');
    if (canvasEl) {
      this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
      this.resizeObserver.observe(canvasEl);
    }

    // Copre anche il caso "posizione cambiata, dimensione no" (ResizeObserver
    // non lo intercetta): doppio requestAnimationFrame per essere certi che
    // il primo layout/paint del browser sia già avvenuto.
    requestAnimationFrame(() => requestAnimationFrame(() => this.map?.invalidateSize()));
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private reload(): void {
    this.mapService
      .getPoints({
        showAssets: this.showAssets.value,
        showUtilities: this.showUtilities.value,
        assetAggregatorId: this.assetAggregatorId.value,
        utilityTypeId: this.utilityTypeId.value,
      })
      .subscribe({
        next: (response) => {
          this.renderPoints(response.points);
          this.ungeolocated = response.ungeolocated;
        },
        error: (err) => console.error('Errore nel caricamento dei punti mappa:', err),
      });
  }

  private renderPoints(points: MapPoint[]): void {
    if (!this.clusterGroup) return;
    this.clusterGroup.clearLayers();

    for (const point of points) {
      const lat = parseFloat(point.lat);
      const lng = parseFloat(point.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const isAsset = point.type === 'asset';
      const faIcon = isAsset ? ASSET_ICON : (point.hardType ? HardTypeIcon[point.hardType] : UNKNOWN_UTILITY_ICON);
      const color = isAsset ? ASSET_COLOR : (point.hardType ? HardTypeColor[point.hardType] : UNKNOWN_UTILITY_COLOR);
      // Bordo tratteggiato per posizione stimata (geocodifica da indirizzo)
      // vs bordo pieno per GPS reale — stessa distinzione di prima, non più
      // affidata al colore (ora usato per la tipologia).
      const borderStyle = point.source === 'gps' ? 'solid' : 'dashed';

      const icon = L.divIcon({
        className: '',
        html: `<span class="map-pin" style="background:${color};border-style:${borderStyle}"><i class="${faIcon}"></i></span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([lat, lng], { icon });
      marker.on('click', () => this.openDetail(point));
      this.clusterGroup.addLayer(marker);
    }
  }

  openDetail(point: MapPoint | UngeolocatedItem): void {
    if (point.type === 'asset') {
      this.assetService.getById(point.id).subscribe((asset) => {
        this.dialog
          .open(AssetEditDialogComponent, {
            width: EDIT_DIALOG_WIDTH,
            maxWidth: EDIT_DIALOG_WIDTH,
            data: { mode: 'edit', item: asset },
          })
          // Il dialog si limita a chiudersi col form compilato (result) — il
          // salvataggio va fatto qui, stesso pattern di AbstractComponent.onSave()
          // usato dalle tabelle. Mancava: "Salva" nel dialog aggiornava solo lo
          // stato locale del form, mai persistito lato server.
          .afterClosed()
          .subscribe((result) => {
            if (!result) return;
            this.assetService.update(result.id, result).subscribe(() => this.reload());
          });
      });
    } else {
      this.utilityService.getById(point.id).subscribe((utility) => {
        this.dialog
          .open(UtilityEditDialogComponent, {
            width: EDIT_DIALOG_WIDTH,
            maxWidth: EDIT_DIALOG_WIDTH,
            data: { mode: 'edit', item: utility },
          })
          .afterClosed()
          .subscribe((result) => {
            if (!result) return;
            this.utilityService.update(result.id, result).subscribe(() => this.reload());
          });
      });
    }
  }
}
