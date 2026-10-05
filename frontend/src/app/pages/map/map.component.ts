import { Component, OnInit, AfterViewInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { openSheet } from '../../core/components/entity-sheet/sheet-utils';
import { EntityNavigatorService } from '../../core/services/entity-navigator.service';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { MapService } from './map.service';
import { MapPoint, UngeolocatedItem, UNGEOLOCATED_REASON_LABELS } from './map-point.entity';
import { MultiSelectComponent } from '../../core/components/multi-select.component';
import { AssetNaturesService } from '../asset-nature/asset-nature.service';
import { AssetNature } from '../asset-nature/entity/asset-nature.entity';
import { AssetFunctionsService } from '../asset-function/asset-function.service';
import { AssetFunction } from '../asset-function/entity/asset-function.entity';
import { ASSET_STATUS_OPTIONS } from '../assets/enum/asset-status.enum';
import { UtilityTypesService } from '../utility-types/utility-types.service';
import { AssetService } from '../assets/asset.service';
import { UtilityService } from '../utilities/utility.service';
import { AssetEditDialogComponent } from '../assets/asset-edit-dialog.component';
import { UtilityEditDialogComponent } from '../utilities/utility-edit-dialog.component';
import { Asset } from '../assets/entity/asset.entity';
import { Utility } from '../utilities/entity/utility.entity';
import { UtilityType } from '../utility-types/entity/utility-type.entity';
import { TOption } from '../../core/types/option.interface';
import { HardType, HardTypeIcon, HardTypeColor } from '../utility-types/enum/hard-type.enum';
import { BrandingService } from '../../services/branding.service';
import { AuthService } from '../../services/auth.service';
import { ICON_FALLBACK } from '../../core/helpers/material-icons';
import { CoordinateHelper } from '../../core/helpers/coordinate.helper';
import { StreetViewHelper } from '../../core/helpers/street-view.helper';
import { ToastService } from '../../core/services/toast.service';
import { PLANT_STATUS_LABEL, PLANT_TYPE_ICON, PLANT_TYPE_LABEL, PLANT_TYPES, PlantStatus } from '../plants/plant.model';

// Marker immobile: icona Material Icons della funzione dell'immobile,
// ICON_FALLBACK se la funzione manca o non ha icona.
const ASSET_COLOR = '#37474f';
const PLANT_COLOR = '#0f766e';
// Contatore senza tipologia associata (dato mancante) — icona neutra.
const UNKNOWN_UTILITY_ICON = 'fa fa-question';
const UNKNOWN_UTILITY_COLOR = '#757575';
// Marker "gruppo" (piu' elementi sovrapposti in modo ambiguo, vedi
// classifyGroup) — colore neutro, distinto da tutti quelli usati per
// i singoli tipi (immobile/acqua/luce/gas/internet), cosi' si riconosce a
// colpo d'occhio come punto speciale prima ancora di leggere i badge.
const GROUP_COLOR = '#7c3aed';

// Marker risultato ricerca indirizzo (searchAddress): L.marker senza [icon]
// referenzia l'icona di default Leaflet (marker-icon.png/marker-shadow.png,
// URL relativo calcolato dal CSS) che esbuild non ricopia/risolve -> 404
// silenzioso, marker invisibile. Stesso divIcon di .map-pin usato per gli
// altri marker della mappa (vedi CLAUDE.md/location-map.component.ts),
// colore distinto per riconoscerlo come risultato ricerca e non un asset.
const SEARCH_MARKER_COLOR = '#e53935';
const SEARCH_MARKER_ICON = L.divIcon({
  className: '',
  html: `<span class="map-pin" style="background:${SEARCH_MARKER_COLOR}"><span class="material-icons">place</span></span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Fallback usato se le coordinate di default salvate in branding sono
// malformate/non numeriche (es. DTO backend con un vecchio valore invalido) —
// stesse coordinate del seed di migrazione CreateAppSettings (Montesilvano).
// Linee tratteggiate verso il punto collegato (ben visibili su stradale e satellite).
const LINK_COLOR = '#ea580c';
const LINK_STYLE: L.PolylineOptions = { dashArray: '6,4', weight: 2.5, color: LINK_COLOR, opacity: 0.9, interactive: false };
const LINK_STYLE_HL: L.PolylineOptions = { ...LINK_STYLE, weight: 5, opacity: 1, dashArray: undefined };

const SAFE_DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15];

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MultiSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  private mapService = inject(MapService);
  private dialog = inject(MatDialog);
  private navigator = inject(EntityNavigatorService);
  private naturesService = inject(AssetNaturesService);
  private functionsService = inject(AssetFunctionsService);
  private utilityTypesService = inject(UtilityTypesService);
  private assetService = inject(AssetService);
  private utilityService = inject(UtilityService);
  private brandingService = inject(BrandingService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  private map: L.Map | null = null;
  private clusterGroup: L.MarkerClusterGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Linee immobile↔contatore quando il contatore ha una posizione propria
  // diversa da quella dell'immobile associato — layer separato, aggiunto
  // direttamente alla mappa (non al clusterGroup): le linee vanno restare
  // visibili anche quando uno dei due marker finisce raggruppato in un
  // cluster, cosa che non succederebbe se stessero nello stesso layer
  // clusterizzato (leaflet.markercluster nasconde i marker raggruppati, non
  // gli oggetti generici come le polyline, ma tenerli fuori evita ambiguità).
  private linksLayer: L.LayerGroup | null = null;

  // Marker temporaneo dell'ultima ricerca indirizzo (searchAddress) — un
  // solo risultato alla volta, rimosso/sostituito alla ricerca successiva o
  // manualmente non serve: resta finche' non se ne cerca un altro.
  private addressSearchMarker: L.Marker | null = null;

  showAssets = new FormControl(true, { nonNullable: true });
  showUtilities = new FormControl(true, { nonNullable: true });
  showPlants = new FormControl(true, { nonNullable: true });
  plantTypes = new FormControl<string[]>([], {nonNullable: true});
  plantTypeOptions: TOption[] = PLANT_TYPES.map((t) => ({ label: PLANT_TYPE_LABEL[t], value: t, icon: PLANT_TYPE_ICON[t] }));
  utilityTypeIds = new FormControl<number[]>([], {nonNullable: true});
  natureIds = new FormControl<number[]>([], {nonNullable: true});
  functionIds = new FormControl<number[]>([], {nonNullable: true});
  // Di default niente dismessi/cessati: si includono dai filtri del livello.
  statuses = new FormControl<string[]>(['Attivo', 'Da verificare'], {nonNullable: true});
  plantStatuses = new FormControl<string[]>(['ACTIVE', 'TO_VERIFY'], {nonNullable: true});
  plantStatusOptions: TOption[] = (Object.keys(PLANT_STATUS_LABEL) as PlantStatus[])
    .map((s) => ({ label: PLANT_STATUS_LABEL[s], value: s }));
  includeInactiveUtilities = new FormControl(false, { nonNullable: true });
  // Ricerca unica: un immobile in anagrafica (suggerimenti) oppure, con
  // Invio o "Cerca indirizzo", un indirizzo qualsiasi (geocodifica).
  search = new FormControl<string>('', { nonNullable: true });
  searchMatches: TOption[] = [];
  // Ultimo testo digitato (il controllo può contenere l'id dell'opzione scelta).
  searchText = '';
  // Pannello e livelli (sezioni aperte), conteggi dei punti visibili per livello.
  panelOpen = true;
  expanded: Record<'asset' | 'utility' | 'plant', boolean> = { asset: false, utility: false, plant: false };
  layerCounts: Record<'asset' | 'utility' | 'plant', number> = { asset: 0, utility: 0, plant: 0 };
  private reload$ = new Subject<void>();

  utilityTypeOptions: TOption[] = [];
  natureOptions: TOption[] = [];
  functionOptions: TOption[] = [];
  statusOptions: TOption[] = ASSET_STATUS_OPTIONS;
  assetSearchOptions: TOption[] = [];
  ungeolocated: UngeolocatedItem[] = [];
  reasonLabels = UNGEOLOCATED_REASON_LABELS;
  hardTypeLegend = HardType.items();

  // Popolata a ogni renderPoints() — usata solo per la ricerca "vai a edificio",
  // per centrare la mappa su un asset anche se raggruppato in un cluster (i
  // marker di leaflet.markercluster non sono in un layer group ricercabile
  // direttamente per id).
  private assetMarkers = new Map<number, L.Marker>();

  // Popolata a ogni renderPoints() — stesso motivo di assetMarkers ma per le
  // utenze: serve a "Vai al punto reale sulla mappa" nel selettore
  // (openAssetOrPicker) quando un contatore elencato sotto un immobile ha in
  // realta' una posizione propria diversa (vedi isElsewhere sotto).
  private utilityMarkers = new Map<number, L.Marker>();

  // Popolata a ogni renderPoints() — utenze collegate a ciascun asset, usata
  // dal marker immobile per offrire un selettore quando ha contatori
  // sovrapposti (vedi openAssetOrPicker): senza, un click sul marker
  // immobile apriva SEMPRE e SOLO la scheda immobile, i marker utenza
  // sottostanti (stessa posizione, nessun GPS proprio) restavano
  // irraggiungibili — un click Leaflet colpisce solo il marker più in alto
  // nello z-order, non c'è "fan out" automatico fuori dai cluster.
  private utilitiesByAsset = new Map<number, MapPoint[]>();

  // Come utilitiesByAsset, per gli impianti (utenze collegate) e per gli
  // immobili (impianti collegati): badge ed elenco del marker principale.
  private utilitiesByPlant = new Map<number, MapPoint[]>();
  private plantsByAsset = new Map<number, MapPoint[]>();
  // Stesso scopo di utilityMarkers, per "vai al punto reale" degli impianti.
  private plantMarkers = new Map<number, L.Marker>();

  // Popolate dalle subscribe indipendenti sotto (classificazioni/tipi e
  // asset/utenze possono arrivare in ordine qualsiasi) — rebuild*Options()
  // combina ciascuna coppia appena entrambe sono disponibili.
  private natures: AssetNature[] = [];
  private functions: AssetFunction[] = [];
  private assetsForCount: Asset[] = [];
  private utilityTypes: UtilityType[] = [];
  private utilitiesForCount: Utility[] = [];

  ngOnInit(): void {
    this.naturesService.search({ deleted: false } as never).subscribe({
      next: (data) => {
        this.natures = data;
        this.rebuildClassificationOptions();
      },
    });
    this.functionsService.search({ deleted: false } as never).subscribe({
      next: (data) => {
        this.functions = data;
        this.rebuildClassificationOptions();
      },
    });
    this.utilityTypesService.search({ deleted: false }).subscribe({
      next: (data) => {
        this.utilityTypes = data;
        this.rebuildUtilityTypeOptions();
      },
    });
    this.assetService.search({ deleted: false }).subscribe({
      next: (data) => {
        this.assetsForCount = data;
        this.rebuildClassificationOptions();
        this.assetSearchOptions = data.map((a) => ({
          label: a.address ? `${a.asset_name} — ${a.address}` : a.asset_name,
          value: a.id,
        }));
      },
    });
    this.utilityService.search({ deleted: false }).subscribe({
      next: (data) => {
        this.utilitiesForCount = data;
        this.rebuildUtilityTypeOptions();
      },
    });

    // Una richiesta alla volta (switchMap): una risposta vecchia non
    // sovrascrive quella dei filtri correnti; debounce per le multi-select.
    this.reload$
      .pipe(
        debounceTime(150),
        switchMap(() =>
          this.mapService.getPoints(this.currentFilters()).pipe(
            catchError((err) => {
              console.error('Errore nel caricamento dei punti mappa:', err);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((response) => {
        if (!response) return;
        this.renderPoints(response.points);
        this.ungeolocated = response.ungeolocated;
      });
    for (const c of [this.showAssets, this.showUtilities, this.showPlants, this.plantTypes, this.plantStatuses,
      this.utilityTypeIds, this.includeInactiveUtilities, this.natureIds, this.functionIds, this.statuses]) {
      (c.valueChanges as Observable<unknown>).subscribe(() => this.reload());
    }
    this.search.valueChanges.subscribe((text) => this.updateSearchMatches(text));
  }

  // Icona (stessa dei marker immobile) + conteggio immobili sul totale non
  // filtrato (assetsForCount viene da una search indipendente dai filtri
  // mappa correnti), altrimenti il numero cambierebbe ad ogni filtro attivo.
  // Ricostruite da qualunque delle tre subscribe arrivi per ultima.
  private rebuildClassificationOptions(): void {
    const countBy = (key: 'nature_id' | 'function_id') => {
      const counts = new Map<number, number>();
      for (const a of this.assetsForCount) {
        const id = a[key];
        if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return counts;
    };
    const natureCounts = countBy('nature_id');
    const functionCounts = countBy('function_id');
    this.natureOptions = this.natures.map((n) => ({
      label: n.name,
      value: n.id,
      icon: n.icon || 'category',
      count: natureCounts.get(n.id) ?? 0,
    }));
    this.functionOptions = this.functions.map((f) => ({
      label: f.name,
      value: f.id,
      icon: f.icon || ICON_FALLBACK,
      count: functionCounts.get(f.id) ?? 0,
    }));
  }

  // Stesso pattern di rebuildClassificationOptions: icona per hard_type
  // (HardTypeIcon, Font Awesome — stessa usata sui marker/legenda) + conteggio
  // utenze sul totale non filtrato.
  private rebuildUtilityTypeOptions(): void {
    if (this.utilityTypes.length === 0) return;
    const countByTypeId = new Map<number, number>();
    for (const u of this.utilitiesForCount) {
      if (u.utility_type_id_fk == null) continue;
      countByTypeId.set(u.utility_type_id_fk, (countByTypeId.get(u.utility_type_id_fk) ?? 0) + 1);
    }
    this.utilityTypeOptions = this.utilityTypes.map((t) => ({
      label: t.name,
      value: t.id,
      icon: HardTypeIcon[t.hard_type],
      count: countByTypeId.get(t.id) ?? 0,
    }));
  }

  // Invocato da (keyup.enter) sul campo ricerca indirizzo — chiama il
  // backend (Nominatim, throttle/backoff gia' gestiti li') e centra/zooma
  // sul risultato con un marker temporaneo. Nessun match: toast, nessun
  // errore rumoroso in console (indirizzo-non-trovato e' normale, non un
  // guasto).
  // L'autocomplete scrive per un attimo il valore dell'opzione (id o null):
  // conta solo il testo digitato.
  private updateSearchMatches(text: unknown): void {
    if (typeof text !== 'string') return;
    this.searchText = text.trim();
    const q = this.searchText.toLowerCase();
    this.searchMatches = q.length < 2 ? [] : this.assetSearchOptions
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 8);
  }

  // Suggerimento scelto: un immobile (id) oppure "Cerca indirizzo" (null).
  onSearchSelected(event: MatAutocompleteSelectedEvent): void {
    const value = event.option.value as number | null;
    if (value == null) {
      this.search.setValue(this.searchText, { emitEvent: false });
      this.searchAddress();
      return;
    }
    const label = this.assetSearchOptions.find((o) => o.value === value)?.label ?? '';
    this.search.setValue(label, { emitEvent: false });
    this.goToAsset(value);
  }

  activeFilters(layer: 'asset' | 'utility' | 'plant'): number {
    if (layer === 'asset') return [this.natureIds, this.functionIds].filter((c) => c.value.length).length;
    if (layer === 'utility') return (this.utilityTypeIds.value.length ? 1 : 0) + (this.includeInactiveUtilities.value ? 1 : 0);
    return this.plantTypes.value.length ? 1 : 0;
  }

  searchAddress(): void {
    const q = this.searchText;
    if (!q || !this.map) return;

    this.mapService.geocode(q).subscribe({
      next: (result) => {
        if (!result || !this.map) {
          this.toastService.add({ severity: 'warn', summary: 'Indirizzo non trovato' });
          return;
        }
        const lat = CoordinateHelper.parseCoordinate(result.lat);
        const lng = CoordinateHelper.parseCoordinate(result.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        if (this.addressSearchMarker) this.map.removeLayer(this.addressSearchMarker);
        this.addressSearchMarker = L.marker([lat, lng], { icon: SEARCH_MARKER_ICON }).addTo(this.map);
        this.map.setView([lat, lng], 18);
      },
      error: () => this.toastService.add({ severity: 'error', summary: 'Errore nella ricerca indirizzo' }),
    });
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

    // Asset non presente tra i punti mappati correnti (es. escluso da un
    // filtro attivo, o non geolocalizzato) — apri comunque la scheda.
    this.openDetail({ id, type: 'asset' } as UngeolocatedItem);
  }

  // Usato dal selettore contatori (openAssetOrPicker) per "Vai al punto
  // reale sulla mappa" — un contatore elencato sotto un immobile puo' avere
  // una posizione propria diversa (isElsewhere), il suo marker vero e proprio
  // e' altrove, spesso in un cluster diverso. Stesso pattern di goToAsset.
  private goToUtility(id: number): void {
    if (!this.map) return;
    const marker = this.utilityMarkers.get(id);
    if (!marker || !this.clusterGroup) return;
    this.clusterGroup.zoomToShowLayer(marker, () => {
      this.map?.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 18));
    });
  }

  private goToPlant(id: number): void {
    if (!this.map) return;
    const marker = this.plantMarkers.get(id);
    if (!marker || !this.clusterGroup) return;
    this.clusterGroup.zoomToShowLayer(marker, () => {
      this.map?.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 18));
    });
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
    const brandingLat = CoordinateHelper.parseCoordinate(branding.default_latitude);
    const brandingLng = CoordinateHelper.parseCoordinate(branding.default_longitude);
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
    this.linksLayer = L.layerGroup().addTo(this.map);
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

    // Click destro su un punto vuoto della mappa — menu "Aggiungi immobile
    // qui / Aggiungi contatore qui" con le coordinate del click.
    this.map.on('contextmenu', (event: L.LeafletMouseEvent) => this.openAddPicker(event.latlng));
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private reload(): void {
    this.reload$.next();
  }

  private currentFilters() {
    return {
        showAssets: this.showAssets.value,
        showUtilities: this.showUtilities.value,
        showPlants: this.showPlants.value,
        plantTypes: this.plantTypes.value,
        natureIds: this.natureIds.value,
        functionIds: this.functionIds.value,
        statuses: this.statuses.value,
        utilityTypeIds: this.utilityTypeIds.value,
        plantStatuses: this.plantStatuses.value,
        includeInactiveUtilities: this.includeInactiveUtilities.value,
    };
  }

  private renderPoints(points: MapPoint[]): void {
    if (!this.clusterGroup) return;
    this.clusterGroup.clearLayers();
    this.linksLayer?.clearLayers();
    this.assetMarkers.clear();
    this.utilityMarkers.clear();
    this.plantMarkers.clear();
    const countOf = (t: MapPoint['type']) => new Set(points.filter((p) => p.type === t).map((p) => p.id)).size;
    this.layerCounts = { asset: countOf('asset'), utility: countOf('utility'), plant: countOf('plant') };

    // Posizioni di immobili e impianti, per le linee tratteggiate verso i
    // collegati che stanno in un punto diverso (un'utenza che eredita la
    // posizione non deve produrre una linea di lunghezza zero).
    const latLngOf = (p: MapPoint) => ({
      lat: CoordinateHelper.parseCoordinate(p.lat),
      lng: CoordinateHelper.parseCoordinate(p.lng),
    });
    const assetLatLngById = new Map<number, { lat: number; lng: number }>();
    const plantLatLngById = new Map<number, { lat: number; lng: number }>();
    const assetNameById = new Map<number, string>();
    for (const p of points) {
      const ll = latLngOf(p);
      if (Number.isNaN(ll.lat) || Number.isNaN(ll.lng)) continue;
      if (p.type === 'asset') {
        assetNameById.set(p.id, p.name);
        assetLatLngById.set(p.id, ll);
      } else if (p.type === 'plant') {
        plantLatLngById.set(p.id, ll);
      }
    }

    // Collegati di immobili e impianti, ovunque si trovino: alimentano i
    // badge del marker principale e il suo elenco (con "vai al punto reale"
    // per quelli che stanno altrove).
    this.utilitiesByAsset.clear();
    this.utilitiesByPlant.clear();
    this.plantsByAsset.clear();
    const push = (map: Map<number, MapPoint[]>, key: number, p: MapPoint) => {
      const list = map.get(key) ?? [];
      if (!list.some((x) => x.type === p.type && x.id === p.id)) list.push(p);
      map.set(key, list);
    };
    for (const p of points) {
      if (p.type === 'utility' && p.assetId != null) push(this.utilitiesByAsset, p.assetId, p);
      if (p.type === 'utility' && p.plantId != null) push(this.utilitiesByPlant, p.plantId, p);
      if (p.type === 'plant' && p.assetId != null) push(this.plantsByAsset, p.assetId, p);
    }

    // Hover: marker e linee per chiave "tipo:id", per evidenziare i collegati.
    const keyOf = (p: { type: MapPoint['type']; id: number }) => `${p.type}:${p.id}`;
    const markersByKey = new Map<string, L.Marker[]>();
    const linesByKey = new Map<string, L.Polyline[]>();
    const relations: { marker: L.Marker; keys: Set<string> }[] = [];
    const addTo = <T>(map: Map<string, T[]>, key: string, v: T) => map.set(key, [...(map.get(key) ?? []), v]);

    // Tutti i punti sulla stessa coordinata diventano un solo marker.
    const pointsByCoord = new Map<string, MapPoint[]>();
    for (const p of points) {
      const { lat, lng } = latLngOf(p);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      const key = `${lat},${lng}`;
      const list = pointsByCoord.get(key) ?? [];
      list.push(p);
      pointsByCoord.set(key, list);
    }

    for (const group of pointsByCoord.values()) {
      const { lat, lng } = latLngOf(group[0]);
      const kind = this.classifyGroup(group);
      let iconHtml: string;
      let color: string;
      let badgeHtml = '';
      let pinTitle: string;
      let principal: MapPoint | null = null;
      let members: MapPoint[] = [];
      let pinClass = '';

      if (kind.type === 'principal') {
        // Immobile (o impianto, o elemento singolo) con i suoi collegati:
        // icona del principale, badge utenze sotto e impianti sopra.
        principal = kind.principal;
        members = this.membersOf(principal, group);
        ({ iconHtml, color } = this.pointIcon(principal));
        const utilities = members.filter((m) => m.type === 'utility').length;
        const plants = members.filter((m) => m.type === 'plant').length;
        badgeHtml =
          (plants > 0
            ? `<span class="map-pin-badge map-pin-badge--group map-pin-badge--plants"
                 data-badge-filter="plant" title="${plants} impianti collegati — clicca per vederli">
                 <span class="material-icons">settings_input_component</span>${plants}
               </span>`
            : '') +
          (utilities > 0
            ? `<span class="map-pin-badge map-pin-badge--group map-pin-badge--utilities"
                 data-badge-filter="utility" title="${utilities} utenze collegate — clicca per vederle">
                 <span class="material-icons">speed</span>${utilities}
               </span>`
            : '');
        pinTitle = this.pointLabel(principal);
      } else if (kind.type === 'stack') {
        // Più elementi uguali (es. due contatori acqua) senza un principale:
        // icona del tipo "impilata" e conteggio.
        ({ iconHtml, color } = this.pointIcon(group[0]));
        pinClass = ' map-pin--stack';
        iconHtml = `<span class="map-pin-stack-icons">${iconHtml}${iconHtml}</span>`;
        badgeHtml = `<span class="map-pin-badge map-pin-badge--group map-pin-badge--utilities"
             title="${group.length} elementi uguali in questo punto — clicca per vederli">${group.length}</span>`;
        pinTitle = `${group.length} elementi uguali in questo punto — clicca per vederli`;
      } else {
        // Elementi diversi senza un principale: marker gruppo, con i badge
        // della composizione (clic su un badge = elenco filtrato).
        const count = (t: MapPoint['type']) => group.filter((g) => g.type === t).length;
        color = GROUP_COLOR;
        iconHtml = `<span class="material-icons">layers</span>`;
        const badge = (t: 'asset' | 'utility' | 'plant', cls: string, icon: string, what: string) =>
          count(t) > 0
            ? `<span class="map-pin-badge map-pin-badge--group ${cls}" data-badge-filter="${t}"
                 title="${count(t)} ${what} in questo punto — clicca per vederli">
                 <span class="material-icons">${icon}</span>${count(t)}
               </span>`
            : '';
        badgeHtml =
          badge('asset', 'map-pin-badge--buildings', 'holiday_village', 'immobili') +
          badge('utility', 'map-pin-badge--utilities', 'speed', 'utenze') +
          (count('asset') > 0 ? '' : badge('plant', 'map-pin-badge--plants', 'settings_input_component', 'impianti'));
        pinTitle = `${group.length} elementi in questo punto — clicca per vederli`;
      }

      const hasBigBadge = badgeHtml !== '';
      const wrapClass = hasBigBadge ? ' map-marker-wrap--group' : '';
      const [iconSize, iconAnchor]: [[number, number], [number, number]] = hasBigBadge
        ? [[34, 34], [17, 17]]
        : [[26, 26], [13, 13]];
      const borderStyle = (principal ?? group[0]).source === 'gps' ? 'solid' : 'dashed';
      if ((principal ?? group[0]).inactive && (principal || group.every((g) => g.inactive))) pinClass += ' map-pin--inactive';
      const icon = L.divIcon({
        className: '',
        html: `<span class="map-marker-wrap${wrapClass}"><span class="map-pin${pinClass}" style="background:${color};border-style:${borderStyle};--pin-color:${color}" title="${this.escapeAttr(pinTitle)}">${iconHtml}</span>${badgeHtml}</span>`,
        iconSize,
        iconAnchor,
      });

      // Gli immobili restano sopra a utenze/impianti di cluster vicini.
      const marker = L.marker([lat, lng], { icon, zIndexOffset: principal?.type === 'asset' ? 1000 : 0 });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        // Click su un badge: elenco già filtrato per tipo (data-badge-filter,
        // letto dal target dell'evento nativo: i marker in un cluster chiuso
        // non hanno DOM su cui mettere listener separati).
        const badgeEl = (e.originalEvent?.target as HTMLElement | null)?.closest('[data-badge-filter]');
        const filterType = (badgeEl?.getAttribute('data-badge-filter') ?? undefined) as
          | 'asset'
          | 'utility'
          | 'plant'
          | undefined;
        if (principal) {
          if (filterType) this.openMembersPicker(principal, members, filterType);
          else this.openDetail(principal);
        } else {
          this.openCombinedPicker(group, assetNameById, lat, lng, filterType);
        }
      });
      this.clusterGroup.addLayer(marker);
      // Collegati: il gruppo, i membri del principale e i "padri" (immobile/impianto).
      const keys = new Set<string>([...group, ...members].map(keyOf));
      for (const p of group) {
        if (p.assetId != null) keys.add(`asset:${p.assetId}`);
        if (p.plantId != null) keys.add(`plant:${p.plantId}`);
      }
      group.forEach((p) => addTo(markersByKey, keyOf(p), marker));
      relations.push({ marker, keys });
      for (const p of group) {
        if (p.type === 'asset') this.assetMarkers.set(p.id, marker);
        else if (p.type === 'plant') this.plantMarkers.set(p.id, marker);
        else if (!this.utilityMarkers.has(p.id)) this.utilityMarkers.set(p.id, marker);
      }
    }

    // Linee tratteggiate verso il "padre" quando sta in un punto diverso:
    // utenza → immobile (o, senza immobile, → impianto), impianto → immobile.
    const line = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, a: string, b: string) => {
      if (!this.linksLayer || (from.lat === to.lat && from.lng === to.lng)) return;
      const pl = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        { ...LINK_STYLE },
      ).addTo(this.linksLayer);
      addTo(linesByKey, a, pl);
      addTo(linesByKey, b, pl);
    };
    for (const p of points) {
      const ll = latLngOf(p);
      if (Number.isNaN(ll.lat) || Number.isNaN(ll.lng)) continue;
      if (p.type === 'utility') {
        const asset = p.assetId != null ? assetLatLngById.get(p.assetId) : undefined;
        const plant = p.plantId != null ? plantLatLngById.get(p.plantId) : undefined;
        if (asset) line(asset, ll, `asset:${p.assetId}`, keyOf(p));
        else if (plant) line(plant, ll, `plant:${p.plantId}`, keyOf(p));
      } else if (p.type === 'plant' && p.assetId != null) {
        const asset = assetLatLngById.get(p.assetId);
        if (asset) line(asset, ll, `asset:${p.assetId}`, keyOf(p));
      }
    }

    // Mouse su un marker: si ingrandiscono anche i marker collegati e si
    // evidenziano le linee (i marker dentro un cluster chiuso non hanno DOM).
    for (const { marker, keys } of relations) {
      const highlight = (on: boolean) => {
        for (const k of keys) {
          for (const m of markersByKey.get(k) ?? []) {
            if (m !== marker) m.getElement()?.classList.toggle('map-marker--related', on);
          }
          for (const pl of linesByKey.get(k) ?? []) pl.setStyle(on ? LINK_STYLE_HL : LINK_STYLE);
        }
      };
      marker.on('mouseover', () => highlight(true));
      marker.on('mouseout', () => highlight(false));
    }
  }

  // Chi rappresenta un punto con più elementi sovrapposti:
  // - un solo immobile, e tutto il resto è suo (sue utenze, suoi impianti e le
  //   loro utenze) → l'immobile;
  // - nessun immobile, un solo impianto con sole sue utenze → l'impianto;
  // - un solo elemento → lui;
  // - elementi tutti dello stesso tipo (stessa tipologia di utenza o di
  //   impianto) → pila;
  // - altrimenti gruppo misto.
  private classifyGroup(group: MapPoint[]):
    | { type: 'principal'; principal: MapPoint }
    | { type: 'stack' }
    | { type: 'mixed' } {
    if (group.length === 1) return { type: 'principal', principal: group[0] };
    const assets = group.filter((g) => g.type === 'asset');
    const plants = group.filter((g) => g.type === 'plant');
    if (assets.length === 1) {
      const a = assets[0];
      const plantIds = new Set(plants.filter((p) => p.assetId === a.id).map((p) => p.id));
      const belongs = (g: MapPoint) =>
        g === a ||
        (g.type === 'plant' && g.assetId === a.id) ||
        (g.type === 'utility' && (g.assetId === a.id || (g.plantId != null && plantIds.has(g.plantId))));
      if (group.every(belongs)) return { type: 'principal', principal: a };
    }
    if (assets.length === 0 && plants.length === 1) {
      const pl = plants[0];
      if (group.every((g) => g === pl || (g.type === 'utility' && g.plantId === pl.id))) {
        return { type: 'principal', principal: pl };
      }
    }
    const first = group[0];
    const sameKind = group.every(
      (g) =>
        g.type === first.type &&
        g.type !== 'asset' &&
        (g.type === 'utility' ? g.hardType === first.hardType : g.plantType === first.plantType),
    );
    return sameKind ? { type: 'stack' } : { type: 'mixed' };
  }

  // Collegati del principale: quelli nello stesso punto più quelli altrove
  // (utenze con GPS proprio, impianti con posizione propria).
  private membersOf(principal: MapPoint, group: MapPoint[]): MapPoint[] {
    const out: MapPoint[] = [];
    const add = (p: MapPoint) => {
      if (p !== principal && !out.some((x) => x.type === p.type && x.id === p.id)) out.push(p);
    };
    group.forEach(add);
    if (principal.type === 'asset') {
      (this.utilitiesByAsset.get(principal.id) ?? []).forEach(add);
      (this.plantsByAsset.get(principal.id) ?? []).forEach(add);
    } else if (principal.type === 'plant') {
      (this.utilitiesByPlant.get(principal.id) ?? []).forEach(add);
    }
    return out;
  }

  // Nomi asset/utenza sono editabili da form (non input arbitrario di terzi,
  // ma comunque testo libero) — usato per i title attribute inseriti come
  // HTML raw nei marker/badge, non basta interpolare la stringa cosi' com'e'
  // se contiene virgolette doppie (romperebbe l'attributo, non l'HTML circostante).
  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // Icona+colore di un punto — fattorizzato perché serve sia al marker sulla
  // mappa (renderPoints) sia alle voci del popup di scelta immobile/contatori
  // (openAssetOrPicker), stessa resa in entrambi i posti.
  private pointIcon(point: MapPoint): { iconHtml: string; color: string } {
    if (point.type === 'plant') {
      const icon = point.plantType ? PLANT_TYPE_ICON[point.plantType] : 'settings_input_component';
      return { iconHtml: `<span class="material-icons">${icon}</span>`, color: PLANT_COLOR };
    }
    const isAsset = point.type === 'asset';
    const color = isAsset ? ASSET_COLOR : (point.hardType ? HardTypeColor[point.hardType] : UNKNOWN_UTILITY_COLOR);
    // Gli immobili usano l'icona Material della funzione (personalizzabile
    // in anagrafica funzioni); le
    // utenze restano su Font Awesome (HardTypeIcon), invariato.
    const iconHtml = isAsset
      ? `<span class="material-icons">${point.icon || ICON_FALLBACK}</span>`
      : `<i class="${point.hardType ? HardTypeIcon[point.hardType] : UNKNOWN_UTILITY_ICON}"></i>`;
    return { iconHtml, color };
  }

  // Etichetta di un punto (tooltip pin e voci dei popup di scelta).
  private pointLabel(point: MapPoint): string {
    if (point.type === 'asset') return `${point.name} (immobile)`;
    if (point.type === 'plant') {
      return `${point.plantType ? PLANT_TYPE_LABEL[point.plantType] : 'Impianto'} — ${point.name}`;
    }
    return `${point.hardType ? this.hardTypeLegend.find((t) => t.value === point.hardType)?.label : 'Utenza'} — ${point.name}`;
  }

  // Immobile scelto dal popup di un gruppo misto: elenco dei suoi collegati
  // (o scheda diretta se non ne ha).
  openAssetOrPicker(point: MapPoint): void {
    const members = this.membersOf(point, [point]);
    if (!members.length) {
      this.openDetail(point);
      return;
    }
    this.openMembersPicker(point, members);
  }

  // Elenco di un marker principale (immobile o impianto) e dei suoi
  // collegati, filtrato per tipo se aperto da un badge. I collegati che
  // stanno in un altro punto (GPS o posizione propria) hanno il pulsante
  // "vai al punto reale" invece di confondersi con quelli davvero qui.
  private openMembersPicker(principal: MapPoint, members: MapPoint[], filterType?: 'asset' | 'utility' | 'plant'): void {
    if (!this.map) return;
    const lat = CoordinateHelper.parseCoordinate(principal.lat);
    const lng = CoordinateHelper.parseCoordinate(principal.lng);
    const order = {asset: 0, plant: 1, utility: 2} as const;
    const listed = [...(filterType ? members.filter((m) => m.type === filterType) : members)]
      .sort((x, y) => order[x.type] - order[y.type]);
    const items = [
      ...(filterType ? [] : [{ point: principal, elsewhere: false }]),
      ...listed.map((m) => ({
        point: m,
        elsewhere:
          CoordinateHelper.parseCoordinate(m.lat) !== lat || CoordinateHelper.parseCoordinate(m.lng) !== lng,
      })),
    ];

    const listHtml = items
      .map((it, i) => {
        const { iconHtml, color } = this.pointIcon(it.point);
        const elsewhereBtn = it.elsewhere
          ? `<button type="button" data-goto-idx="${i}" class="map-picker-goto"
               title="In un altro punto — vai alla posizione reale sulla mappa">
               <span class="material-icons">near_me</span>
             </button>`
          : '';
        return `<li data-idx="${i}" class="map-picker-item${it.elsewhere ? ' map-picker-item--elsewhere' : ''}">
          <span class="map-pin map-pin-inline" style="background:${color}">${iconHtml}</span>
          <span class="map-picker-item-label">${this.escapeAttr(this.pointLabel(it.point))}</span>
          ${elsewhereBtn}
        </li>`;
      })
      .join('');

    const popup = L.popup({ closeButton: true, autoPan: true })
      .setLatLng([lat, lng])
      .setContent(`<ul class="map-picker-list">${listHtml}</ul>`)
      .openOn(this.map);

    // Contenuto innerHTML raw (come i marker divIcon): click legati dopo
    // l'apertura, non dal template Angular.
    const el = popup.getElement();
    el?.querySelectorAll<HTMLLIElement>('[data-idx]').forEach((li) => {
      li.addEventListener('click', () => {
        this.map?.closePopup();
        this.openDetail(items[Number(li.dataset['idx'])].point);
      });
    });
    el?.querySelectorAll<HTMLButtonElement>('[data-goto-idx]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const target = items[Number(btn.dataset['gotoIdx'])].point;
        this.map?.closePopup();
        if (target.type === 'utility') this.goToUtility(target.id);
        else if (target.type === 'plant') this.goToPlant(target.id);
        else this.goToAsset(target.id);
      });
    });
  }

  // Punto con piu' di un elemento sovrapposto in modo "ambiguo" (vedi
  // classifyGroup in renderPoints): piu' immobili, o un contatore che
  // non appartiene all'unico immobile qui presente. Un solo popup con tutto
  // insieme (immobili e contatori mescolati, ordinati con gli immobili
  // prima) — cliccare un immobile apre comunque il SUO selettore
  // (openAssetOrPicker, che gestisce le sue proprie utenze come sempre),
  // cliccare un contatore apre subito il dettaglio. Mostra anche l'immobile
  // associato a ogni contatore (assetNameById) perche' qui, a differenza del
  // caso semplice, non e' scontato che sia lo stesso per tutti.
  private openCombinedPicker(
    group: MapPoint[],
    assetNameById: Map<number, string>,
    lat: number,
    lng: number,
    filterType?: 'asset' | 'utility' | 'plant',
  ): void {
    if (!this.map) return;

    const filtered = filterType ? group.filter((p) => p.type === filterType) : group;
    const sorted = [...filtered].sort((a, b) => (a.type === b.type ? 0 : a.type === 'asset' ? -1 : 1));

    const listHtml = sorted
      .map((p, i) => {
        const { iconHtml, color } = this.pointIcon(p);
        const label =
          p.type === 'utility'
            ? `${this.pointLabel(p)} <small>(${p.assetId != null ? (assetNameById.get(p.assetId) ?? '?') : '—'})</small>`
            : this.pointLabel(p);
        return `<li data-idx="${i}" class="map-picker-item">
          <span class="map-pin map-pin-inline" style="background:${color}">${iconHtml}</span>
          <span class="map-picker-item-label">${label}</span>
        </li>`;
      })
      .join('');

    const popup = L.popup({ closeButton: true, autoPan: true })
      .setLatLng([lat, lng])
      .setContent(`<ul class="map-picker-list">${listHtml}</ul>`)
      .openOn(this.map);

    const el = popup.getElement();
    el?.querySelectorAll<HTMLLIElement>('[data-idx]').forEach((li) => {
      li.addEventListener('click', () => {
        const idx = Number(li.dataset['idx']);
        const target = sorted[idx];
        this.map?.closePopup();
        if (target.type === 'asset') this.openAssetOrPicker(target);
        else this.openDetail(target);
      });
    });
  }

  openDetail(point: MapPoint | UngeolocatedItem): void {
    if (point.type === 'plant') {
      this.navigator.openPlant(point.id).subscribe((saved) => {
        if (saved) this.reload();
      });
      return;
    }
    const opened: Observable<unknown> = point.type === 'asset'
      ? this.navigator.openAsset(point.id)
      : this.navigator.openUtility(point.id);
    opened.subscribe((saved) => {
      if (saved) this.reload();
    });
  }

  // Popup "Aggiungi immobile qui / Aggiungi contatore qui" al click destro
  // su un punto vuoto della mappa — stesso pattern DOM/delega di
  // openAssetOrPicker (innerHTML raw, bind dei click dopo l'apertura).
  private openAddPicker(latlng: L.LatLng): void {
    if (!this.map) return;
    const lat = latlng.lat.toFixed(6);
    const lng = latlng.lng.toFixed(6);

    const items = [
      { label: 'Aggiungi immobile qui', action: () => this.createAssetAt(lat, lng) },
      { label: 'Aggiungi contatore qui', action: () => this.createUtilityAt(lat, lng) },
      { label: 'Apri Street View qui', action: () => StreetViewHelper.open(lat, lng) },
    ];
    const listHtml = items
      .map((it, i) => `<li data-idx="${i}" class="map-picker-item">${it.label}</li>`)
      .join('');

    const popup = L.popup({ closeButton: true, autoPan: true })
      .setLatLng(latlng)
      .setContent(`<ul class="map-picker-list">${listHtml}</ul>`)
      .openOn(this.map);

    const el = popup.getElement();
    el?.querySelectorAll<HTMLLIElement>('[data-idx]').forEach((li) => {
      li.addEventListener('click', () => {
        const idx = Number(li.dataset['idx']);
        this.map?.closePopup();
        items[idx].action();
      });
    });
  }

  private createAssetAt(lat: string, lng: string): void {
    const userId = this.authService.getCurrentUser()?.id;
    openSheet(this.dialog, AssetEditDialogComponent, { mode: 'create', item: Asset.create({ latitude: lat, longitude: lng }) })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.assetService
          .create({ ...result, created_by_user_id: userId, updated_by_user_id: userId })
          .subscribe(() => this.reload());
      });
  }

  private createUtilityAt(lat: string, lng: string): void {
    const userId = this.authService.getCurrentUser()?.id;
    openSheet(this.dialog, UtilityEditDialogComponent, { mode: 'create', item: Utility.create({ latitude: lat, longitude: lng }) })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.utilityService
          .create({ ...result, created_by_user_id: userId, updated_by_user_id: userId })
          .subscribe(() => this.reload());
      });
  }
}
