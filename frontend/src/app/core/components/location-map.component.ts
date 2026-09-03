import { Component, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import * as L from 'leaflet';
import { BrandingService } from '../../services/branding.service';

let instanceCounter = 0;

// Fallback usato se le coordinate di default salvate in branding sono
// malformate/non numeriche (es. DTO backend con un vecchio valore invalido) —
// stesse coordinate del seed di migrazione CreateAppSettings (Montesilvano).
const SAFE_DEFAULT_CENTER: L.LatLngExpression = [42.5083, 14.15];

// Icona di default di Leaflet (L.marker senza [icon]) referenzia
// marker-icon.png/marker-icon-2x.png/marker-shadow.png con URL relativo
// calcolato dal CSS — esbuild (build Angular) non li ricopia/risolve, quindi
// il marker prova a caricarli dall'origin dell'app e fallisce con 404. Stesso
// divIcon "a pallino" già usato in map.component.ts: nessuna immagine da
// bundlare, coerente visivamente con la pagina Mappa.
const LOCATION_PIN_ICON = L.divIcon({
  className: '',
  html: '<span class="location-map-pin"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Marker per la posizione stimata da geocodifica (nessuna posizione GPS reale
// ancora salvata) — bordo tratteggiato, stessa convenzione della mappa
// principale (map.component.ts: bordo pieno = GPS reale, tratteggiato =
// stimata). Un click sulla mappa la sostituisce con una posizione reale.
const ESTIMATED_PIN_ICON = L.divIcon({
  className: '',
  html: '<span class="location-map-pin location-map-pin-estimated"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

@Component({
  selector: 'app-location-map',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './location-map.component.html',
  styleUrls: ['./location-map.component.scss'],
})
export class LocationMapComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input() latitude: string | null = null;
  @Input() longitude: string | null = null;
  // Posizione stimata da geocodifica (asset senza GPS reale, vedi
  // AssetEditDialogComponent) — usata solo per pre-posizionare il marker
  // quando latitude/longitude sono vuote, mai scritta nei form controls: un
  // click sulla mappa produce comunque una posizione reale via
  // positionSelected, questo input è puramente un punto di partenza visivo
  // così l'utente vede la stessa stima già mostrata sulla mappa principale
  // invece del centro di default del comune.
  @Input() estimatedLatitude: string | null = null;
  @Input() estimatedLongitude: string | null = null;
  @Input() previewOnly = false;
  @Output() positionSelected = new EventEmitter<{ lat: string; lng: string }>();
  @Output() positionCleared = new EventEmitter<void>();

  readonly canvasId = `location-map-${instanceCounter++}`;
  private map: L.Map | null = null;
  private marker: L.Marker | null = null;

  // Quando previewOnly=true (posizione ereditata dall'immobile) il click
  // sulla mappa parte disattivato — l'utente può riattivarlo esplicitamente
  // col bottone "Imposta posizione propria" (vedi enableOwnPosition()).
  // Senza questo stato, previewOnly veniva letto solo una volta in
  // ngAfterViewInit: un cambio successivo dell'input non riattivava mai il
  // listener, il click sulla mappa restava permanentemente morto per un
  // contatore che eredita la posizione dall'immobile.
  usingOwnPosition = false;

  private brandingService = inject(BrandingService);

  private get DEFAULT_CENTER(): L.LatLngExpression {
    const branding = this.brandingService.current();
    const lat = parseFloat(branding.default_latitude);
    const lng = parseFloat(branding.default_longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return SAFE_DEFAULT_CENTER;
    return [lat, lng];
  }

  ngOnInit(): void {
    // Va impostato qui, non in ngAfterViewInit: gli @Input sono già
    // popolati a questo punto del lifecycle, ma il template non è ancora
    // stato controllato per il primo giro — mutarlo dopo (in
    // ngAfterViewInit, che gira DOPO il primo check) genera
    // ExpressionChangedAfterItHasBeenCheckedError (NG0100) sotto
    // ChangeDetectionStrategy.Eager, verificato in browser.
    this.usingOwnPosition = !this.previewOnly;
  }

  ngAfterViewInit(): void {
    const knownLatLng = this.currentLatLng() ?? this.estimatedLatLng();
    this.map = L.map(this.canvasId).setView(knownLatLng ?? this.DEFAULT_CENTER, knownLatLng ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.renderMarker();

    // Listener attaccato sempre, una volta sola — l'emissione è gated su
    // usingOwnPosition (letto al momento del click, non al bind) invece di
    // bind/unbind condizionato su previewOnly: previewOnly è un @Input che
    // può cambiare dopo l'init (form del genitore), e un bind fatto solo qui
    // in base al suo valore iniziale restava permanentemente morto per un
    // contatore nato con posizione ereditata — il bug segnalato.
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (!this.usingOwnPosition) return;
      this.positionSelected.emit({
        lat: event.latlng.lat.toFixed(6),
        lng: event.latlng.lng.toFixed(6),
      });
    });
  }

  // Bottone "Imposta posizione propria" (template, visibile solo quando
  // previewOnly=true e non ancora attivato) — esce dalla modalità "posizione
  // ereditata" e attiva il click sulla mappa per far scegliere all'utente una
  // posizione reale.
  enableOwnPosition(): void {
    this.usingOwnPosition = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['latitude'] || changes['longitude'] || changes['estimatedLatitude'] || changes['estimatedLongitude']) {
      this.renderMarker();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  clearPosition(): void {
    // Torna alla posizione ereditata (se disponibile) — se il genitore ha
    // un valore estimatedLatitude/Longitude da asset, previewOnly ripartirà
    // true al prossimo giro; il bottone "Imposta posizione propria" deve
    // ricomparire, quindi lo stato interno va resettato qui, non solo
    // aspettando ngOnChanges su previewOnly (che non è tracciato).
    this.usingOwnPosition = false;
    this.positionCleared.emit();
  }

  private currentLatLng(): L.LatLngExpression | null {
    return this.parseLatLng(this.latitude, this.longitude);
  }

  private estimatedLatLng(): L.LatLngExpression | null {
    return this.parseLatLng(this.estimatedLatitude, this.estimatedLongitude);
  }

  private parseLatLng(latitude: string | null, longitude: string | null): L.LatLngExpression | null {
    const lat = parseFloat(latitude ?? '');
    const lng = parseFloat(longitude ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng];
  }

  private renderMarker(): void {
    if (!this.map) return;
    if (this.marker) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
    const realLatLng = this.currentLatLng();
    if (realLatLng) {
      this.marker = L.marker(realLatLng, { icon: LOCATION_PIN_ICON }).addTo(this.map);
      this.map.setView(realLatLng, 16);
      return;
    }
    // Nessuna posizione GPS reale: mostra comunque la stima da geocodifica
    // (stesso punto già visto sulla mappa principale) invece di lasciare la
    // mini-mappa vuota sul centro di default del comune — pin tratteggiato,
    // resta solo visivo finché l'utente non clicca per confermare una
    // posizione reale.
    const estimated = this.estimatedLatLng();
    if (!estimated) return;
    this.marker = L.marker(estimated, { icon: ESTIMATED_PIN_ICON }).addTo(this.map);
    this.map.setView(estimated, 16);
  }
}
