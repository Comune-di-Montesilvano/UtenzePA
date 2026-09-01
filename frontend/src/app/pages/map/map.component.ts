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
import { BrandingService } from '../../services/branding.service';
import { ASSET_AGGREGATOR_ICON_FALLBACK } from '../asset-aggregator/enum/asset-aggregator-icon.enum';

// Fallback per gli immobili senza icona custom sull'aggregato collegato (o
// aggregato non ancora caricato) — Material Icons (vedi
// AssetAggregatorIconOptions), non più Font Awesome fisso: ogni immobile
// eredita ora l'icona del proprio AssetAggregator.icon.
const ASSET_COLOR = '#37474f';
// Contatore senza tipologia associata (dato mancante) — icona neutra.
const UNKNOWN_UTILITY_ICON = 'fa fa-question';
const UNKNOWN_UTILITY_COLOR = '#757575';

// Fallback usato se le coordinate di default salvate in branding sono
// malformate/non numeriche (es. DTO backend con un vecchio valore invalido) —
// stesse coordinate del seed di migrazione CreateAppSettings (Montesilvano).
const SAFE_DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15];

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
  private brandingService = inject(BrandingService);

  private map: L.Map | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;

  showAssets = new FormControl(true, { nonNullable: true });
  showUtilities = new FormControl(true, { nonNullable: true });
  assetAggregatorId = new FormControl<number | null>(null);
  utilityTypeId = new FormControl<number | null>(null);
  assetSearch = new FormControl<number | null>(null);

  assetAggregatorOptions: TOption[] = [];
  utilityTypeOptions: TOption[] = [];
  assetSearchOptions: TOption[] = [];
  ungeolocated: UngeolocatedItem[] = [];
  reasonLabels = UNGEOLOCATED_REASON_LABELS;
  hardTypeLegend = HardType.items();

  // Popolata a ogni renderPoints() — usata solo per la ricerca "vai a edificio",
  // per centrare la mappa su un asset anche se raggruppato in un cluster (i
  // marker di leaflet.markercluster non sono in un layer group ricercabile
  // direttamente per id).
  private assetMarkers = new Map<number, L.Marker>();

  // Popolata a ogni renderPoints() — utenze collegate a ciascun asset, usata
  // dal marker immobile per offrire un selettore quando ha contatori
  // sovrapposti (vedi openAssetOrPicker): senza, un click sul marker
  // immobile apriva SEMPRE e SOLO la scheda immobile, i marker utenza
  // sottostanti (stessa posizione, nessun GPS proprio) restavano
  // irraggiungibili — un click Leaflet colpisce solo il marker più in alto
  // nello z-order, non c'è "fan out" automatico fuori dai cluster.
  private utilitiesByAsset = new Map<number, MapPoint[]>();

  ngOnInit(): void {
    this.assetAggregatorsService.search({ deleted: false }).subscribe({
      next: (data) => (this.assetAggregatorOptions = data.map((a) => ({ label: a.code ?? '', value: a.id }))),
    });
    this.utilityTypesService.search({ deleted: false }).subscribe({
      next: (data) => (this.utilityTypeOptions = data.map((t) => ({ label: t.name, value: t.id }))),
    });
    this.assetService.search({ deleted: false }).subscribe({
      next: (data) =>
        (this.assetSearchOptions = data.map((a) => ({
          label: a.address ? `${a.asset_name} — ${a.address}` : a.asset_name,
          value: a.id,
        }))),
    });

    this.showAssets.valueChanges.subscribe(() => this.reload());
    this.showUtilities.valueChanges.subscribe(() => this.reload());
    this.assetAggregatorId.valueChanges.subscribe(() => this.reload());
    this.utilityTypeId.valueChanges.subscribe(() => this.reload());
    this.assetSearch.valueChanges.subscribe((id) => this.goToAsset(id));
  }

  private goToAsset(id: number | null): void {
    if (id == null || !this.map) return;

    const marker = this.assetMarkers.get(id);
    if (marker && this.clusterGroup) {
      // zoomToShowLayer scioglie il/i cluster necessari e zooma finché il
      // marker non è visibile singolarmente, poi il callback centra la vista.
      this.clusterGroup.zoomToShowLayer(marker, () => {
        this.map?.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 18));
      });
      return;
    }

    // Asset non presente tra i punti mappati correnti (es. escluso dal filtro
    // aggregato attivo, o non geolocalizzato) — apri comunque la scheda.
    this.openDetail({ id, type: 'asset' } as UngeolocatedItem);
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

    const branding = this.brandingService.current();
    const brandingLat = parseFloat(branding.default_latitude);
    const brandingLng = parseFloat(branding.default_longitude);
    const defaultCenter: L.LatLngExpression =
      Number.isFinite(brandingLat) && Number.isFinite(brandingLng)
        ? [brandingLat, brandingLng]
        : SAFE_DEFAULT_CENTER;
    this.map = L.map('map-canvas').setView(defaultCenter, 13);

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

    // Default L.markerClusterGroup() usa maxClusterRadius:80 (px) senza
    // disableClusteringAtZoom — a zoom alto (edificio per edificio) raggruppava
    // ancora marker vicini ma distinti. Raggio più stretto + niente cluster
    // oltre lo zoom 17 (livello "via/edificio").
    this.clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 17 });
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
    this.assetMarkers.clear();

    // Le utenze senza GPS proprio ereditano la posizione esatta dell'asset
    // (vedi MapService.resolveUtilityPosition) — a zoom alto, oltre
    // disableClusteringAtZoom, i loro marker finiscono esattamente sovrapposti
    // al marker immobile e si nascondono a vicenda. Il badge sul marker
    // immobile resta leggibile indipendentemente dallo zoom/sovrapposizione,
    // e il click sul marker immobile apre un selettore invece di saltare
    // dritto alla scheda immobile (vedi utilitiesByAsset/openAssetOrPicker).
    this.utilitiesByAsset.clear();
    for (const p of points) {
      if (p.type === 'utility' && p.assetId != null) {
        const list = this.utilitiesByAsset.get(p.assetId) ?? [];
        list.push(p);
        this.utilitiesByAsset.set(p.assetId, list);
      }
    }

    for (const point of points) {
      const lat = parseFloat(point.lat);
      const lng = parseFloat(point.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

      const isAsset = point.type === 'asset';
      const { iconHtml, color } = this.pointIcon(point);
      // Bordo tratteggiato per posizione stimata (geocodifica da indirizzo)
      // vs bordo pieno per GPS reale — stessa distinzione di prima, non più
      // affidata al colore (ora usato per la tipologia).
      const borderStyle = point.source === 'gps' ? 'solid' : 'dashed';
      const utilityCount = isAsset ? (this.utilitiesByAsset.get(point.id)?.length ?? 0) : 0;
      const badgeHtml = utilityCount > 0 ? `<span class="map-pin-badge">${utilityCount}</span>` : '';

      const icon = L.divIcon({
        className: '',
        html: `<span class="map-marker-wrap"><span class="map-pin" style="background:${color};border-style:${borderStyle}">${iconHtml}</span>${badgeHtml}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      // Le utenze senza GPS proprio condividono lat/lng esatte con l'asset
      // (vedi utilityCountByAsset sopra) — lo z-index Leaflet di default si
      // basa sulla latitudine (per un pseudo-3D "più a sud = più avanti"), a
      // parità di coordinate il risultato non è affidabile: un marker utenza
      // può finire sopra e coprire per intero l'icona immobile (con badge
      // "staccato" che sporge dal bordo, visivamente confuso). zIndexOffset
      // forza l'immobile sempre in primo piano sulle utenze coincidenti.
      const marker = L.marker([lat, lng], { icon, zIndexOffset: isAsset ? 1000 : 0 });
      marker.on('click', () => (isAsset ? this.openAssetOrPicker(point) : this.openDetail(point)));
      this.clusterGroup.addLayer(marker);
      if (isAsset) this.assetMarkers.set(point.id, marker);
    }
  }

  // Icona+colore di un punto — fattorizzato perché serve sia al marker sulla
  // mappa (renderPoints) sia alle voci del popup di scelta immobile/contatori
  // (openAssetOrPicker), stessa resa in entrambi i posti.
  private pointIcon(point: MapPoint): { iconHtml: string; color: string } {
    const isAsset = point.type === 'asset';
    const color = isAsset ? ASSET_COLOR : (point.hardType ? HardTypeColor[point.hardType] : UNKNOWN_UTILITY_COLOR);
    // Gli immobili usano l'icona Material dell'aggregato collegato
    // (AssetAggregator.icon, personalizzabile in anagrafica aggregati); le
    // utenze restano su Font Awesome (HardTypeIcon), invariato.
    const iconHtml = isAsset
      ? `<span class="material-icons">${point.icon || ASSET_AGGREGATOR_ICON_FALLBACK}</span>`
      : `<i class="${point.hardType ? HardTypeIcon[point.hardType] : UNKNOWN_UTILITY_ICON}"></i>`;
    return { iconHtml, color };
  }

  // Click su un marker immobile: se ha contatori collegati (badge visibile),
  // apre un piccolo menu di scelta invece della scheda immobile diretta —
  // altrimenti i contatori senza GPS proprio (stessa posizione dell'asset,
  // marker immobile sempre sopra nello z-order) non sarebbero mai
  // raggiungibili con un click.
  openAssetOrPicker(point: MapPoint): void {
    const utilities = this.utilitiesByAsset.get(point.id) ?? [];
    if (utilities.length === 0 || !this.map) {
      this.openDetail(point);
      return;
    }

    const items: { label: string; point: MapPoint }[] = [
      { label: `${point.name} (immobile)`, point },
      ...utilities.map((u) => ({
        label: `${u.hardType ? this.hardTypeLegend.find((t) => t.value === u.hardType)?.label : 'Utenza'} — ${u.name}`,
        point: u,
      })),
    ];

    // Stessa icona/colore del marker mappa per ogni voce — non solo testo
    // ("Luce — UT-1"), coerenza visiva col resto della mappa.
    const listHtml = items
      .map((it, i) => {
        const { iconHtml, color } = this.pointIcon(it.point);
        return `<li data-idx="${i}" class="map-picker-item">
          <span class="map-pin map-pin-inline" style="background:${color}">${iconHtml}</span>
          ${it.label}
        </li>`;
      })
      .join('');

    const popup = L.popup({ closeButton: true, autoPan: true })
      .setLatLng([parseFloat(point.lat), parseFloat(point.lng)])
      .setContent(`<ul class="map-picker-list">${listHtml}</ul>`)
      .openOn(this.map);

    // Il contenuto del popup è innerHTML raw (stessa ragione dei marker
    // divIcon, vedi CLAUDE.md) — bind dei click via delega su querySelectorAll
    // dopo l'apertura, non tramite (click) del template Angular.
    const el = popup.getElement();
    el?.querySelectorAll<HTMLLIElement>('[data-idx]').forEach((li) => {
      li.addEventListener('click', () => {
        const idx = Number(li.dataset['idx']);
        this.map?.closePopup();
        this.openDetail(items[idx].point);
      });
    });
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
